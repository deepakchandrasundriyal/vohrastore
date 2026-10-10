<?php
declare(strict_types=1);

namespace Vohra\Controllers\Admin;

use Vohra\Auth\AdminAuth;
use Vohra\Core\HttpException;
use Vohra\Core\Request;
use Vohra\Core\Validator;
use Vohra\Repositories\AdminRepository;
use Vohra\Repositories\EnquiryRepository;
use Vohra\Repositories\OrderRepository;

final class AuthController
{
    /** GET auth/session — who is signed in (null when signed out), the CSRF token and sidebar badge counts. */
    public static function session(): array
    {
        $user = AdminAuth::user();
        return [
            'user'   => $user,
            'csrf'   => AdminAuth::csrfToken(),
            'badges' => $user ? [
                'orders'    => OrderRepository::statusCounts()['placed'],
                'shipping'  => (int) \Vohra\Core\Database::value(
                    'SELECT COUNT(*) FROM orders o LEFT JOIN shipments s ON s.order_id = o.id WHERE ' . \Vohra\Repositories\ShipmentRepository::QUEUES['to_pack']
                ),
                'latest_order_id' => (int) \Vohra\Core\Database::value('SELECT COALESCE(MAX(id), 0) FROM orders'),
                'enquiries' => EnquiryRepository::statusCounts()['new'],
            ] : null,
        ];
    }

    public static function login(Request $r): array
    {
        $data = Validator::make($r->body(), ['email' => 'required|email', 'password' => 'required|string']);
        $user = AdminAuth::attempt($data['email'], $data['password'], $r);
        return ['user' => $user, 'csrf' => AdminAuth::csrfToken()];
    }

    public static function logout(): array
    {
        AdminAuth::logout();
        return ['ok' => true];
    }

    /** PUT auth/profile — update own name/email and optionally password. */
    public static function updateProfile(Request $r): array
    {
        $me = AdminAuth::user();
        $data = Validator::make($r->body(), [
            'name'             => 'required|string|max:120',
            'email'            => 'required|email|max:190',
            'current_password' => 'nullable|string',
            'new_password'     => 'nullable|string|min:8|max:72',
        ]);
        if (AdminRepository::emailTaken($data['email'], $me['id'])) {
            throw HttpException::validation(['email' => 'Another admin already uses this email.']);
        }
        if ($data['new_password']) {
            $full = AdminRepository::findByEmail($me['email']);
            if (!$data['current_password'] || !password_verify($data['current_password'], $full['password_hash'])) {
                throw HttpException::validation(['current_password' => 'Your current password is incorrect.']);
            }
            AdminRepository::setPassword($me['id'], $data['new_password']);
        }
        AdminRepository::update($me['id'], ['name' => $data['name'], 'email' => $data['email']]);
        return ['user' => AdminRepository::find($me['id'])];
    }
}
