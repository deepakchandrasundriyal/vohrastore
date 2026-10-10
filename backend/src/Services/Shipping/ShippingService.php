<?php
declare(strict_types=1);

namespace Vohra\Services\Shipping;

use Throwable;
use Vohra\Core\Database;
use Vohra\Core\HttpException;
use Vohra\Core\Validator;
use Vohra\Repositories\OrderRepository;
use Vohra\Repositories\SettingRepository;
use Vohra\Repositories\ShipmentRepository;
use Vohra\Services\OrderService;

/**
 * Fulfilment: courier rates → shipment + AWB → label → pickup → tracking.
 * Tracking (webhook or sync) moves the order forward automatically: shipped → out for delivery → delivered.
 */
final class ShippingService
{
    /* ---------------- package ---------------- */

    /** Default parcel for an order: base carton + per-tin weight, standard box size from settings. */
    public static function defaultPackage(array $order): array
    {
        $s = SettingRepository::all();
        $units = array_sum(array_column($order['items'], 'qty'));
        return [
            'weight_kg'  => round((float) $s['package_base_weight_kg'] + $units * (float) $s['package_unit_weight_kg'], 3),
            'length_cm'  => (float) $s['package_length_cm'],
            'breadth_cm' => (float) $s['package_breadth_cm'],
            'height_cm'  => (float) $s['package_height_cm'] * max(1, (int) ceil($units / 6)), // stack boxes for big orders
        ];
    }

    private static function package(array $input): array
    {
        return Validator::make($input, [
            'weight_kg'  => 'required|numeric|min:0.05|max:100',
            'length_cm'  => 'required|numeric|min:1|max:300',
            'breadth_cm' => 'required|numeric|min:1|max:300',
            'height_cm'  => 'required|numeric|min:1|max:300',
        ], ['weight_kg' => 'Weight', 'length_cm' => 'Length', 'breadth_cm' => 'Breadth', 'height_cm' => 'Height']);
    }

    /* ---------------- Shiprocket ---------------- */

    public static function rates(int $orderId, array $input): array
    {
        $order = self::shippableOrder($orderId);
        $pkg = self::package($input);
        $pickupPin = (string) SettingRepository::get('pickup_pincode');
        if ($pickupPin === '') {
            throw new HttpException('Choose your pickup location in Settings → Shipping first.', 422);
        }
        return ShiprocketClient::serviceability($pickupPin, $order['pin'], $pkg['weight_kg'], $order['payment_method'] === 'cod', $order['total']);
    }

    /** Push the order to Shiprocket and get an AWB from the chosen courier (or Shiprocket's recommendation). */
    public static function ship(int $orderId, array $input, int $adminId): array
    {
        $order = self::shippableOrder($orderId);
        $pkg = self::package($input);
        $courierId = (int) ($input['courier_id'] ?? 0) ?: null;
        $settings = SettingRepository::all();
        if (!ShiprocketClient::isConfigured()) {
            throw new HttpException('Connect Shiprocket in Settings → Shipping, or use “Manual courier”.', 422);
        }
        if ($settings['pickup_location'] === '') {
            throw new HttpException('Choose your pickup location in Settings → Shipping first.', 422);
        }

        $previous = ShipmentRepository::findByOrder($orderId);
        if ($previous && $previous['provider'] === 'shiprocket' && $previous['status'] === 'created' && $previous['sr_shipment_id']) {
            // Order already exists in Shiprocket (an earlier AWB attempt failed): just retry the AWB.
            ShipmentRepository::update($previous['id'], $pkg + ['shipping_cost' => isset($input['rate']) ? (float) $input['rate'] : null]);
            return self::assignAwb($orderId, $courierId, $adminId);
        }
        $channelOrderId = $order['order_no'] . ($previous ? '-' . substr((string) time(), -4) : ''); // Shiprocket refuses a reused order id
        [$first, $last] = array_pad(explode(' ', trim($order['customer_name']), 2), 2, '');

        $created = ShiprocketClient::createOrder([
            'order_id'              => $channelOrderId,
            'order_date'            => date('Y-m-d H:i', strtotime($order['created_at'])),
            'pickup_location'       => $settings['pickup_location'],
            'comment'               => "Vohra's Store order {$order['order_no']}",
            'billing_customer_name' => $first,
            'billing_last_name'     => $last,
            'billing_address'       => $order['address_line1'],
            'billing_address_2'     => $order['address_line2'],
            'billing_city'          => $order['city'],
            'billing_pincode'       => $order['pin'],
            'billing_state'         => $order['state'],
            'billing_country'       => 'India',
            'billing_email'         => $order['customer_email'],
            'billing_phone'         => $order['customer_phone'],
            'shipping_is_billing'   => true,
            'order_items'           => array_map(static fn (array $i): array => [
                'name' => $i['product_name'], 'sku' => $i['product_slug'], 'units' => $i['qty'], 'selling_price' => $i['unit_price'], 'discount' => 0, 'tax' => 0,
            ], $order['items']),
            'payment_method'        => $order['payment_method'] === 'cod' ? 'COD' : 'Prepaid',
            'shipping_charges'      => $order['shipping'],
            'total_discount'        => $order['discount'],
            'sub_total'             => $order['subtotal'],
            'length'                => $pkg['length_cm'],
            'breadth'               => $pkg['breadth_cm'],
            'height'                => $pkg['height_cm'],
            'weight'                => $pkg['weight_kg'],
        ]);

        // Save immediately: if the AWB step fails, the Shiprocket order still exists and can be retried.
        ShipmentRepository::upsert($orderId, $pkg + [
            'provider' => 'shiprocket', 'sr_order_id' => (int) $created['order_id'], 'sr_shipment_id' => (int) $created['shipment_id'],
            'status' => 'created', 'created_by' => $adminId, 'shipping_cost' => isset($input['rate']) ? (float) $input['rate'] : null,
        ]);
        return self::assignAwb($orderId, $courierId, $adminId);
    }

    /** (Re)try getting an AWB for a Shiprocket shipment. */
    public static function assignAwb(int $orderId, ?int $courierId, int $adminId): array
    {
        $s = self::shipment($orderId, 'shiprocket');
        try {
            $awb = ShiprocketClient::assignAwb((int) $s['sr_shipment_id'], $courierId);
        } catch (HttpException $e) {
            ShipmentRepository::update($s['id'], ['last_error' => mb_substr($e->getMessage(), 0, 500)]);
            throw new HttpException($e->getMessage() . ' The order is saved in Shiprocket; you can retry with another courier.', $e->status());
        }
        ShipmentRepository::update($s['id'], [
            'awb' => $awb['awb_code'], 'courier_id' => (int) ($awb['courier_company_id'] ?? 0) ?: null, 'courier_name' => $awb['courier_name'] ?? null,
            'tracking_url' => 'https://shiprocket.co/tracking/' . rawurlencode($awb['awb_code']),
            'status' => 'awb_assigned', 'courier_status' => 'AWB ASSIGNED', 'last_error' => null,
        ]);
        OrderService::advanceTo($orderId, 'packed', "Shipment booked with {$awb['courier_name']} · AWB {$awb['awb_code']}", $adminId);
        return self::forOrder($orderId);
    }

    public static function schedulePickup(int $orderId): array
    {
        $s = self::shipment($orderId, 'shiprocket');
        if (!$s['awb']) {
            throw new HttpException('Assign an AWB before scheduling a pickup.', 422);
        }
        $r = ShiprocketClient::generatePickup((int) $s['sr_shipment_id']);
        $when = $r['pickup_scheduled_date'] ?? null;
        ShipmentRepository::update($s['id'], [
            'status' => 'pickup_scheduled', 'courier_status' => 'PICKUP SCHEDULED',
            'pickup_scheduled_at' => $when ? date('Y-m-d H:i:s', strtotime((string) $when)) : null,
            'pickup_token' => isset($r['pickup_token_number']) ? (string) $r['pickup_token_number'] : null,
        ]);
        return self::forOrder($orderId);
    }

    /** label | manifest | invoice → URL of the PDF (cached on the shipment). */
    public static function document(int $orderId, string $type): string
    {
        $s = self::shipment($orderId, 'shiprocket');
        $column = ['label' => 'label_url', 'manifest' => 'manifest_url', 'invoice' => 'invoice_url'][$type] ?? throw HttpException::notFound('Document');
        if (!empty($s[$column])) {
            return $s[$column];
        }
        $url = match ($type) {
            'label'    => ShiprocketClient::label((int) $s['sr_shipment_id']),
            'manifest' => ShiprocketClient::manifest((int) $s['sr_shipment_id'], (int) $s['sr_order_id']),
            'invoice'  => ShiprocketClient::invoice((int) $s['sr_order_id']),
        };
        ShipmentRepository::update($s['id'], [$column => $url]);
        return $url;
    }

    public static function cancel(int $orderId, int $adminId): array
    {
        $s = self::shipment($orderId);
        if (in_array($s['status'], ['in_transit', 'out_for_delivery', 'delivered'], true)) {
            throw new HttpException('The courier already has this parcel. Ask the courier for an RTO instead.', 422);
        }
        if ($s['provider'] === 'shiprocket' && $s['sr_order_id']) {
            ShiprocketClient::cancelOrder((int) $s['sr_order_id']);
        }
        ShipmentRepository::update($s['id'], ['status' => 'cancelled', 'courier_status' => 'CANCELLED']);
        OrderRepository::addHistory($orderId, (string) OrderRepository::find($orderId)['status'], 'Shipment cancelled' . ($s['awb'] ? " (AWB {$s['awb']})" : ''), $adminId);
        return self::forOrder($orderId);
    }

    /** Called when an order is cancelled: cancel a not-yet-dispatched shipment. Returns a warning or null. */
    public static function cancelForCancelledOrder(int $orderId, int $adminId): ?string
    {
        $s = ShipmentRepository::findByOrder($orderId);
        if (!$s || in_array($s['status'], ['cancelled', 'delivered'], true)) {
            return null;
        }
        if (in_array($s['status'], ['in_transit', 'out_for_delivery', 'rto', 'exception'], true)) {
            return 'The parcel is already with the courier. Ask them for a return (RTO).';
        }
        try {
            self::cancel($orderId, $adminId);
            return null;
        } catch (Throwable $e) {
            return 'Order cancelled, but the shipment could not be cancelled automatically: ' . $e->getMessage();
        }
    }

    /* ---------------- manual courier ---------------- */

    public static function manual(int $orderId, array $input, int $adminId): array
    {
        $order = self::shippableOrder($orderId);
        $data = Validator::make($input, [
            'courier_name' => 'required|string|max:120',
            'awb'          => 'required|string|max:40',
            'tracking_url' => 'nullable|string|max:255',
            'mark_shipped' => 'bool',
        ], ['awb' => 'AWB / tracking number']);
        if ($data['tracking_url'] && !filter_var($data['tracking_url'], FILTER_VALIDATE_URL)) {
            throw HttpException::validation(['tracking_url' => 'Enter a full URL starting with https://']);
        }
        $pkg = self::defaultPackage($order);
        ShipmentRepository::upsert($orderId, $pkg + [
            'provider' => 'manual', 'awb' => $data['awb'], 'courier_name' => $data['courier_name'], 'tracking_url' => $data['tracking_url'],
            'status' => $data['mark_shipped'] ? 'in_transit' : 'awb_assigned', 'courier_status' => $data['mark_shipped'] ? 'SHIPPED' : 'AWB ASSIGNED',
            'created_by' => $adminId,
        ]);
        $note = "{$data['courier_name']} · AWB {$data['awb']}";
        OrderService::advanceTo($orderId, $data['mark_shipped'] ? 'shipped' : 'packed', $note, $adminId);
        return self::forOrder($orderId);
    }

    /** Manual shipments: the team updates progress by hand (out for delivery / delivered). */
    public static function manualStatus(int $orderId, string $status, int $adminId): array
    {
        $s = self::shipment($orderId, 'manual');
        $map = ['in_transit' => 'shipped', 'out_for_delivery' => 'out_for_delivery', 'delivered' => 'delivered'];
        if (!isset($map[$status])) {
            throw HttpException::validation(['status' => 'Choose a valid status.']);
        }
        ShipmentRepository::update($s['id'], ['status' => $status, 'courier_status' => strtoupper(str_replace('_', ' ', $status)), 'delivered_at' => $status === 'delivered' ? date('Y-m-d H:i:s') : null]);
        OrderService::advanceTo($orderId, $map[$status], "Updated by hand ({$s['courier_name']})", $adminId);
        return self::forOrder($orderId);
    }

    /* ---------------- tracking ---------------- */

    public static function sync(int $orderId): array
    {
        $s = self::shipment($orderId, 'shiprocket');
        self::syncShipment($s);
        return self::forOrder($orderId);
    }

    /** Refresh the oldest-synced active shipments (button in the queue, or CLI/cron). */
    public static function syncActive(int $limit = 25): array
    {
        $done = 0;
        $failed = 0;
        foreach (ShipmentRepository::activeForSync($limit) as $s) {
            try {
                self::syncShipment($s);
                $done++;
            } catch (Throwable $e) {
                ShipmentRepository::update($s['id'], ['last_synced_at' => date('Y-m-d H:i:s')]);
                $failed++;
            }
        }
        return ['synced' => $done, 'failed' => $failed];
    }

    private static function syncShipment(array $s): void
    {
        $t = ShiprocketClient::trackAwb((string) $s['awb']);
        $track = $t['shipment_track'][0] ?? [];
        $events = array_map(static fn (array $a): array => [
            'status'   => (string) ($a['sr-status-label'] ?? $a['status'] ?? ''),
            'activity' => (string) ($a['activity'] ?? ''),
            'location' => (string) ($a['location'] ?? ''),
            'event_at' => date('Y-m-d H:i:s', strtotime((string) ($a['date'] ?? 'now'))),
        ], $t['shipment_track_activities'] ?? []);
        self::apply($s, (string) ($track['current_status'] ?? ''), $events, [
            'etd' => $t['etd'] ?? $track['edd'] ?? null,
            'tracking_url' => $t['track_url'] ?? null,
            'delivered_at' => $track['delivered_date'] ?? null,
        ]);
    }

    /**
     * Shiprocket tracking webhook. Payload has awb, current_status, order_id (our channel order id), etd and scans[].
     * Returns false when the shipment is unknown (e.g. created directly in the Shiprocket panel).
     */
    public static function applyWebhook(array $p): bool
    {
        $s = !empty($p['awb']) ? ShipmentRepository::findByAwb((string) $p['awb']) : null;
        if (!$s && !empty($p['order_id'])) {
            $order = Database::one('SELECT id FROM orders WHERE order_no = ?', [preg_replace('/-\d{4}$/', '', (string) $p['order_id'])]);
            $s = $order ? ShipmentRepository::findByOrder((int) $order['id']) : null;
        }
        if (!$s) {
            return false;
        }
        $events = array_map(static fn (array $a): array => [
            'status'   => (string) ($a['sr-status-label'] ?? $a['status'] ?? ''),
            'activity' => (string) ($a['activity'] ?? ''),
            'location' => (string) ($a['location'] ?? ''),
            'event_at' => date('Y-m-d H:i:s', strtotime((string) ($a['date'] ?? 'now'))),
        ], is_array($p['scans'] ?? null) ? $p['scans'] : []);
        self::apply($s, (string) ($p['current_status'] ?? $p['shipment_status'] ?? ''), $events, ['etd' => $p['etd'] ?? null]);
        return true;
    }

    /** Save a courier update on the shipment and move the order forward when the parcel moves. */
    private static function apply(array $s, string $courierStatus, array $events, array $extra): void
    {
        [$shipStatus, $orderStatus] = self::normalise($courierStatus);
        $data = ['last_synced_at' => date('Y-m-d H:i:s'), 'last_error' => null];
        if ($courierStatus !== '') {
            $data['courier_status'] = mb_substr($courierStatus, 0, 80);
            $data['status'] = $shipStatus;
        }
        if (!empty($extra['etd']) && strtotime((string) $extra['etd'])) {
            $data['etd'] = date('Y-m-d H:i:s', strtotime((string) $extra['etd']));
        }
        if (!empty($extra['tracking_url'])) {
            $data['tracking_url'] = mb_substr((string) $extra['tracking_url'], 0, 255);
        }
        if ($shipStatus === 'delivered') {
            $data['delivered_at'] = !empty($extra['delivered_at']) && strtotime((string) $extra['delivered_at'])
                ? date('Y-m-d H:i:s', strtotime((string) $extra['delivered_at'])) : date('Y-m-d H:i:s');
        }
        ShipmentRepository::update($s['id'], $data);
        ShipmentRepository::addEvents($s['id'], array_filter($events, static fn ($e) => $e['status'] !== '' || $e['activity'] !== ''));

        if ($orderStatus) {
            OrderService::advanceTo($s['order_id'], $orderStatus, ($s['courier_name'] ? "{$s['courier_name']}: " : '') . ucfirst(strtolower($courierStatus)));
        }
        if (in_array($shipStatus, ['rto', 'exception'], true)) {
            OrderRepository::addHistory($s['order_id'], (string) OrderRepository::find($s['order_id'])['status'], 'Courier: ' . ucfirst(strtolower($courierStatus)));
        }
    }

    /**
     * Courier status text → [shipment status, order status to advance to (or null)].
     * @return array{0:string,1:?string}
     */
    public static function normalise(string $raw): array
    {
        $s = strtoupper(trim($raw));
        return match (true) {
            $s === ''                                                        => ['awb_assigned', null],
            str_contains($s, 'RTO')                                          => ['rto', null],
            $s === 'DELIVERED'                                               => ['delivered', 'delivered'],
            str_contains($s, 'OUT FOR DELIVERY')                             => ['out_for_delivery', 'out_for_delivery'],
            str_contains($s, 'CANCEL')                                       => ['cancelled', null],
            str_contains($s, 'UNDELIVERED') || in_array($s, ['LOST', 'DAMAGED', 'DESTROYED', 'DISPOSED OFF', 'UNTRACEABLE', 'CONTACT CUSTOMER CARE', 'SHIPMENT DELAYED'], true)
                                                                             => ['exception', null],
            str_starts_with($s, 'PICKUP') || $s === 'OUT FOR PICKUP'         => ['pickup_scheduled', null],
            in_array($s, ['NEW', 'AWB ASSIGNED', 'LABEL GENERATED', 'MANIFEST GENERATED', 'INVOICED', 'READY TO SHIP'], true)
                                                                             => ['awb_assigned', null],
            default                                                          => ['in_transit', 'shipped'], // PICKED UP, IN TRANSIT, SHIPPED, REACHED AT HUB…
        };
    }

    /* ---------------- helpers ---------------- */

    public static function forOrder(int $orderId): ?array
    {
        return ShipmentRepository::findByOrder($orderId);
    }

    private static function shipment(int $orderId, ?string $provider = null): array
    {
        $s = ShipmentRepository::findByOrder($orderId);
        if (!$s || $s['status'] === 'cancelled') {
            throw new HttpException('This order has no active shipment.', 422);
        }
        if ($provider && $s['provider'] !== $provider) {
            throw new HttpException($provider === 'shiprocket' ? 'This shipment was booked manually, not through Shiprocket.' : 'This shipment is managed by Shiprocket.', 422);
        }
        return $s;
    }

    private static function shippableOrder(int $orderId): array
    {
        $order = OrderRepository::find($orderId) ?? throw HttpException::notFound('Order');
        if (!in_array($order['status'], ['placed', 'packed'], true)) {
            throw new HttpException('Only placed or packed orders can be shipped.', 422);
        }
        if ($order['payment_method'] === 'razorpay' && $order['payment_status'] !== 'paid') {
            throw new HttpException('This online order is not paid yet. Mark the payment as paid before shipping.', 422);
        }
        $s = ShipmentRepository::findByOrder($orderId);
        if ($s && $s['status'] !== 'cancelled' && !($s['provider'] === 'shiprocket' && $s['status'] === 'created')) {
            throw new HttpException('This order already has a shipment. Cancel it first to book a new one.', 422);
        }
        return $order;
    }
}
