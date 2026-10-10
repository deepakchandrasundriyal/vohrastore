<?php
declare(strict_types=1);

namespace Vohra\Services;

/**
 * Normalises marketing attribution (UTM parameters, landing page, referrer) before it is stored on an order.
 * Source/medium are lower-cased so "Instagram" and "instagram" report as one channel.
 */
final class Attribution
{
    public const FIELDS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 'utm_id', 'landing_page', 'referrer'];
    private const LIMITS = ['utm_id' => 12, 'landing_page' => 255, 'referrer' => 255];

    /** Common channels offered in the admin; any other value is still accepted. */
    public const SOURCES = ['google', 'instagram', 'facebook', 'whatsapp', 'youtube', 'email', 'sms', 'influencer', 'phone', 'walk-in'];
    public const MEDIUMS = ['cpc', 'social', 'paid_social', 'organic', 'email', 'referral', 'affiliate', 'qr', 'offline'];

    /** @return array<string, ?string> every field present, empty → null */
    public static function clean(array $input): array
    {
        $out = [];
        foreach (self::FIELDS as $f) {
            $v = trim(strip_tags((string) ($input[$f] ?? '')));
            if (in_array($f, ['utm_source', 'utm_medium'], true)) {
                $v = strtolower(preg_replace('/\s+/', '_', $v));
            }
            $out[$f] = $v === '' ? null : mb_substr($v, 0, self::LIMITS[$f] ?? 100);
        }
        return $out;
    }

    /** Human label for reports: "instagram / social". */
    public static function label(?string $source, ?string $medium): string
    {
        return $source ? $source . ($medium ? " / $medium" : '') : '(direct / none)';
    }
}
