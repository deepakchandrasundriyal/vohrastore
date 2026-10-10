<?php
/**
 * Refresh tracking for active Shiprocket shipments. Use it when the webhook is not set up,
 * e.g. every 2 hours via Windows Task Scheduler / cron:
 *   php backend/bin/sync-tracking.php
 */
declare(strict_types=1);

if (PHP_SAPI !== 'cli') {
    exit("Run this from the command line.\n");
}

require __DIR__ . '/../bootstrap.php';

use Vohra\Services\Shipping\ShippingService;
use Vohra\Services\Shipping\ShiprocketClient;

if (!ShiprocketClient::isConfigured()) {
    exit("Shiprocket is not connected (Admin → Settings → Shipping).\n");
}
$r = ShippingService::syncActive(100);
echo date('Y-m-d H:i') . " · synced {$r['synced']} shipment(s), {$r['failed']} failed\n";
