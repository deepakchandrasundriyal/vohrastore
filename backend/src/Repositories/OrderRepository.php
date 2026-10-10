<?php
declare(strict_types=1);

namespace Vohra\Repositories;

use Vohra\Core\Database as DB;

final class OrderRepository
{
    public const STATUSES = ['placed' => 'Placed', 'packed' => 'Packed', 'shipped' => 'Shipped', 'out_for_delivery' => 'Out for delivery', 'delivered' => 'Delivered', 'cancelled' => 'Cancelled'];
    public const PAYMENT_STATUSES = ['pending' => 'Pending', 'paid' => 'Paid', 'failed' => 'Failed', 'refunded' => 'Refunded'];
    public const PAYMENT_METHODS = ['razorpay' => 'Online (Razorpay)', 'cod' => 'Cash on delivery'];

    public static function paginate(array $f): array
    {
        [$where, $params] = self::filters($f);
        $order = DB::sort($f['sort'] ?? null, [
            'created_at' => 'o.created_at', 'total' => 'o.total', 'order_no' => 'o.order_no', 'customer' => 'o.customer_name', 'status' => 'o.status',
        ], 'o.created_at DESC');

        $page = DB::paginate(
            'o.id, o.order_no, o.customer_id, o.customer_name, o.customer_email, o.customer_phone, o.city, o.state, o.total,
             o.payment_method, o.payment_status, o.status, o.source, o.utm_source, o.utm_campaign, o.created_at,
             (SELECT COALESCE(SUM(qty), 0) FROM order_items WHERE order_id = o.id) AS items_count',
            "FROM orders o WHERE $where",
            $params,
            $order,
            (int) ($f['page'] ?? 1),
            (int) ($f['per_page'] ?? 20)
        );
        $page['data'] = array_map([self::class, 'cast'], $page['data']);
        $page['counts'] = self::statusCounts();
        return $page;
    }

    /** All rows matching the filters, for CSV export. */
    public static function export(array $f): array
    {
        [$where, $params] = self::filters($f);
        return DB::all("SELECT o.* FROM orders o WHERE $where ORDER BY o.created_at DESC", $params);
    }

    public static function find(int $id): ?array
    {
        $order = DB::one('SELECT * FROM orders WHERE id = ?', [$id]);
        if (!$order) {
            return null;
        }
        $order = self::cast($order);
        $order['items'] = array_map(static function (array $i): array {
            $i['qty'] = (int) $i['qty'];
            $i['unit_price'] = (float) $i['unit_price'];
            $i['line_total'] = (float) $i['line_total'];
            return $i;
        }, DB::all('SELECT oi.*, p.image FROM order_items oi LEFT JOIN products p ON p.id = oi.product_id WHERE oi.order_id = ? ORDER BY oi.id', [$id]));
        $order['history'] = DB::all(
            'SELECT h.status, h.note, h.created_at, a.name AS admin_name FROM order_status_history h
             LEFT JOIN admins a ON a.id = h.admin_id WHERE h.order_id = ? ORDER BY h.created_at, h.id',
            [$id]
        );
        return $order;
    }

    public static function forCustomer(int $customerId): array
    {
        return array_map([self::class, 'cast'], DB::all(
            'SELECT id, order_no, total, status, payment_status, created_at FROM orders WHERE customer_id = ? ORDER BY created_at DESC LIMIT 50',
            [$customerId]
        ));
    }

    public static function numberExists(string $no): bool
    {
        return (bool) DB::value('SELECT 1 FROM orders WHERE order_no = ?', [$no]);
    }

    public static function create(array $data): int
    {
        return DB::insert('orders', $data);
    }

    public static function addItem(array $item): void
    {
        DB::insert('order_items', $item);
    }

    public static function update(int $id, array $data): void
    {
        DB::update('orders', $data, $id);
    }

    public static function addHistory(int $orderId, string $status, string $note = '', ?int $adminId = null): void
    {
        DB::insert('order_status_history', ['order_id' => $orderId, 'status' => $status, 'note' => $note, 'admin_id' => $adminId]);
    }

    public static function delete(int $id): bool
    {
        return DB::delete('orders', $id);
    }

    /** Distinct marketing sources seen on orders, for the filter dropdown. */
    public static function sources(): array
    {
        return array_column(DB::all("SELECT DISTINCT utm_source AS s FROM orders WHERE utm_source IS NOT NULL AND utm_source <> '' ORDER BY s"), 's');
    }

    public static function statusCounts(): array
    {
        $rows = DB::all('SELECT status, COUNT(*) AS n FROM orders GROUP BY status');
        $counts = array_fill_keys(array_keys(self::STATUSES), 0);
        foreach ($rows as $r) {
            $counts[$r['status']] = (int) $r['n'];
        }
        return $counts;
    }

    private static function filters(array $f): array
    {
        $where = ['1 = 1'];
        $params = [];
        if (!empty($f['q'])) {
            $where[] = '(o.order_no LIKE :q OR o.customer_name LIKE :q OR o.customer_email LIKE :q OR o.customer_phone LIKE :q)';
            $params['q'] = '%' . $f['q'] . '%';
        }
        if (!empty($f['status']) && isset(self::STATUSES[$f['status']])) {
            $where[] = 'o.status = :status';
            $params['status'] = $f['status'];
        }
        if (!empty($f['payment_status']) && isset(self::PAYMENT_STATUSES[$f['payment_status']])) {
            $where[] = 'o.payment_status = :pstatus';
            $params['pstatus'] = $f['payment_status'];
        }
        if (!empty($f['payment_method']) && isset(self::PAYMENT_METHODS[$f['payment_method']])) {
            $where[] = 'o.payment_method = :pmethod';
            $params['pmethod'] = $f['payment_method'];
        }
        if (!empty($f['utm_source'])) {
            if ($f['utm_source'] === '(direct)') {
                $where[] = "(o.utm_source IS NULL OR o.utm_source = '')";
            } else {
                $where[] = 'o.utm_source = :usource';
                $params['usource'] = $f['utm_source'];
            }
        }
        if (!empty($f['utm_id'])) {
            $where[] = 'o.utm_id = :uid';
            $params['uid'] = $f['utm_id'];
        }
        if (!empty($f['state'])) {
            $where[] = 'o.state = :state';
            $params['state'] = $f['state'];
        }
        if (!empty($f['utm_campaign'])) {
            $where[] = 'o.utm_campaign = :ucampaign';
            $params['ucampaign'] = $f['utm_campaign'];
        }
        if (!empty($f['customer_id'])) {
            $where[] = 'o.customer_id = :cid';
            $params['cid'] = (int) $f['customer_id'];
        }
        if (!empty($f['from']) && strtotime($f['from'])) {
            $where[] = 'o.created_at >= :from';
            $params['from'] = date('Y-m-d 00:00:00', strtotime($f['from']));
        }
        if (!empty($f['to']) && strtotime($f['to'])) {
            $where[] = 'o.created_at <= :to';
            $params['to'] = date('Y-m-d 23:59:59', strtotime($f['to']));
        }
        return [implode(' AND ', $where), $params];
    }

    private static function cast(array $r): array
    {
        foreach (['id', 'customer_id', 'items_count'] as $k) {
            if (isset($r[$k])) {
                $r[$k] = (int) $r[$k];
            }
        }
        foreach (['subtotal', 'discount', 'shipping', 'total'] as $k) {
            if (isset($r[$k])) {
                $r[$k] = (float) $r[$k];
            }
        }
        return $r;
    }
}
