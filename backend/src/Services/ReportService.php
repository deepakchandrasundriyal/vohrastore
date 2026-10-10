<?php
declare(strict_types=1);

namespace Vohra\Services;

use Vohra\Core\Database as DB;

/**
 * Report queries for the Reports section. Every report covers [from, to] (inclusive dates)
 * and excludes cancelled orders unless stated otherwise.
 */
final class ReportService
{
    private const VALID = "o.status <> 'cancelled'";

    public function __construct(private string $from, private string $to)
    {
    }

    /** Build from ?from=YYYY-MM-DD&to=YYYY-MM-DD; defaults to the last 30 days. */
    public static function fromRequest(?string $from, ?string $to): self
    {
        $to = $to && strtotime($to) ? date('Y-m-d', strtotime($to)) : date('Y-m-d');
        $from = $from && strtotime($from) ? date('Y-m-d', strtotime($from)) : date('Y-m-d', strtotime("$to -29 days"));
        if ($from > $to) {
            [$from, $to] = [$to, $from];
        }
        return new self($from, $to);
    }

    public function range(): array
    {
        return ['from' => $this->from, 'to' => $this->to];
    }

    /* ---------------- locations ---------------- */
    public function locations(): array
    {
        $states = $this->rows('SELECT o.state, COUNT(*) AS orders, SUM(o.total) AS revenue, COUNT(DISTINCT o.customer_id) AS customers
                               FROM orders o WHERE %s GROUP BY o.state ORDER BY revenue DESC');
        $cities = $this->rows('SELECT o.city, o.state, COUNT(*) AS orders, SUM(o.total) AS revenue, COUNT(DISTINCT o.customer_id) AS customers
                               FROM orders o WHERE %s GROUP BY o.city, o.state ORDER BY revenue DESC LIMIT 25');
        $pins = $this->rows('SELECT o.pin, o.city, o.state, COUNT(*) AS orders, SUM(o.total) AS revenue
                             FROM orders o WHERE %s GROUP BY o.pin, o.city, o.state ORDER BY orders DESC, revenue DESC LIMIT 25');
        return ['summary' => $this->summary(), 'states' => $this->withShare($states), 'cities' => $this->withShare($cities), 'pins' => $pins];
    }

    /* ---------------- products ---------------- */
    public function products(): array
    {
        $rows = $this->rows('SELECT oi.product_name AS name, oi.product_slug AS slug, p.id, p.image,
                                    SUM(oi.qty) AS units, COUNT(DISTINCT o.id) AS orders, SUM(oi.line_total) AS revenue
                             FROM order_items oi JOIN orders o ON o.id = oi.order_id LEFT JOIN products p ON p.id = oi.product_id
                             WHERE %s GROUP BY oi.product_slug, oi.product_name, p.id, p.image ORDER BY revenue DESC');
        $cancelled = array_column(DB::all(
            "SELECT oi.product_slug AS slug, SUM(oi.qty) AS units FROM order_items oi JOIN orders o ON o.id = oi.order_id
             WHERE o.status = 'cancelled' AND o.created_at >= ? AND o.created_at < ? + INTERVAL 1 DAY GROUP BY oi.product_slug",
            [$this->from, $this->to]
        ), 'units', 'slug');
        foreach ($rows as &$r) {
            $r['cancelled_units'] = (int) ($cancelled[$r['slug']] ?? 0);
            $r['avg_units_per_order'] = $r['orders'] ? round($r['units'] / $r['orders'], 2) : 0;
        }
        unset($r);
        $byState = $this->rows('SELECT o.state, oi.product_name AS name, SUM(oi.qty) AS units FROM order_items oi JOIN orders o ON o.id = oi.order_id
                                WHERE %s GROUP BY o.state, oi.product_name ORDER BY o.state, units DESC');
        $topPerState = [];
        foreach ($byState as $r) {
            $topPerState[$r['state']] ??= ['state' => $r['state'], 'product' => $r['name'], 'units' => $r['units']];
        }
        usort($topPerState, static fn ($a, $b) => $b['units'] <=> $a['units']);
        return ['summary' => $this->summary(), 'products' => $this->withShare($rows), 'top_per_state' => array_slice($topPerState, 0, 12)];
    }

    /* ---------------- marketing ---------------- */
    public function marketing(): array
    {
        $src = "COALESCE(NULLIF(o.utm_source, ''), '(direct)')";
        // Aliases avoid "source": orders.source (web/admin) is a real column and would win in GROUP BY.
        $sources = $this->rows("SELECT $src AS channel, COUNT(*) AS orders, SUM(o.total) AS revenue, COUNT(DISTINCT o.customer_id) AS customers
                                FROM orders o WHERE %s GROUP BY channel ORDER BY revenue DESC");
        $mediums = $this->rows("SELECT COALESCE(NULLIF(o.utm_medium, ''), '(none)') AS medium, COUNT(*) AS orders, SUM(o.total) AS revenue
                                FROM orders o WHERE %s GROUP BY medium ORDER BY revenue DESC");
        $campaigns = $this->rows("SELECT o.utm_campaign AS campaign, $src AS channel, COALESCE(o.utm_medium, '') AS medium, COUNT(*) AS orders, SUM(o.total) AS revenue, SUM(o.discount) AS discount
                                  FROM orders o WHERE %s AND o.utm_campaign IS NOT NULL AND o.utm_campaign <> '' GROUP BY o.utm_campaign, channel, medium ORDER BY revenue DESC LIMIT 30");
        $landing = $this->rows("SELECT o.landing_page AS page, COUNT(*) AS orders, SUM(o.total) AS revenue
                                FROM orders o WHERE %s AND o.landing_page IS NOT NULL AND o.landing_page <> '' GROUP BY o.landing_page ORDER BY orders DESC LIMIT 15");

        $links = DB::all(
            "SELECT c.id, c.code, c.name, c.utm_source AS source, c.utm_medium AS medium, c.utm_campaign AS campaign,
                    (SELECT COUNT(*) FROM campaign_clicks k WHERE k.link_id = c.id AND k.clicked_at >= :f AND k.clicked_at < :t + INTERVAL 1 DAY) AS clicks,
                    (SELECT COUNT(*) FROM orders o WHERE o.utm_id = c.code AND " . self::VALID . " AND o.created_at >= :f AND o.created_at < :t + INTERVAL 1 DAY) AS orders,
                    (SELECT COALESCE(SUM(o.total), 0) FROM orders o WHERE o.utm_id = c.code AND " . self::VALID . " AND o.created_at >= :f AND o.created_at < :t + INTERVAL 1 DAY) AS revenue
             FROM campaign_links c ORDER BY revenue DESC, clicks DESC",
            ['f' => $this->from, 't' => $this->to]
        );
        $links = array_map(static function (array $l): array {
            $l = self::numeric($l);
            $l['conversion'] = $l['clicks'] ? round($l['orders'] / $l['clicks'] * 100, 1) : null;
            return $l;
        }, $links);

        $summary = $this->summary();
        $attributed = array_sum(array_map(static fn ($s) => $s['channel'] === '(direct)' ? 0 : $s['revenue'], $sources));
        $summary['attributed_revenue'] = round($attributed, 2);
        $summary['attributed_share'] = $summary['revenue'] ? round($attributed / $summary['revenue'] * 100, 1) : 0;
        $summary['clicks'] = array_sum(array_column($links, 'clicks'));

        return ['summary' => $summary, 'sources' => $this->withShare($sources), 'mediums' => $this->withShare($mediums), 'campaigns' => $campaigns, 'links' => $links, 'landing_pages' => $landing];
    }

    /* ---------------- customers ---------------- */
    public function customers(): array
    {
        // An order is "returning" when the same customer had an earlier non-cancelled order.
        $split = $this->rows("SELECT CASE WHEN EXISTS (SELECT 1 FROM orders p WHERE p.customer_id = o.customer_id AND p.created_at < o.created_at AND p.status <> 'cancelled')
                                          THEN 'returning' ELSE 'new' END AS kind, COUNT(*) AS orders, SUM(o.total) AS revenue
                              FROM orders o WHERE %s GROUP BY kind");
        $top = $this->rows('SELECT o.customer_id AS id, MAX(o.customer_name) AS name, MAX(o.customer_email) AS email, MAX(o.city) AS city,
                                   COUNT(*) AS orders, SUM(o.total) AS revenue, MAX(o.created_at) AS last_order
                            FROM orders o WHERE %s AND o.customer_id IS NOT NULL GROUP BY o.customer_id ORDER BY revenue DESC LIMIT 20');
        $buckets = DB::all(
            "SELECT CASE WHEN n = 1 THEN '1 order' WHEN n = 2 THEN '2 orders' WHEN n <= 4 THEN '3–4 orders' ELSE '5+ orders' END AS bucket, COUNT(*) AS customers
             FROM (SELECT customer_id, COUNT(*) AS n FROM orders WHERE status <> 'cancelled' AND customer_id IS NOT NULL GROUP BY customer_id) t
             GROUP BY bucket ORDER BY MIN(n)"
        );
        $buyers = (int) DB::value("SELECT COUNT(DISTINCT customer_id) FROM orders WHERE status <> 'cancelled' AND customer_id IS NOT NULL");
        $repeaters = (int) DB::value("SELECT COUNT(*) FROM (SELECT customer_id FROM orders WHERE status <> 'cancelled' AND customer_id IS NOT NULL GROUP BY customer_id HAVING COUNT(*) > 1) t");

        $summary = $this->summary();
        $summary['repeat_rate'] = $buyers ? round($repeaters / $buyers * 100, 1) : 0;
        $summary['new_customers'] = (int) DB::value('SELECT COUNT(*) FROM customers WHERE created_at >= ? AND created_at < ? + INTERVAL 1 DAY', [$this->from, $this->to]);

        return ['summary' => $summary, 'split' => $split, 'top' => $top, 'frequency' => array_map(static fn ($b) => ['bucket' => $b['bucket'], 'customers' => (int) $b['customers']], $buckets)];
    }

    /* ---------------- time ---------------- */
    public function time(): array
    {
        $days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
        $byDay = array_column($this->rows('SELECT DAYOFWEEK(o.created_at) AS d, COUNT(*) AS orders, SUM(o.total) AS revenue FROM orders o WHERE %s GROUP BY d'), null, 'd');
        $byHour = array_column($this->rows('SELECT HOUR(o.created_at) AS h, COUNT(*) AS orders, SUM(o.total) AS revenue FROM orders o WHERE %s GROUP BY h'), null, 'h');

        $weekdays = [];
        foreach ([2, 3, 4, 5, 6, 7, 1] as $d) { // Monday first
            $weekdays[] = ['day' => $days[$d - 1], 'orders' => (int) ($byDay[$d]['orders'] ?? 0), 'revenue' => (float) ($byDay[$d]['revenue'] ?? 0)];
        }
        $hours = [];
        for ($h = 0; $h < 24; $h++) {
            $hours[] = ['hour' => $h, 'orders' => (int) ($byHour[$h]['orders'] ?? 0), 'revenue' => (float) ($byHour[$h]['revenue'] ?? 0)];
        }
        $payments = $this->rows('SELECT o.payment_method AS method, COUNT(*) AS orders, SUM(o.total) AS revenue FROM orders o WHERE %s GROUP BY o.payment_method');
        return ['summary' => $this->summary(), 'weekdays' => $weekdays, 'hours' => $hours, 'payments' => $payments];
    }

    /* ---------------- helpers ---------------- */
    private function summary(): array
    {
        $r = DB::one('SELECT COUNT(*) AS orders, COALESCE(SUM(o.total), 0) AS revenue, COALESCE(SUM(oi.units), 0) AS units, COUNT(DISTINCT o.customer_id) AS customers
                      FROM orders o LEFT JOIN (SELECT order_id, SUM(qty) AS units FROM order_items GROUP BY order_id) oi ON oi.order_id = o.id
                      WHERE ' . self::VALID . ' AND o.created_at >= ? AND o.created_at < ? + INTERVAL 1 DAY', [$this->from, $this->to]);
        $r = self::numeric($r);
        $r['aov'] = $r['orders'] ? round($r['revenue'] / $r['orders'], 2) : 0;
        return $r;
    }

    /** Run a query whose WHERE is "%s" → valid orders in range. */
    private function rows(string $sql): array
    {
        $where = self::VALID . ' AND o.created_at >= ? AND o.created_at < ? + INTERVAL 1 DAY';
        return array_map([self::class, 'numeric'], DB::all(sprintf($sql, $where), [$this->from, $this->to]));
    }

    /** Add each row's share of total revenue (%), plus average order value where orders exist. */
    private function withShare(array $rows): array
    {
        $total = array_sum(array_column($rows, 'revenue')) ?: 1;
        return array_map(static function (array $r) use ($total): array {
            $r['share'] = round($r['revenue'] / $total * 100, 1);
            if (isset($r['orders'])) {
                $r['aov'] = $r['orders'] ? round($r['revenue'] / $r['orders'], 2) : 0;
            }
            return $r;
        }, $rows);
    }

    private static function numeric(array $r): array
    {
        foreach ($r as $k => $v) {
            if (in_array($k, ['orders', 'units', 'customers', 'clicks', 'id', 'h', 'd'], true) && $v !== null) {
                $r[$k] = (int) $v;
            } elseif (in_array($k, ['revenue', 'discount'], true)) {
                $r[$k] = (float) $v;
            }
        }
        return $r;
    }
}
