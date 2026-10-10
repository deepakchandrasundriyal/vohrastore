<?php
declare(strict_types=1);

namespace Vohra\Repositories;

use Vohra\Core\Database as DB;

/** Key/value store settings. Defaults live here so a missing row never breaks pricing or shipping. */
final class SettingRepository
{
    public const DEFAULTS = [
        'store_name'          => "Vohra's Store",
        'site_url'            => 'http://127.0.0.1/vohrastore/dist/', // public storefront URL, used to build marketing links
        'support_email'       => 'vtcdelhi2002@gmail.com',
        'support_phone'       => '+91 88262 69797',
        'free_shipping_above' => 499,
        'flat_shipping'       => 49,
        'cod_enabled'         => true,
        'low_stock_default'   => 10,

        // Shipping / Shiprocket
        'shiprocket_enabled'       => false,
        'shiprocket_email'         => '',
        'shiprocket_password'      => '',   // encrypted (Support\Secret)
        'shiprocket_token'         => '',   // encrypted, cached API token
        'shiprocket_token_expires' => 0,
        'shiprocket_webhook_token' => '',   // shared secret Shiprocket sends in x-api-key
        'pickup_location'          => '',   // pickup location nickname as set up in Shiprocket
        'pickup_pincode'           => '',
        'package_unit_weight_kg'   => 0.15, // one tin incl. its share of packing
        'package_base_weight_kg'   => 0.10, // carton + filler
        'package_length_cm'        => 20,
        'package_breadth_cm'       => 15,
        'package_height_cm'        => 12,
    ];

    /** Never sent to the browser through the general settings endpoint. */
    private const PRIVATE = ['shiprocket_password', 'shiprocket_token', 'shiprocket_token_expires', 'shiprocket_webhook_token'];

    public static function all(): array
    {
        $stored = [];
        foreach (DB::all('SELECT `key`, `value` FROM settings') as $r) {
            $stored[$r['key']] = json_decode($r['value'], true);
        }
        return array_intersect_key($stored, self::DEFAULTS) + self::DEFAULTS;
    }

    /** Safe for any signed-in admin: secrets removed. */
    public static function publicAll(): array
    {
        return array_diff_key(self::all(), array_flip(self::PRIVATE));
    }

    public static function get(string $key): mixed
    {
        return self::all()[$key] ?? null;
    }

    public static function save(array $values): void
    {
        foreach (array_intersect_key($values, self::DEFAULTS) as $key => $value) {
            DB::run(
                'INSERT INTO settings (`key`, `value`) VALUES (?, ?) ON DUPLICATE KEY UPDATE `value` = VALUES(`value`)',
                [$key, json_encode($value, JSON_UNESCAPED_UNICODE)]
            );
        }
    }
}
