<?php
declare(strict_types=1);

namespace Vohra\Services\Shipping;

use Vohra\Core\HttpException;
use Vohra\Repositories\SettingRepository;
use Vohra\Support\Secret;

/**
 * Thin client for the Shiprocket external API (https://apiv2.shiprocket.in/v1/external).
 * Logs in with the API user's email/password, caches the token (valid ~10 days) encrypted in settings,
 * and turns every API error into a readable HttpException (502) for the admin.
 */
final class ShiprocketClient
{
    private const BASE = 'https://apiv2.shiprocket.in/v1/external/';
    private const TOKEN_TTL = 9 * 86400; // refresh a day before Shiprocket's 10-day expiry

    public static function isConfigured(): bool
    {
        $s = SettingRepository::all();
        return $s['shiprocket_enabled'] && $s['shiprocket_email'] !== '' && $s['shiprocket_password'] !== '';
    }

    /** Log in with explicit credentials (used by "Test connection"); caches the token on success. */
    public static function login(?string $email = null, ?string $password = null): string
    {
        $s = SettingRepository::all();
        $email ??= $s['shiprocket_email'];
        $password ??= Secret::decrypt($s['shiprocket_password']) ?? '';
        if ($email === '' || $password === '') {
            throw new HttpException('Add your Shiprocket API email and password in Settings → Shipping first.', 422);
        }
        try {
            $res = self::send('POST', 'auth/login', ['email' => $email, 'password' => $password], null);
        } catch (HttpException $e) {
            // Never let Shiprocket's 401 reach the browser: the admin app would treat it as *its own* session expiring.
            throw new HttpException('Shiprocket rejected the email/password. Use the API user created under Shiprocket → Settings → API.', 422);
        }
        if (empty($res['token'])) {
            throw new HttpException('Shiprocket did not accept these credentials. Use the API user (Settings → API → Create an API user in Shiprocket).', 502);
        }
        SettingRepository::save(['shiprocket_token' => Secret::encrypt($res['token']), 'shiprocket_token_expires' => time() + self::TOKEN_TTL]);
        return $res['token'];
    }

    public static function pickupLocations(): array
    {
        $res = self::call('GET', 'settings/company/pickup');
        return array_map(static fn (array $p): array => [
            'name' => (string) ($p['pickup_location'] ?? ''), 'pincode' => (string) ($p['pin_code'] ?? ''),
            'address' => trim(($p['address'] ?? '') . ', ' . ($p['city'] ?? '') . ', ' . ($p['state'] ?? ''), ', '),
        ], $res['data']['shipping_address'] ?? []);
    }

    /** Couriers that can deliver this parcel, with rates. */
    public static function serviceability(string $pickupPin, string $deliveryPin, float $weightKg, bool $cod, float $declaredValue): array
    {
        $res = self::call('GET', 'courier/serviceability/?' . http_build_query([
            'pickup_postcode' => $pickupPin, 'delivery_postcode' => $deliveryPin, 'weight' => $weightKg, 'cod' => $cod ? 1 : 0, 'declared_value' => $declaredValue,
        ]));
        $recommended = (int) ($res['data']['recommended_courier_company_id'] ?? 0);
        $out = array_map(static fn (array $c): array => [
            'id'            => (int) $c['courier_company_id'],
            'name'          => (string) $c['courier_name'],
            'rate'          => (float) ($c['rate'] ?? $c['freight_charge'] ?? 0),
            'etd'           => (string) ($c['etd'] ?? ''),
            'days'          => (string) ($c['estimated_delivery_days'] ?? ''),
            'rating'        => isset($c['rating']) ? (float) $c['rating'] : null,
            'cod'           => (bool) ($c['cod'] ?? false),
            'pickup'        => (string) ($c['pickup_availability'] ?? ''),
            'recommended'   => (int) $c['courier_company_id'] === $recommended,
        ], $res['data']['available_courier_companies'] ?? []);
        usort($out, static fn ($a, $b) => [$b['recommended'], $a['rate']] <=> [$a['recommended'], $b['rate']]);
        return $out;
    }

    public static function createOrder(array $payload): array
    {
        $res = self::call('POST', 'orders/create/adhoc', $payload);
        if (empty($res['shipment_id'])) {
            throw new HttpException('Shiprocket could not create the order: ' . self::message($res), 502);
        }
        return $res;
    }

    public static function assignAwb(int $shipmentId, ?int $courierId): array
    {
        $res = self::call('POST', 'courier/assign/awb', array_filter(['shipment_id' => $shipmentId, 'courier_id' => $courierId]));
        $data = $res['response']['data'] ?? null;
        if (($res['awb_assign_status'] ?? 0) != 1 || empty($data['awb_code'])) {
            throw new HttpException('No AWB assigned: ' . self::message($res['response']['data'] ?? $res), 502);
        }
        return $data;
    }

    public static function generatePickup(int $shipmentId): array
    {
        $res = self::call('POST', 'courier/generate/pickup', ['shipment_id' => [$shipmentId]]);
        if (($res['pickup_status'] ?? 0) != 1) {
            throw new HttpException('Pickup not scheduled: ' . self::message($res['response'] ?? $res), 502);
        }
        return $res['response'] ?? [];
    }

    public static function label(int $shipmentId): string
    {
        $res = self::call('POST', 'courier/generate/label', ['shipment_id' => [$shipmentId]]);
        return (string) ($res['label_url'] ?? '') ?: throw new HttpException('Label not ready yet: ' . self::message($res), 502);
    }

    public static function manifest(int $shipmentId, int $srOrderId): string
    {
        $res = self::call('POST', 'manifests/generate', ['shipment_id' => [$shipmentId]]);
        if (!empty($res['manifest_url'])) {
            return (string) $res['manifest_url'];
        }
        // Already generated once → print it instead.
        $print = self::call('POST', 'manifests/print', ['order_ids' => [$srOrderId]]);
        return (string) ($print['manifest_url'] ?? '') ?: throw new HttpException('Manifest not available: ' . self::message($res), 502);
    }

    public static function invoice(int $srOrderId): string
    {
        $res = self::call('POST', 'orders/print/invoice', ['ids' => [$srOrderId]]);
        return (string) ($res['invoice_url'] ?? '') ?: throw new HttpException('Invoice not available: ' . self::message($res), 502);
    }

    public static function trackAwb(string $awb): array
    {
        $res = self::call('GET', 'courier/track/awb/' . rawurlencode($awb));
        return $res['tracking_data'] ?? [];
    }

    public static function cancelOrder(int $srOrderId): void
    {
        self::call('POST', 'orders/cancel', ['ids' => [$srOrderId]]);
    }

    /* ---------------- transport ---------------- */

    private static function call(string $method, string $path, ?array $body = null): array
    {
        $s = SettingRepository::all();
        $token = Secret::decrypt($s['shiprocket_token']);
        if (!$token || (int) $s['shiprocket_token_expires'] < time()) {
            $token = self::login();
        }
        try {
            return self::send($method, $path, $body, $token);
        } catch (HttpException $e) {
            if ($e->status() !== 401) {
                throw $e;
            }
            try {
                return self::send($method, $path, $body, self::login()); // token revoked early → log in once more
            } catch (HttpException $retry) {
                throw $retry->status() === 401 ? new HttpException('Shiprocket refused access. Check the API user in Settings → Shipping.', 502) : $retry;
            }
        }
    }

    private static function send(string $method, string $path, ?array $body, ?string $token): array
    {
        $ch = curl_init(self::BASE . $path);
        $headers = ['Accept: application/json', 'Content-Type: application/json'];
        if ($token) {
            $headers[] = 'Authorization: Bearer ' . $token;
        }
        curl_setopt_array($ch, [
            CURLOPT_CUSTOMREQUEST  => $method,
            CURLOPT_HTTPHEADER     => $headers,
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_CONNECTTIMEOUT => 10,
            CURLOPT_TIMEOUT        => 30,
        ]);
        if ($body !== null && $method !== 'GET') {
            curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($body, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES));
        }
        $raw = curl_exec($ch);
        $status = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $error = curl_error($ch);
        curl_close($ch);

        if ($raw === false) {
            throw new HttpException("Could not reach Shiprocket ($error). Check the server's internet connection.", 502);
        }
        $data = json_decode((string) $raw, true);
        if (!is_array($data)) {
            $data = ['message' => mb_substr(strip_tags((string) $raw), 0, 200)];
        }
        if ($status === 401) {
            throw new HttpException('Shiprocket login expired or invalid.', 401);
        }
        if ($status >= 400) {
            throw new HttpException('Shiprocket: ' . self::message($data), $status === 422 ? 422 : 502);
        }
        return $data;
    }

    /** Shiprocket returns errors in several shapes; flatten them into one sentence. */
    private static function message(mixed $data): string
    {
        if (is_string($data)) {
            return $data;
        }
        if (!is_array($data)) {
            return 'Unknown error.';
        }
        if (!empty($data['errors']) && is_array($data['errors'])) {
            $parts = [];
            array_walk_recursive($data['errors'], static function ($v) use (&$parts) { $parts[] = (string) $v; });
            return implode(' ', $parts);
        }
        return (string) ($data['message'] ?? $data['error'] ?? $data['status'] ?? 'Unknown error.');
    }
}
