<?php
declare(strict_types=1);

namespace Vohra\Repositories;

use Vohra\Core\Database as DB;

/**
 * Tracked marketing links. An order is attributed to a link when its utm_id equals the link code
 * (the short link appends utm_id automatically).
 */
final class CampaignRepository
{
    private const STATS = "(SELECT COUNT(*) FROM orders o WHERE o.utm_id = c.code AND o.status <> 'cancelled') AS orders,
                           (SELECT COALESCE(SUM(o.total), 0) FROM orders o WHERE o.utm_id = c.code AND o.status <> 'cancelled') AS revenue";

    public static function list(array $f): array
    {
        $where = ['1 = 1'];
        $params = [];
        if (!empty($f['q'])) {
            $where[] = '(c.name LIKE :q OR c.code LIKE :q OR c.utm_campaign LIKE :q OR c.utm_source LIKE :q)';
            $params['q'] = '%' . $f['q'] . '%';
        }
        if (!empty($f['source'])) {
            $where[] = 'c.utm_source = :source';
            $params['source'] = $f['source'];
        }
        $rows = DB::all(
            'SELECT c.*, a.name AS created_by_name, ' . self::STATS . ' FROM campaign_links c
             LEFT JOIN admins a ON a.id = c.created_by WHERE ' . implode(' AND ', $where) . ' ORDER BY c.created_at DESC',
            $params
        );
        return array_map([self::class, 'cast'], $rows);
    }

    public static function find(int $id): ?array
    {
        $row = DB::one('SELECT c.*, a.name AS created_by_name, ' . self::STATS . ' FROM campaign_links c LEFT JOIN admins a ON a.id = c.created_by WHERE c.id = ?', [$id]);
        return $row ? self::cast($row) : null;
    }

    public static function findActiveByCode(string $code): ?array
    {
        return DB::one('SELECT * FROM campaign_links WHERE code = ? AND is_active = 1', [$code]);
    }

    public static function codeTaken(string $code): bool
    {
        return (bool) DB::value('SELECT 1 FROM campaign_links WHERE code = ?', [$code]);
    }

    public static function create(array $data): int
    {
        return DB::insert('campaign_links', $data);
    }

    public static function update(int $id, array $data): void
    {
        DB::update('campaign_links', $data, $id);
    }

    public static function delete(int $id): bool
    {
        return DB::delete('campaign_links', $id);
    }

    public static function recordClick(int $linkId, string $referrer): void
    {
        DB::insert('campaign_clicks', ['link_id' => $linkId, 'referrer' => mb_substr($referrer, 0, 255)]);
        DB::run('UPDATE campaign_links SET clicks = clicks + 1, last_clicked_at = NOW() WHERE id = ?', [$linkId]);
    }

    /** Clicks per day for one link over the last N days (gaps filled with 0). */
    public static function dailyClicks(int $linkId, int $days = 30): array
    {
        $rows = DB::all('SELECT DATE(clicked_at) AS d, COUNT(*) AS n FROM campaign_clicks WHERE link_id = ? AND clicked_at >= CURDATE() - INTERVAL ? DAY GROUP BY d', [$linkId, $days - 1]);
        $by = array_column($rows, 'n', 'd');
        $out = [];
        for ($i = $days - 1; $i >= 0; $i--) {
            $d = date('Y-m-d', strtotime("-$i days"));
            $out[] = ['date' => $d, 'clicks' => (int) ($by[$d] ?? 0)];
        }
        return $out;
    }

    /** Distinct values already used, to suggest consistent naming. */
    public static function usedValues(): array
    {
        $col = static fn (string $c): array => array_column(DB::all("SELECT DISTINCT $c AS v FROM campaign_links WHERE $c <> '' UNION SELECT DISTINCT $c FROM orders WHERE $c IS NOT NULL AND $c <> '' ORDER BY v"), 'v');
        return ['sources' => $col('utm_source'), 'mediums' => $col('utm_medium'), 'campaigns' => $col('utm_campaign')];
    }

    private static function cast(array $r): array
    {
        foreach (['id', 'clicks', 'orders'] as $k) {
            $r[$k] = (int) $r[$k];
        }
        $r['revenue'] = (float) $r['revenue'];
        $r['is_active'] = (bool) $r['is_active'];
        $r['conversion'] = $r['clicks'] ? round($r['orders'] / $r['clicks'] * 100, 1) : null;
        return $r;
    }
}
