<?php
declare(strict_types=1);

namespace Vohra\Auth;

use Vohra\Core\Config;
use Vohra\Core\Database;
use Vohra\Core\HttpException;
use Vohra\Core\Request;
use Vohra\Repositories\AdminRepository;

/**
 * Session-based admin authentication.
 *  - password_hash / password_verify
 *  - session id regenerated on login
 *  - CSRF token required on every state-changing request (X-CSRF-Token header)
 *  - 5 failed logins per IP per 15 minutes, then a temporary lock
 */
final class AdminAuth
{
    private const MAX_ATTEMPTS = 5;
    private const LOCK_MINUTES = 15;

    public static function start(): void
    {
        if (session_status() === PHP_SESSION_ACTIVE) {
            return;
        }
        session_name(Config::get('app.session_name'));
        session_set_cookie_params([
            'lifetime' => 0,
            'path'     => '/',
            'secure'   => !empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off',
            'httponly' => true,
            'samesite' => 'Strict',
        ]);
        session_start();
    }

    public static function attempt(string $email, string $password, Request $request): array
    {
        self::guardThrottle($request->ip());

        $admin = AdminRepository::findByEmail($email);
        if (!$admin || !$admin['is_active'] || !password_verify($password, $admin['password_hash'])) {
            Database::insert('login_attempts', ['scope' => 'admin', 'ip' => $request->ip(), 'email' => $email]);
            throw new HttpException('Incorrect email or password.', 401);
        }

        Database::run("DELETE FROM login_attempts WHERE scope = 'admin' AND ip = ?", [$request->ip()]);
        if (password_needs_rehash($admin['password_hash'], PASSWORD_DEFAULT)) {
            AdminRepository::setPassword((int) $admin['id'], $password);
        }
        AdminRepository::touchLogin((int) $admin['id']);

        session_regenerate_id(true);
        $_SESSION['admin_id'] = (int) $admin['id'];
        $_SESSION['csrf'] = bin2hex(random_bytes(32));

        return self::user();
    }

    public static function logout(): void
    {
        $_SESSION = [];
        if (ini_get('session.use_cookies')) {
            $p = session_get_cookie_params();
            setcookie(session_name(), '', time() - 3600, $p['path'], $p['domain'], $p['secure'], $p['httponly']);
        }
        session_destroy();
    }

    /** Current admin (without password hash) or null. */
    public static function user(): ?array
    {
        static $cache = null;
        $id = $_SESSION['admin_id'] ?? null;
        if (!$id) {
            return null;
        }
        if ($cache === null || $cache['id'] !== $id) {
            $admin = AdminRepository::find((int) $id);
            if (!$admin || !$admin['is_active']) {
                self::logout();
                return null;
            }
            $cache = $admin;
        }
        return $cache;
    }

    public static function csrfToken(): string
    {
        return $_SESSION['csrf'] ?? '';
    }

    /** Middleware: require a signed-in admin and a valid CSRF token for writes. */
    public static function guard(Request $request, string $route): void
    {
        if (in_array($route, ['auth/login', 'auth/session'], true)) {
            return;
        }
        if (!self::user()) {
            throw new HttpException('Your session has expired. Please sign in again.', 401);
        }
        if ($request->method() !== 'GET' && !hash_equals(self::csrfToken(), $request->header('X-CSRF-Token'))) {
            throw new HttpException('Security token mismatch. Refresh the page and try again.', 403);
        }
    }

    public static function requireRole(string $role): void
    {
        if ((self::user()['role'] ?? '') !== $role) {
            throw new HttpException('You do not have permission to do this.', 403);
        }
    }

    private static function guardThrottle(string $ip): void
    {
        $count = (int) Database::value(
            "SELECT COUNT(*) FROM login_attempts WHERE scope = 'admin' AND ip = ? AND attempted_at > NOW() - INTERVAL ? MINUTE",
            [$ip, self::LOCK_MINUTES]
        );
        if ($count >= self::MAX_ATTEMPTS) {
            throw new HttpException('Too many failed attempts. Try again in ' . self::LOCK_MINUTES . ' minutes.', 429);
        }
    }
}
