<?php
declare(strict_types=1);

namespace Vohra\Repositories;

use Vohra\Core\Database as DB;

final class ShipmentRepository
{
    /** Shipments still moving, i.e. worth asking the courier about. */
    public const ACTIVE = ['awb_assigned', 'pickup_scheduled', 'in_transit', 'out_for_delivery'];

    /**
     * Fulfilment queue tabs. Each is a WHERE clause over orders o LEFT JOIN shipments s.
     * "To pack" = orders that can go out now: COD, or online and already paid.
     */
    public const QUEUES = [
        'to_pack'          => "o.status = 'placed' AND (o.payment_method = 'cod' OR o.payment_status = 'paid') AND (s.id IS NULL OR s.status = 'cancelled')",
        'awaiting_payment' => "o.status = 'placed' AND o.payment_method = 'razorpay' AND o.payment_status <> 'paid'",
        'to_ship'          => "o.status = 'packed' AND (s.id IS NULL OR s.status = 'cancelled')",
        'pickup'           => "o.status IN ('placed','packed') AND s.status IN ('created','awb_assigned','pickup_scheduled')",
        'in_transit'       => "o.status IN ('shipped','out_for_delivery') AND (s.id IS NULL OR s.status NOT IN ('rto','exception'))",
        'problems'         => "o.status <> 'cancelled' AND (s.status IN ('rto','exception') OR (s.last_error IS NOT NULL AND s.status = 'created'))",
        'delivered'        => "o.status = 'delivered' AND o.updated_at >= NOW() - INTERVAL 30 DAY",
    ];

    public static function queue(string $tab, string $q, int $page): array
    {
        $where = self::QUEUES[$tab] ?? self::QUEUES['to_pack'];
        $params = [];
        if ($q !== '') {
            $where .= ' AND (o.order_no LIKE :q OR o.customer_name LIKE :q OR o.customer_phone LIKE :q OR s.awb LIKE :q)';
            $params['q'] = "%$q%";
        }
        $page = DB::paginate(
            'o.id, o.order_no, o.customer_name, o.customer_phone, o.city, o.state, o.pin, o.total, o.payment_method, o.payment_status, o.status, o.created_at, o.updated_at,
             (SELECT COALESCE(SUM(qty), 0) FROM order_items WHERE order_id = o.id) AS items_count,
             (SELECT GROUP_CONCAT(CONCAT(qty, "× ", product_name) ORDER BY id SEPARATOR ", ") FROM order_items WHERE order_id = o.id) AS items_summary,
             s.id AS shipment_id, s.provider, s.awb, s.courier_name, s.status AS ship_status, s.courier_status, s.label_url, s.tracking_url,
             s.etd, s.pickup_scheduled_at, s.last_error, s.last_synced_at',
            "FROM orders o LEFT JOIN shipments s ON s.order_id = o.id WHERE $where",
            $params,
            $tab === 'to_pack' || $tab === 'awaiting_payment' ? 'o.created_at ASC' : 'o.updated_at DESC',
            $page,
            30
        );
        $page['data'] = array_map(static function (array $r): array {
            foreach (['id', 'items_count', 'shipment_id'] as $k) {
                $r[$k] = $r[$k] === null ? null : (int) $r[$k];
            }
            $r['total'] = (float) $r['total'];
            return $r;
        }, $page['data']);
        return $page;
    }

    public static function counts(): array
    {
        $out = [];
        foreach (self::QUEUES as $tab => $where) {
            $out[$tab] = (int) DB::value("SELECT COUNT(*) FROM orders o LEFT JOIN shipments s ON s.order_id = o.id WHERE $where");
        }
        return $out;
    }

    public static function findByOrder(int $orderId): ?array
    {
        $s = DB::one('SELECT * FROM shipments WHERE order_id = ?', [$orderId]);
        if (!$s) {
            return null;
        }
        $s = self::cast($s);
        $s['events'] = DB::all('SELECT status, activity, location, event_at FROM shipment_events WHERE shipment_id = ? ORDER BY event_at DESC, id DESC', [$s['id']]);
        return $s;
    }

    public static function findByAwb(string $awb): ?array
    {
        $s = DB::one('SELECT * FROM shipments WHERE awb = ?', [$awb]);
        return $s ? self::cast($s) : null;
    }

    /** Create the order's shipment, or reuse the row of a cancelled one (old tracking history is cleared). */
    public static function upsert(int $orderId, array $data): int
    {
        $existing = DB::one('SELECT id FROM shipments WHERE order_id = ?', [$orderId]);
        if ($existing) {
            $id = (int) $existing['id'];
            DB::run('DELETE FROM shipment_events WHERE shipment_id = ?', [$id]);
            $blank = array_fill_keys(['sr_order_id', 'sr_shipment_id', 'awb', 'courier_id', 'courier_name', 'tracking_url', 'courier_status', 'shipping_cost',
                'label_url', 'manifest_url', 'invoice_url', 'pickup_scheduled_at', 'pickup_token', 'etd', 'delivered_at', 'last_synced_at', 'last_error'], null);
            DB::update('shipments', $data + $blank, $id);
            return $id;
        }
        return DB::insert('shipments', $data + ['order_id' => $orderId]);
    }

    public static function update(int $id, array $data): void
    {
        DB::update('shipments', $data, $id);
    }

    /** Store courier scan events; duplicates (same time + status) are ignored. */
    public static function addEvents(int $shipmentId, array $events): void
    {
        foreach ($events as $e) {
            DB::run(
                'INSERT IGNORE INTO shipment_events (shipment_id, status, activity, location, event_at) VALUES (?, ?, ?, ?, ?)',
                [$shipmentId, mb_substr($e['status'], 0, 80), mb_substr($e['activity'], 0, 255), mb_substr($e['location'], 0, 120), $e['event_at']]
            );
        }
    }

    public static function activeForSync(int $limit): array
    {
        $in = "'" . implode("','", self::ACTIVE) . "'";
        return array_map([self::class, 'cast'], DB::all(
            "SELECT * FROM shipments WHERE provider = 'shiprocket' AND awb IS NOT NULL AND status IN ($in)
             ORDER BY COALESCE(last_synced_at, '2000-01-01') ASC LIMIT " . max(1, min(100, $limit))
        ));
    }

    private static function cast(array $s): array
    {
        foreach (['id', 'order_id', 'sr_order_id', 'sr_shipment_id', 'courier_id', 'created_by'] as $k) {
            $s[$k] = $s[$k] === null ? null : (int) $s[$k];
        }
        foreach (['weight_kg', 'length_cm', 'breadth_cm', 'height_cm', 'shipping_cost'] as $k) {
            $s[$k] = $s[$k] === null ? null : (float) $s[$k];
        }
        return $s;
    }
}
