<?php
declare(strict_types=1);

namespace Vohra\Repositories;

use Vohra\Core\Database as DB;

final class CouponRepository
{
    private const STATS = "(SELECT COALESCE(SUM(o.discount), 0) FROM orders o WHERE o.coupon_code = c.code AND o.status <> 'cancelled') AS discount_given,
                           (SELECT COALESCE(SUM(o.total), 0) FROM orders o WHERE o.coupon_code = c.code AND o.status <> 'cancelled') AS revenue";

    public static function list(array $f): array
    {
        $where = ['1 = 1'];
        $params = [];
        if (!empty($f['q'])) {
            $where[] = '(c.code LIKE :q OR c.label LIKE :q)';
            $params['q'] = '%' . $f['q'] . '%';
        }
        match ($f['status'] ?? '') {
            'active'   => $where[] = 'c.is_active = 1 AND (c.expires_at IS NULL OR c.expires_at > NOW())',
            'expired'  => $where[] = 'c.expires_at IS NOT NULL AND c.expires_at <= NOW()',
            'inactive' => $where[] = 'c.is_active = 0',
            default    => null,
        };
        $rows = DB::all('SELECT c.*, ' . self::STATS . ' FROM coupons c WHERE ' . implode(' AND ', $where) . ' ORDER BY c.created_at DESC', $params);
        return array_map([self::class, 'cast'], $rows);
    }

    public static function find(int $id): ?array
    {
        $row = DB::one('SELECT c.*, ' . self::STATS . ' FROM coupons c WHERE c.id = ?', [$id]);
        return $row ? self::cast($row) : null;
    }

    public static function findByCode(string $code): ?array
    {
        $row = DB::one('SELECT * FROM coupons WHERE code = ?', [strtoupper(trim($code))]);
        return $row ? self::cast($row) : null;
    }

    public static function codeTaken(string $code, int $exceptId = 0): bool
    {
        return (bool) DB::value('SELECT 1 FROM coupons WHERE code = ? AND id <> ?', [$code, $exceptId]);
    }

    public static function create(array $data): int
    {
        return DB::insert('coupons', $data);
    }

    public static function update(int $id, array $data): void
    {
        DB::update('coupons', $data, $id);
    }

    public static function delete(int $id): bool
    {
        return DB::delete('coupons', $id);
    }

    public static function adjustUsage(string $code, int $delta): void
    {
        DB::run('UPDATE coupons SET used_count = GREATEST(0, CAST(used_count AS SIGNED) + ?) WHERE code = ?', [$delta, $code]);
    }

    private static function cast(array $r): array
    {
        $r['id'] = (int) $r['id'];
        $r['is_active'] = (bool) $r['is_active'];
        $r['used_count'] = (int) $r['used_count'];
        $r['max_uses'] = $r['max_uses'] === null ? null : (int) $r['max_uses'];
        foreach (['value', 'min_order', 'discount_given', 'revenue'] as $k) {
            if (isset($r[$k])) {
                $r[$k] = (float) $r[$k];
            }
        }
        return $r;
    }
}
