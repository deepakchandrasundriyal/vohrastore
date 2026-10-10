<?php
declare(strict_types=1);

namespace Vohra\Controllers\Admin;

use Vohra\Auth\AdminAuth;
use Vohra\Core\HttpException;
use Vohra\Core\Request;
use Vohra\Core\Validator;
use Vohra\Repositories\AdminRepository;

/** Team management — admins only. */
final class AdminUserController
{
    public static function index(): array
    {
        AdminAuth::requireRole('admin');
        return ['data' => AdminRepository::all()];
    }

    public static function store(Request $r): array
    {
        AdminAuth::requireRole('admin');
        $data = self::validate($r->body(), 0, true);
        $password = $data['password'];
        unset($data['password']);
        return AdminRepository::find(AdminRepository::create($data, $password));
    }

    public static function update(Request $r): array
    {
        AdminAuth::requireRole('admin');
        $id = $r->id();
        AdminRepository::find($id) ?? throw HttpException::notFound('Team member');
        $data = self::validate($r->body(), $id, false);

        $isSelf = $id === AdminAuth::user()['id'];
        $losesAdmin = $data['role'] !== 'admin' || !$data['is_active'];
        if ($losesAdmin && AdminRepository::activeAdminCount($id) === 0) {
            throw HttpException::validation(['role' => 'There must be at least one active admin.']);
        }
        if ($isSelf && !$data['is_active']) {
            throw HttpException::validation(['is_active' => 'You cannot deactivate your own account.']);
        }

        if ($data['password']) {
            AdminRepository::setPassword($id, $data['password']);
        }
        unset($data['password']);
        AdminRepository::update($id, $data);
        return AdminRepository::find($id);
    }

    public static function destroy(Request $r): array
    {
        AdminAuth::requireRole('admin');
        $id = $r->id();
        if ($id === AdminAuth::user()['id']) {
            throw new HttpException('You cannot delete your own account.', 422);
        }
        if (AdminRepository::activeAdminCount($id) === 0) {
            throw new HttpException('There must be at least one active admin.', 422);
        }
        if (!AdminRepository::delete($id)) {
            throw HttpException::notFound('Team member');
        }
        return ['ok' => true];
    }

    private static function validate(array $in, int $id, bool $creating): array
    {
        $data = Validator::make($in, [
            'name'      => 'required|string|max:120',
            'email'     => 'required|email|max:190',
            'role'      => 'required|in:admin,staff',
            'is_active' => 'bool',
            'password'  => ($creating ? 'required' : 'nullable') . '|string|min:8|max:72',
        ]);
        if (AdminRepository::emailTaken($data['email'], $id)) {
            throw HttpException::validation(['email' => 'Another team member already uses this email.']);
        }
        return $data;
    }
}
