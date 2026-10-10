<?php
declare(strict_types=1);

namespace Vohra\Services;

use Vohra\Core\HttpException;
use Vohra\Repositories\CouponRepository;
use Vohra\Repositories\SettingRepository;

/** The single source of truth for order totals: subtotal → coupon → shipping → total. */
final class PricingService
{
    /**
     * @param array $lines  [['product' => [...id, name, price], 'qty' => int], ...]
     * @return array{lines: array, subtotal: float, discount: float, shipping: float, total: float, coupon: ?array}
     */
    public static function quote(array $lines, ?string $couponCode): array
    {
        $priced = array_map(static fn (array $l): array => $l + ['line_total' => round($l['product']['price'] * $l['qty'], 2)], $lines);
        $subtotal = round(array_sum(array_column($priced, 'line_total')), 2);

        $coupon = $couponCode ? self::validCoupon($couponCode, $subtotal) : null;
        $discount = $coupon ? self::discount($coupon, $subtotal) : 0.0;

        $settings = SettingRepository::all();
        $afterDiscount = $subtotal - $discount;
        $shipping = ($subtotal <= 0 || $afterDiscount >= (float) $settings['free_shipping_above']) ? 0.0 : (float) $settings['flat_shipping'];

        return [
            'lines'    => $priced,
            'subtotal' => $subtotal,
            'discount' => $discount,
            'shipping' => $shipping,
            'total'    => round($afterDiscount + $shipping, 2),
            'coupon'   => $coupon,
        ];
    }

    /** Returns the coupon if it can be used on this subtotal, otherwise throws with a reason. */
    public static function validCoupon(string $code, float $subtotal): array
    {
        $c = CouponRepository::findByCode($code);
        $now = time();
        $reason = match (true) {
            !$c || !$c['is_active']                                 => 'This coupon code is not valid.',
            $c['starts_at'] && strtotime($c['starts_at']) > $now    => 'This coupon is not active yet.',
            $c['expires_at'] && strtotime($c['expires_at']) <= $now => 'This coupon has expired.',
            $c['max_uses'] !== null && $c['used_count'] >= $c['max_uses'] => 'This coupon has reached its usage limit.',
            $subtotal < $c['min_order']                             => 'This coupon needs a minimum order of ₹' . number_format($c['min_order']) . '.',
            default => null,
        };
        if ($reason) {
            throw HttpException::validation(['coupon_code' => $reason]);
        }
        return $c;
    }

    private static function discount(array $coupon, float $subtotal): float
    {
        $d = $coupon['type'] === 'percent' ? round($subtotal * $coupon['value'] / 100) : min($subtotal, $coupon['value']);
        return round((float) $d, 2);
    }
}
