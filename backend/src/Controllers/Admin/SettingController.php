<?php
declare(strict_types=1);

namespace Vohra\Controllers\Admin;

use Vohra\Auth\AdminAuth;
use Vohra\Core\Request;
use Vohra\Core\Validator;
use Vohra\Repositories\SettingRepository;

final class SettingController
{
    public static function show(): array
    {
        return SettingRepository::publicAll();
    }

    public static function update(Request $r): array
    {
        AdminAuth::requireRole('admin');
        $data = Validator::make($r->body(), [
            'store_name'          => 'required|string|max:120',
            'site_url'            => 'required|string|max:190',
            'support_email'       => 'required|email|max:190',
            'support_phone'       => 'required|string|max:30',
            'free_shipping_above' => 'required|numeric|min:0|max:1000000',
            'flat_shipping'       => 'required|numeric|min:0|max:10000',
            'cod_enabled'         => 'bool',
            'low_stock_default'   => 'required|int|min:0|max:100000',
        ], ['free_shipping_above' => 'Free shipping threshold', 'flat_shipping' => 'Shipping charge', 'low_stock_default' => 'Default low-stock alert']);
        $data['cod_enabled'] = (bool) $data['cod_enabled'];
        if (!filter_var($data['site_url'], FILTER_VALIDATE_URL) || !preg_match('#^https?://#', $data['site_url'])) {
            throw \Vohra\Core\HttpException::validation(['site_url' => 'Enter the full store address, e.g. https://vohrastore.com/']);
        }
        $data['site_url'] = rtrim($data['site_url'], '/') . '/';
        SettingRepository::save($data);
        return SettingRepository::publicAll();
    }
}
