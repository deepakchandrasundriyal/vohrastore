<?php
/**
 * Shiprocket tracking webhook.
 * In Shiprocket: Settings → API → Webhooks → URL = this file, Token = the token shown in Admin → Settings → Shipping.
 * (Shiprocket rejects URLs that contain the word "shiprocket", hence the neutral name.)
 *
 * Always answers 200 for valid calls so Shiprocket does not disable the webhook; unknown AWBs are simply ignored.
 */
declare(strict_types=1);

require __DIR__ . '/../../backend/bootstrap.php';

use Vohra\Repositories\SettingRepository;
use Vohra\Services\Shipping\ShippingService;

header('Content-Type: application/json');

if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
    echo json_encode(['ok' => true, 'message' => 'Courier webhook is reachable.']);
    exit;
}

$expected = (string) SettingRepository::get('shiprocket_webhook_token');
$given = (string) ($_SERVER['HTTP_X_API_KEY'] ?? '');
if ($expected === '' || !hash_equals($expected, $given)) {
    http_response_code(401);
    echo json_encode(['ok' => false, 'error' => 'Invalid token.']);
    exit;
}

$payload = json_decode((string) file_get_contents('php://input'), true);
if (!is_array($payload)) {
    http_response_code(400);
    echo json_encode(['ok' => false, 'error' => 'Invalid JSON.']);
    exit;
}

try {
    $matched = ShippingService::applyWebhook($payload);
    echo json_encode(['ok' => true, 'matched' => $matched]);
} catch (Throwable $e) {
    error_log('Courier webhook: ' . $e);
    echo json_encode(['ok' => true, 'matched' => false]); // never make Shiprocket retry-storm us
}
