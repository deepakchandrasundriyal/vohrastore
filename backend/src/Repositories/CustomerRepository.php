<?php
declare(strict_types=1);

namespace Vohra\Repositories;

use Vohra\Core\Database as DB;

final class CustomerRepository
{
    private const STATS = "(SELECT COUNT(*) FROM orders o WHERE o.customer_id = c.id AND o.status <> 'cancelled') AS orders_count,
                           (SELECT COALESCE(SUM(o.total), 0) FROM orders o WHERE o.customer_id = c.id AND o.status <> 'cancelled') AS total_spent,
                           (SELECT MAX(o.created_at) FROM orders o WHERE o.customer_id = c.id) AS last_order_at";

    public static function paginate(array $f): array
    {
        $where = ['1 = 1'];
        $params = [];
        if (!empty($f['q'])) {
            $where[] = '(c.name LIKE :q OR c.email LIKE :q OR c.phone LIKE :q)';
            $params['q'] = '%' . $f['q'] . '%';
        }
        match ($f['type'] ?? '') {
            'registered' => $where[] = 'c.password_hash IS NOT NULL',
            'guest'      => $where[] = 'c.password_hash IS NULL',
            default      => null,
        };
        $order = DB::sort($f['sort'] ?? null, [
            'name' => 'c.name', 'created_at' => 'c.created_at', 'orders' => 'orders_count', 'spent' => 'total_spent', 'last_order' => 'last_order_at',
        ], 'c.created_at DESC');

        $page = DB::paginate(
            'c.id, c.name, c.email, c.phone, c.created_at, (c.password_hash IS NOT NULL) AS registered, ' . self::STATS,
            'FROM customers c WHERE ' . implode(' AND ', $where),
            $params,
            $order,
            (int) ($f['page'] ?? 1),
            (int) ($f['per_page'] ?? 20)
        );
        $page['data'] = array_map([self::class, 'cast'], $page['data']);
        return $page;
    }

    public static function find(int $id): ?array
    {
        $row = DB::one('SELECT c.id, c.name, c.email, c.phone, c.address, c.notes, c.last_login_at, c.created_at, c.updated_at,
                               (c.password_hash IS NOT NULL) AS registered, ' . self::STATS . ' FROM customers c WHERE c.id = ?', [$id]);
        return $row ? self::cast($row) : null;
    }

    public static function findByEmail(string $email): ?array
    {
        return DB::one('SELECT id, name, email, phone FROM customers WHERE email = ?', [strtolower($email)]);
    }

    public static function emailTaken(string $email, int $exceptId = 0): bool
    {
        return (bool) DB::value('SELECT 1 FROM customers WHERE email = ? AND id <> ?', [$email, $exceptId]);
    }

    public static function create(array $data): int
    {
        return DB::insert('customers', self::encode($data));
    }

    public static function update(int $id, array $data): void
    {
        DB::update('customers', self::encode($data), $id);
    }

    public static function delete(int $id): bool
    {
        return DB::delete('customers', $id);
    }

    /** Find by email or create; keeps name/phone fresh. Used when an order is placed. */
    public static function upsert(string $name, string $email, string $phone, array $address): int
    {
        $existing = self::findByEmail($email);
        if ($existing) {
            self::update((int) $existing['id'], ['name' => $name, 'phone' => $phone, 'address' => $address]);
            return (int) $existing['id'];
        }
        return self::create(['name' => $name, 'email' => strtolower($email), 'phone' => $phone, 'address' => $address]);
    }

    private static function encode(array $data): array
    {
        if (array_key_exists('address', $data) && is_array($data['address'])) {
            $data['address'] = json_encode($data['address'], JSON_UNESCAPED_UNICODE);
        }
        return $data;
    }

    private static function cast(array $r): array
    {
        $r['id'] = (int) $r['id'];
        $r['registered'] = (bool) $r['registered'];
        $r['orders_count'] = (int) ($r['orders_count'] ?? 0);
        $r['total_spent'] = (float) ($r['total_spent'] ?? 0);
        if (array_key_exists('address', $r)) {
            $r['address'] = $r['address'] ? json_decode($r['address'], true) : null;
        }
        return $r;
    }
}
