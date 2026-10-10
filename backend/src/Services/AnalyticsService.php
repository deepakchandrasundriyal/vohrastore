<?php
declare(strict_types=1);

namespace Vohra\Services;

use DateInterval;
use DatePeriod;
use DateTimeImmutable;
use Vohra\Core\Database as DB;
use Vohra\Repositories\EnquiryRepository;
use Vohra\Repositories\OrderRepository;

/**
 * Dashboard analytics. Revenue always excludes cancelled orders.
 * Every KPI is compared with the previous period of the same length.
 */
final class AnalyticsService
{
    public const RANGES = ['7d' => 7, '30d' => 30, '90d' => 90, '12m' => 365];
    private const VALID = "o.status <> 'cancelled'";

    public static function dashboard(string $range): array
    {
        $days = self::RANGES[$range] ?? 30;
        $to = new DateTimeImmutable('tomorrow');                  // exclusive upper bound
        $from = $to->sub(new DateInterval("P{$days}D"));
        $prevFrom = $from->sub(new DateInterval("P{$days}D"));
        $monthly = $days > 90;

        return [
            'range'        => ['key' => $range, 'from' => $from->format('Y-m-d'), 'to' => $to->modify('-1 day')->format('Y-m-d'), 'bucket' => $monthly ? 'month' : 'day'],
            'kpis'         => self::kpis($from, $to, $prevFrom),
            'series'       => self::series($from, $to, $monthly),
            'status'       => self::statusBreakdown($from, $to),
            'payments'     => self::paymentSplit($from, $to),
            'top_products' => self::topProducts($from, $to),
            'top_states'   => self::topStates($from, $to),
            'coupons'      => self::couponPerformance($from, $to),
            'recent'       => self::recentOrders(),
            'low_stock'    => self::lowStock(),
            'attention'    => self::attention(),
        ];
    }

    private static function kpis(DateTimeImmutable $from, DateTimeImmutable $to, DateTimeImmutable $prevFrom): array
    {
        $cur = self::totals($from, $to);
        $prev = self::totals($prevFrom, $from);
        $out = [];
        foreach ($cur as $key => $value) {
            $out[$key] = ['value' => $value, 'previous' => $prev[$key], 'change' => self::change($value, $prev[$key])];
        }
        return $out;
    }

    private static function totals(DateTimeImmutable $from, DateTimeImmutable $to): array
    {
        $p = [self::fmt($from), self::fmt($to)];
        $o = DB::one(
            'SELECT COALESCE(SUM(CASE WHEN ' . self::VALID . ' THEN o.total END), 0) AS revenue,
                    SUM(' . self::VALID . ') AS orders,
                    SUM(o.status = \'cancelled\') AS cancelled,
                    COUNT(DISTINCT CASE WHEN ' . self::VALID . ' THEN o.customer_id END) AS buyers
             FROM orders o WHERE o.created_at >= ? AND o.created_at < ?',
            $p
        );
        $units = (int) DB::value('SELECT COALESCE(SUM(oi.qty), 0) FROM order_items oi JOIN orders o ON o.id = oi.order_id
                                  WHERE ' . self::VALID . ' AND o.created_at >= ? AND o.created_at < ?', $p);
        $newCustomers = (int) DB::value('SELECT COUNT(*) FROM customers WHERE created_at >= ? AND created_at < ?', $p);

        $orders = (int) $o['orders'];
        $all = $orders + (int) $o['cancelled'];
        return [
            'revenue'       => round((float) $o['revenue'], 2),
            'orders'        => $orders,
            'aov'           => $orders ? round((float) $o['revenue'] / $orders, 2) : 0.0,
            'units'         => $units,
            'new_customers' => $newCustomers,
            'buyers'        => (int) $o['buyers'],
            'cancel_rate'   => $all ? round((int) $o['cancelled'] / $all * 100, 1) : 0.0,
        ];
    }

    private static function series(DateTimeImmutable $from, DateTimeImmutable $to, bool $monthly): array
    {
        $fmt = $monthly ? '%Y-%m' : '%Y-%m-%d';
        $rows = DB::all(
            "SELECT DATE_FORMAT(o.created_at, '$fmt') AS bucket,
                    COALESCE(SUM(CASE WHEN " . self::VALID . ' THEN o.total END), 0) AS revenue,
                    SUM(' . self::VALID . ') AS orders
             FROM orders o WHERE o.created_at >= ? AND o.created_at < ? GROUP BY bucket',
            [self::fmt($from), self::fmt($to)]
        );
        $byBucket = array_column($rows, null, 'bucket');

        $points = [];
        $start = $monthly ? $from->modify('first day of this month') : $from;
        $step = new DateInterval($monthly ? 'P1M' : 'P1D');
        foreach (new DatePeriod($start, $step, $to) as $d) {
            $key = $d->format($monthly ? 'Y-m' : 'Y-m-d');
            $points[] = [
                'date'    => $key,
                'revenue' => round((float) ($byBucket[$key]['revenue'] ?? 0), 2),
                'orders'  => (int) ($byBucket[$key]['orders'] ?? 0),
            ];
        }
        return $points;
    }

    private static function statusBreakdown(DateTimeImmutable $from, DateTimeImmutable $to): array
    {
        $rows = DB::all('SELECT status, COUNT(*) AS n FROM orders WHERE created_at >= ? AND created_at < ? GROUP BY status', [self::fmt($from), self::fmt($to)]);
        $counts = array_column($rows, 'n', 'status');
        $out = [];
        foreach (OrderRepository::STATUSES as $key => $label) {
            $out[] = ['key' => $key, 'label' => $label, 'count' => (int) ($counts[$key] ?? 0)];
        }
        return $out;
    }

    private static function paymentSplit(DateTimeImmutable $from, DateTimeImmutable $to): array
    {
        $rows = DB::all(
            'SELECT o.payment_method AS method, COUNT(*) AS orders, COALESCE(SUM(o.total), 0) AS revenue
             FROM orders o WHERE ' . self::VALID . ' AND o.created_at >= ? AND o.created_at < ? GROUP BY o.payment_method',
            [self::fmt($from), self::fmt($to)]
        );
        $byMethod = array_column($rows, null, 'method');
        $out = [];
        foreach (OrderRepository::PAYMENT_METHODS as $key => $label) {
            $out[] = ['key' => $key, 'label' => $label, 'orders' => (int) ($byMethod[$key]['orders'] ?? 0), 'revenue' => (float) ($byMethod[$key]['revenue'] ?? 0)];
        }
        return $out;
    }

    private static function topProducts(DateTimeImmutable $from, DateTimeImmutable $to): array
    {
        return array_map(static fn (array $r): array => [
            'name' => $r['name'], 'slug' => $r['slug'], 'image' => $r['image'], 'color' => $r['color'],
            'units' => (int) $r['units'], 'revenue' => (float) $r['revenue'],
        ], DB::all(
            'SELECT oi.product_name AS name, oi.product_slug AS slug, p.image, p.color, SUM(oi.qty) AS units, SUM(oi.line_total) AS revenue
             FROM order_items oi JOIN orders o ON o.id = oi.order_id LEFT JOIN products p ON p.id = oi.product_id
             WHERE ' . self::VALID . ' AND o.created_at >= ? AND o.created_at < ?
             GROUP BY oi.product_slug, oi.product_name, p.image, p.color ORDER BY revenue DESC LIMIT 7',
            [self::fmt($from), self::fmt($to)]
        ));
    }

    private static function topStates(DateTimeImmutable $from, DateTimeImmutable $to): array
    {
        return array_map(static fn (array $r): array => ['state' => $r['state'], 'orders' => (int) $r['orders'], 'revenue' => (float) $r['revenue']], DB::all(
            'SELECT o.state, COUNT(*) AS orders, SUM(o.total) AS revenue FROM orders o
             WHERE ' . self::VALID . ' AND o.created_at >= ? AND o.created_at < ? GROUP BY o.state ORDER BY revenue DESC LIMIT 6',
            [self::fmt($from), self::fmt($to)]
        ));
    }

    private static function couponPerformance(DateTimeImmutable $from, DateTimeImmutable $to): array
    {
        return array_map(static fn (array $r): array => ['code' => $r['code'], 'orders' => (int) $r['orders'], 'discount' => (float) $r['discount'], 'revenue' => (float) $r['revenue']], DB::all(
            'SELECT o.coupon_code AS code, COUNT(*) AS orders, SUM(o.discount) AS discount, SUM(o.total) AS revenue FROM orders o
             WHERE ' . self::VALID . ' AND o.coupon_code IS NOT NULL AND o.created_at >= ? AND o.created_at < ?
             GROUP BY o.coupon_code ORDER BY orders DESC LIMIT 5',
            [self::fmt($from), self::fmt($to)]
        ));
    }

    private static function recentOrders(): array
    {
        return array_map(static fn (array $r): array => ['total' => (float) $r['total'], 'id' => (int) $r['id']] + $r, DB::all(
            'SELECT id, order_no, customer_name, total, status, payment_status, created_at FROM orders ORDER BY created_at DESC LIMIT 8'
        ));
    }

    private static function lowStock(): array
    {
        return array_map(static fn (array $r): array => ['id' => (int) $r['id'], 'stock' => (int) $r['stock'], 'low_stock_at' => (int) $r['low_stock_at']] + $r, DB::all(
            'SELECT id, name, image, stock, low_stock_at FROM products WHERE is_active = 1 AND stock <= low_stock_at ORDER BY stock ASC LIMIT 8'
        ));
    }

    private static function attention(): array
    {
        return [
            'to_pack'         => (int) DB::value("SELECT COUNT(*) FROM orders WHERE status = 'placed'"),
            'to_ship'         => (int) DB::value("SELECT COUNT(*) FROM orders WHERE status = 'packed'"),
            'payment_pending' => (int) DB::value("SELECT COUNT(*) FROM orders WHERE payment_status = 'pending' AND payment_method = 'razorpay' AND status <> 'cancelled'"),
            'new_enquiries'   => EnquiryRepository::statusCounts()['new'],
        ];
    }

    private static function change(float|int $now, float|int $before): ?float
    {
        if ((float) $before === 0.0) {
            return $now > 0 ? null : 0.0; // null = "new" (no baseline)
        }
        return round(($now - $before) / $before * 100, 1);
    }

    private static function fmt(DateTimeImmutable $d): string
    {
        return $d->format('Y-m-d H:i:s');
    }
}
