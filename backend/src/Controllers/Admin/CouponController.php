<?php
declare(strict_types=1);

namespace Vohra\Controllers\Admin;

use Vohra\Core\HttpException;
use Vohra\Core\Request;
use Vohra\Core\Validator;
use Vohra\Repositories\CouponRepository;

final class CouponController
{
    public static function index(Request $r): array
    {
        return ['data' => CouponRepository::list(['q' => $r->query('q'), 'status' => $r->query('status')])];
    }

    public static function show(Request $r): array
    {
        return CouponRepository::find($r->id()) ?? throw HttpException::notFound('Coupon');
    }

    public static function store(Request $r): array
    {
        $id = CouponRepository::create(self::validate($r->body()));
        return CouponRepository::find($id);
    }

    public static function update(Request $r): array
    {
        $id = $r->id();
        CouponRepository::find($id) ?? throw HttpException::notFound('Coupon');
        CouponRepository::update($id, self::validate($r->body(), $id));
        return CouponRepository::find($id);
    }

    public static function toggle(Request $r): array
    {
        $coupon = CouponRepository::find($r->id()) ?? throw HttpException::notFound('Coupon');
        CouponRepository::update($coupon['id'], ['is_active' => $coupon['is_active'] ? 0 : 1]);
        return CouponRepository::find($coupon['id']);
    }

    public static function destroy(Request $r): array
    {
        if (!CouponRepository::delete($r->id())) {
            throw HttpException::notFound('Coupon');
        }
        return ['ok' => true];
    }

    private static function validate(array $in, int $id = 0): array
    {
        $in['code'] = strtoupper(trim((string) ($in['code'] ?? '')));
        $data = Validator::make($in, [
            'code'       => 'required|string|min:3|max:40',
            'type'       => 'required|in:percent,flat',
            'value'      => 'required|numeric|min:1|max:100000',
            'label'      => 'required|string|max:120',
            'min_order'  => 'nullable|numeric|min:0|max:1000000',
            'max_uses'   => 'nullable|int|min:1|max:10000000',
            'starts_at'  => 'nullable|date',
            'expires_at' => 'nullable|date',
            'is_active'  => 'bool',
        ], ['min_order' => 'Minimum order', 'max_uses' => 'Usage limit', 'starts_at' => 'Start date', 'expires_at' => 'End date']);

        $errors = [];
        if (!preg_match('/^[A-Z0-9_-]+$/', $data['code'])) {
            $errors['code'] = 'Use only letters, numbers, dashes and underscores.';
        } elseif (CouponRepository::codeTaken($data['code'], $id)) {
            $errors['code'] = 'This code already exists.';
        }
        if ($data['type'] === 'percent' && $data['value'] > 90) {
            $errors['value'] = 'A percentage discount cannot be more than 90%.';
        }
        if ($data['starts_at'] && $data['expires_at'] && strtotime($data['expires_at']) <= strtotime($data['starts_at'])) {
            $errors['expires_at'] = 'End date must be after the start date.';
        }
        if ($errors) {
            throw HttpException::validation($errors);
        }
        $data['min_order'] ??= 0;
        return $data;
    }
}
