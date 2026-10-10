<?php
declare(strict_types=1);

namespace Vohra\Repositories;

use Vohra\Core\Database as DB;

final class AdminRepository
{
    private const PUBLIC_COLUMNS = 'id, name, email, role, is_active, last_login_at, created_at';

    public static function all(): array
    {
        return array_map([self::class, 'cast'], DB::all('SELECT ' . self::PUBLIC_COLUMNS . ' FROM admins ORDER BY created_at'));
    }

    public static function find(int $id): ?array
    {
        $row = DB::one('SELECT ' . self::PUBLIC_COLUMNS . ' FROM admins WHERE id = ?', [$id]);
        return $row ? self::cast($row) : null;
    }

    /** Includes password_hash — for authentication only. */
    public static function findByEmail(string $email): ?array
    {
        return DB::one('SELECT * FROM admins WHERE email = ?', [strtolower($email)]);
    }

    public static function emailTaken(string $email, int $exceptId = 0): bool
    {
        return (bool) DB::value('SELECT 1 FROM admins WHERE email = ? AND id <> ?', [$email, $exceptId]);
    }

    public static function create(array $data, string $password): int
    {
        return DB::insert('admins', $data + ['password_hash' => password_hash($password, PASSWORD_DEFAULT)]);
    }

    public static function update(int $id, array $data): void
    {
        DB::update('admins', $data, $id);
    }

    public static function setPassword(int $id, string $password): void
    {
        DB::update('admins', ['password_hash' => password_hash($password, PASSWORD_DEFAULT)], $id);
    }

    public static function touchLogin(int $id): void
    {
        DB::run('UPDATE admins SET last_login_at = NOW() WHERE id = ?', [$id]);
    }

    public static function activeAdminCount(int $exceptId = 0): int
    {
        return (int) DB::value("SELECT COUNT(*) FROM admins WHERE role = 'admin' AND is_active = 1 AND id <> ?", [$exceptId]);
    }

    public static function delete(int $id): bool
    {
        return DB::delete('admins', $id);
    }

    private static function cast(array $r): array
    {
        $r['id'] = (int) $r['id'];
        $r['is_active'] = (bool) $r['is_active'];
        return $r;
    }
}
