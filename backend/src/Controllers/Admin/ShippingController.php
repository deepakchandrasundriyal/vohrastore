<?php
declare(strict_types=1);

namespace Vohra\Controllers\Admin;

use Vohra\Auth\AdminAuth;
use Vohra\Core\HttpException;
use Vohra\Core\Request;
use Vohra\Core\Validator;
use Vohra\Repositories\OrderRepository;
use Vohra\Repositories\SettingRepository;
use Vohra\Repositories\ShipmentRepository;
use Vohra\Services\Shipping\ShippingService;
use Vohra\Services\Shipping\ShiprocketClient;
use Vohra\Support\Secret;

/** Fulfilment queue, Shiprocket actions and shipping settings. */
final class ShippingController
{
    /* ---------------- queue ---------------- */

    public static function queue(Request $r): array
    {
        $tab = (string) $r->query('tab', 'to_pack');
        if (!isset(ShipmentRepository::QUEUES[$tab])) {
            throw HttpException::notFound('Queue');
        }
        return ShipmentRepository::queue($tab, (string) $r->query('q', ''), (int) $r->query('page', 1)) + [
            'counts'     => ShipmentRepository::counts(),
            'shiprocket' => ShiprocketClient::isConfigured(),
        ];
    }

    /** POST shipping/bulk-pack {ids:[...]} — mark many "to pack" orders as packed at once. */
    public static function bulkPack(Request $r): array
    {
        $ids = array_filter(array_map('intval', (array) $r->input('ids', [])));
        if (!$ids || count($ids) > 100) {
            throw HttpException::validation(['ids' => 'Select between 1 and 100 orders.']);
        }
        $done = 0;
        foreach ($ids as $id) {
            $done += \Vohra\Services\OrderService::advanceTo($id, 'packed', 'Packed', AdminAuth::user()['id']) ? 1 : 0;
        }
        return ['packed' => $done];
    }

    /** GET shipping/slips?ids=1,2,3 — data for printing packing slips. */
    public static function slips(Request $r): array
    {
        $ids = array_slice(array_filter(array_map('intval', explode(',', (string) $r->query('ids', '')))), 0, 50);
        $orders = array_values(array_filter(array_map([OrderRepository::class, 'find'], $ids)));
        foreach ($orders as &$o) {
            $o['shipment'] = ShipmentRepository::findByOrder($o['id']);
        }
        return ['data' => $orders, 'store' => SettingRepository::publicAll()];
    }

    /* ---------------- per-order actions ---------------- */

    /** GET orders/{id}/shipping — current shipment + suggested package. */
    public static function show(Request $r): array
    {
        $order = OrderRepository::find($r->id()) ?? throw HttpException::notFound('Order');
        return [
            'shipment'   => ShippingService::forOrder($order['id']),
            'package'    => ShippingService::defaultPackage($order),
            'shiprocket' => ShiprocketClient::isConfigured(),
        ];
    }

    public static function rates(Request $r): array
    {
        return ['couriers' => ShippingService::rates($r->id(), $r->body())];
    }

    public static function ship(Request $r): array
    {
        return ['shipment' => ShippingService::ship($r->id(), $r->body(), AdminAuth::user()['id'])];
    }

    public static function retryAwb(Request $r): array
    {
        return ['shipment' => ShippingService::assignAwb($r->id(), (int) $r->input('courier_id', 0) ?: null, AdminAuth::user()['id'])];
    }

    public static function manual(Request $r): array
    {
        return ['shipment' => ShippingService::manual($r->id(), $r->body(), AdminAuth::user()['id'])];
    }

    public static function manualStatus(Request $r): array
    {
        return ['shipment' => ShippingService::manualStatus($r->id(), (string) $r->input('status'), AdminAuth::user()['id'])];
    }

    public static function pickup(Request $r): array
    {
        return ['shipment' => ShippingService::schedulePickup($r->id())];
    }

    public static function document(Request $r): array
    {
        return ['url' => ShippingService::document($r->id(), $r->param('type'))];
    }

    public static function track(Request $r): array
    {
        return ['shipment' => ShippingService::sync($r->id())];
    }

    public static function cancel(Request $r): array
    {
        return ['shipment' => ShippingService::cancel($r->id(), AdminAuth::user()['id'])];
    }

    public static function syncAll(): array
    {
        if (!ShiprocketClient::isConfigured()) {
            throw new HttpException('Shiprocket is not connected.', 422);
        }
        return ShippingService::syncActive(25);
    }

    /* ---------------- settings ---------------- */

    public static function settings(): array
    {
        $s = SettingRepository::all();
        if ($s['shiprocket_webhook_token'] === '') {
            $s['shiprocket_webhook_token'] = bin2hex(random_bytes(16));
            SettingRepository::save(['shiprocket_webhook_token' => $s['shiprocket_webhook_token']]);
        }
        return [
            'shiprocket_enabled'     => (bool) $s['shiprocket_enabled'],
            'shiprocket_email'       => $s['shiprocket_email'],
            'has_password'           => $s['shiprocket_password'] !== '',
            'connected'              => ShiprocketClient::isConfigured() && (int) $s['shiprocket_token_expires'] > time(),
            'pickup_location'        => $s['pickup_location'],
            'pickup_pincode'         => $s['pickup_pincode'],
            'package_unit_weight_kg' => (float) $s['package_unit_weight_kg'],
            'package_base_weight_kg' => (float) $s['package_base_weight_kg'],
            'package_length_cm'      => (float) $s['package_length_cm'],
            'package_breadth_cm'     => (float) $s['package_breadth_cm'],
            'package_height_cm'      => (float) $s['package_height_cm'],
            // Shiprocket rejects webhook URLs containing "shiprocket", hence the neutral file name.
            'webhook_url'            => rtrim((string) $s['site_url'], '/') . '/api/courier-webhook.php',
            'webhook_token'          => AdminAuth::user()['role'] === 'admin' ? $s['shiprocket_webhook_token'] : null,
        ];
    }

    public static function saveSettings(Request $r): array
    {
        AdminAuth::requireRole('admin');
        $data = Validator::make($r->body(), [
            'shiprocket_enabled'     => 'bool',
            'shiprocket_email'       => 'nullable|email|max:190',
            'shiprocket_password'    => 'nullable|string|max:200',
            'pickup_location'        => 'nullable|string|max:120',
            'pickup_pincode'         => 'nullable|pin',
            'package_unit_weight_kg' => 'required|numeric|min:0.01|max:20',
            'package_base_weight_kg' => 'required|numeric|min:0|max:20',
            'package_length_cm'      => 'required|numeric|min:1|max:300',
            'package_breadth_cm'     => 'required|numeric|min:1|max:300',
            'package_height_cm'      => 'required|numeric|min:1|max:300',
        ], ['shiprocket_email' => 'API email', 'shiprocket_password' => 'API password', 'pickup_pincode' => 'Pickup PIN code',
            'package_unit_weight_kg' => 'Weight per tin', 'package_base_weight_kg' => 'Box weight']);

        $current = SettingRepository::all();
        $data['shiprocket_enabled'] = (bool) $data['shiprocket_enabled'];
        $data['shiprocket_email'] = (string) $data['shiprocket_email'];
        $data['pickup_location'] = (string) $data['pickup_location'];
        $data['pickup_pincode'] = (string) $data['pickup_pincode'];
        if ($data['shiprocket_password']) {
            $data['shiprocket_password'] = Secret::encrypt($data['shiprocket_password']);
        } else {
            unset($data['shiprocket_password']); // empty = keep the saved password
        }
        if ($data['shiprocket_email'] !== $current['shiprocket_email'] || isset($data['shiprocket_password'])) {
            $data['shiprocket_token'] = '';          // force a fresh login with the new credentials
            $data['shiprocket_token_expires'] = 0;
        }
        if ($data['shiprocket_enabled'] && ($data['shiprocket_email'] === '' || (!isset($data['shiprocket_password']) && $current['shiprocket_password'] === ''))) {
            throw HttpException::validation(['shiprocket_email' => 'Add the API email and password to turn Shiprocket on.']);
        }
        SettingRepository::save($data);
        return self::settings();
    }

    /** POST shipping/test — log in and list pickup locations. */
    public static function test(): array
    {
        AdminAuth::requireRole('admin');
        ShiprocketClient::login();
        return ['ok' => true, 'pickup_locations' => ShiprocketClient::pickupLocations()];
    }

    public static function rotateWebhookToken(): array
    {
        AdminAuth::requireRole('admin');
        SettingRepository::save(['shiprocket_webhook_token' => bin2hex(random_bytes(16))]);
        return self::settings();
    }
}
