<?php
declare(strict_types=1);

namespace Vohra\Services;

use Vohra\Core\Database;
use Vohra\Core\HttpException;
use Vohra\Core\Validator;
use Vohra\Repositories\CouponRepository;
use Vohra\Repositories\CustomerRepository;
use Vohra\Repositories\OrderRepository;
use Vohra\Repositories\ProductRepository;

/**
 * Order lifecycle: create (with stock + coupon accounting), status changes, edits and deletion.
 * Stock is deducted when an order is created and returned when it is cancelled or deleted before dispatch.
 */
final class OrderService
{
    /** Statuses in which goods are still in the warehouse. */
    private const RESTOCKABLE = ['placed', 'packed'];

    public static function create(array $input, string $source, ?int $adminId = null): array
    {
        $data = Validator::make($input, [
            'customer_name'  => 'required|string|max:120',
            'customer_email' => 'required|email|max:190',
            'customer_phone' => 'required|phone',
            'address_line1'  => 'required|string|max:190',
            'address_line2'  => 'string|max:190',
            'city'           => 'required|string|max:80',
            'state'          => 'required|string|max:80',
            'pin'            => 'required|pin',
            'payment_method' => 'required|in:razorpay,cod',
            'payment_status' => 'nullable|in:pending,paid,failed,refunded',
            'coupon_code'    => 'nullable|string|max:40',
            'admin_notes'    => 'nullable|string|max:2000',
            'items'          => 'required|array|max:50',
        ], ['customer_name' => 'Name', 'customer_email' => 'Email', 'customer_phone' => 'Mobile number', 'address_line1' => 'Address', 'pin' => 'PIN code']);

        $qtyById = self::normaliseItems($data['items']);
        $attribution = Attribution::clean($input);

        return Database::transaction(static function () use ($data, $qtyById, $source, $adminId, $attribution): array {
            $products = ProductRepository::lockMany(array_keys($qtyById));
            $lines = [];
            $errors = [];
            foreach ($qtyById as $id => $qty) {
                $p = $products[$id] ?? null;
                if (!$p) {
                    $errors[] = 'A product in this order no longer exists.';
                } elseif ($p['stock'] < $qty) {
                    $errors[] = "Only {$p['stock']} × {$p['name']} left in stock.";
                } else {
                    $lines[] = ['product' => $p, 'qty' => $qty];
                }
            }
            if ($errors) {
                throw HttpException::validation(['items' => implode(' ', $errors)]);
            }

            $quote = PricingService::quote($lines, $data['coupon_code'] ? strtoupper($data['coupon_code']) : null);
            $address = ['line1' => $data['address_line1'], 'line2' => $data['address_line2'], 'city' => $data['city'], 'state' => $data['state'], 'pin' => $data['pin']];
            $customerId = CustomerRepository::upsert($data['customer_name'], $data['customer_email'], $data['customer_phone'], $address);

            $orderId = OrderRepository::create([
                'order_no'       => self::nextNumber(),
                'customer_id'    => $customerId,
                'customer_name'  => $data['customer_name'],
                'customer_email' => $data['customer_email'],
                'customer_phone' => $data['customer_phone'],
                'address_line1'  => $data['address_line1'],
                'address_line2'  => $data['address_line2'],
                'city'           => $data['city'],
                'state'          => $data['state'],
                'pin'            => $data['pin'],
                'subtotal'       => $quote['subtotal'],
                'discount'       => $quote['discount'],
                'shipping'       => $quote['shipping'],
                'total'          => $quote['total'],
                'coupon_code'    => $quote['coupon']['code'] ?? null,
                'payment_method' => $data['payment_method'],
                'payment_status' => $data['payment_status'] ?? 'pending',
                'source'         => $source,
                'admin_notes'    => $data['admin_notes'],
            ] + $attribution);

            foreach ($quote['lines'] as $l) {
                OrderRepository::addItem([
                    'order_id' => $orderId, 'product_id' => $l['product']['id'], 'product_slug' => $l['product']['slug'],
                    'product_name' => $l['product']['name'], 'unit_price' => $l['product']['price'], 'qty' => $l['qty'], 'line_total' => $l['line_total'],
                ]);
                ProductRepository::adjustStock($l['product']['id'], -$l['qty']);
            }
            if ($quote['coupon']) {
                CouponRepository::adjustUsage($quote['coupon']['code'], 1);
            }
            OrderRepository::addHistory($orderId, 'placed', $source === 'admin' ? 'Created by admin' : 'Order placed online', $adminId);

            return OrderRepository::find($orderId);
        });
    }

    /** Preview totals for the admin "new order" form without saving anything. */
    public static function preview(array $input): array
    {
        $qtyById = self::normaliseItems($input['items'] ?? []);
        $products = array_column(ProductRepository::options(), null, 'id');
        $lines = [];
        foreach ($qtyById as $id => $qty) {
            if (isset($products[$id])) {
                $lines[] = ['product' => $products[$id], 'qty' => $qty];
            }
        }
        $code = trim((string) ($input['coupon_code'] ?? ''));
        $q = PricingService::quote($lines, $code !== '' ? strtoupper($code) : null);
        unset($q['lines']);
        return $q;
    }

    public static function changeStatus(int $id, string $status, string $note, int $adminId): array
    {
        if (!isset(OrderRepository::STATUSES[$status])) {
            throw HttpException::validation(['status' => 'Choose a valid status.']);
        }
        return Database::transaction(static function () use ($id, $status, $note, $adminId): array {
            $order = self::findOrFail($id);
            if ($order['status'] === $status) {
                throw HttpException::validation(['status' => 'The order already has this status.']);
            }
            if ($order['status'] === 'cancelled') {
                throw HttpException::validation(['status' => 'Cancelled orders cannot be reopened. Create a new order instead.']);
            }
            if ($status === 'cancelled') {
                self::release($order);
            }
            $changes = ['status' => $status];
            if ($status === 'delivered' && $order['payment_method'] === 'cod' && $order['payment_status'] === 'pending') {
                $changes['payment_status'] = 'paid'; // cash collected on delivery
            }
            OrderRepository::update($id, $changes);
            OrderRepository::addHistory($id, $status, mb_substr($note, 0, 255), $adminId);
            return OrderRepository::find($id);
        });
    }

    /**
     * Move an order forward along placed → packed → shipped → out_for_delivery → delivered (used by shipping/tracking).
     * Never moves backwards and never touches cancelled or delivered orders. Returns true when the status changed.
     */
    public static function advanceTo(int $id, string $target, string $note = '', ?int $adminId = null): bool
    {
        $order = OrderRepository::find($id);
        $from = array_search($order['status'] ?? '', self::FLOW, true);
        $to = array_search($target, self::FLOW, true);
        if (!$order || $from === false || $to === false || $to <= $from) {
            return false;
        }
        $changes = ['status' => $target];
        if ($target === 'delivered' && $order['payment_method'] === 'cod' && $order['payment_status'] === 'pending') {
            $changes['payment_status'] = 'paid';
        }
        OrderRepository::update($id, $changes);
        OrderRepository::addHistory($id, $target, mb_substr($note, 0, 255), $adminId);
        return true;
    }

    private const FLOW = ['placed', 'packed', 'shipped', 'out_for_delivery', 'delivered'];

    public static function update(int $id, array $input): array
    {
        self::findOrFail($id);
        $data = Validator::make($input, [
            'customer_name'  => 'required|string|max:120',
            'customer_email' => 'required|email|max:190',
            'customer_phone' => 'required|phone',
            'address_line1'  => 'required|string|max:190',
            'address_line2'  => 'string|max:190',
            'city'           => 'required|string|max:80',
            'state'          => 'required|string|max:80',
            'pin'            => 'required|pin',
            'payment_status' => 'required|in:pending,paid,failed,refunded',
            'admin_notes'    => 'nullable|string|max:2000',
        ], ['customer_name' => 'Name', 'customer_email' => 'Email', 'customer_phone' => 'Mobile number', 'address_line1' => 'Address', 'pin' => 'PIN code']);
        // Marketing can correct the source of an order; only fields actually sent are changed (utm_id, referrer… stay intact).
        $data += array_intersect_key(Attribution::clean($input), $input);
        OrderRepository::update($id, $data);
        return OrderRepository::find($id);
    }

    public static function delete(int $id): void
    {
        Database::transaction(static function () use ($id): void {
            $order = self::findOrFail($id);
            if ($order['status'] !== 'cancelled') {
                self::release($order);
            }
            OrderRepository::delete($id);
        });
    }

    /** Return stock (if not yet dispatched) and coupon usage for an order that will not be fulfilled. */
    private static function release(array $order): void
    {
        if (in_array($order['status'], self::RESTOCKABLE, true)) {
            foreach ($order['items'] as $item) {
                if ($item['product_id']) {
                    ProductRepository::adjustStock((int) $item['product_id'], (int) $item['qty']);
                }
            }
        }
        if ($order['coupon_code']) {
            CouponRepository::adjustUsage($order['coupon_code'], -1);
        }
    }

    private static function findOrFail(int $id): array
    {
        return OrderRepository::find($id) ?? throw HttpException::notFound('Order');
    }

    /** @return array<int,int> product id => qty (duplicates merged) */
    private static function normaliseItems(array $items): array
    {
        $out = [];
        foreach ($items as $item) {
            $id = (int) ($item['product_id'] ?? 0);
            $qty = (int) ($item['qty'] ?? 0);
            if ($id > 0 && $qty > 0) {
                $out[$id] = min(999, ($out[$id] ?? 0) + $qty);
            }
        }
        if (!$out) {
            throw HttpException::validation(['items' => 'Add at least one product.']);
        }
        return $out;
    }

    private static function nextNumber(): string
    {
        do {
            $no = 'VS' . str_pad((string) random_int(0, 99999999), 8, '0', STR_PAD_LEFT);
        } while (OrderRepository::numberExists($no));
        return $no;
    }
}
