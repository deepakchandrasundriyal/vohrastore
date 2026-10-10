<?php
/**
 * Demo marketing data: campaign links, clicks, and UTM attribution on demo orders (@example.com customers only).
 * Included by demo-data.php; can also run on its own to backfill an existing demo database:
 *   php database/demo-marketing.php
 */
declare(strict_types=1);

if (!class_exists(\Vohra\Core\Database::class)) {
    if (PHP_SAPI !== 'cli') {
        exit("Run this from the command line.\n");
    }
    require __DIR__ . '/../backend/bootstrap.php';
}

use Vohra\Core\Database as DB;

mt_srand(7);
$adminId = (int) DB::value('SELECT id FROM admins ORDER BY id LIMIT 1') ?: null;

$links = [
    ['Diwali Instagram reel', 'index.html', 'instagram', 'social', 'diwali_2026', 'reel_01'],
    ['Peri Peri launch story', 'product-peri-peri.html', 'instagram', 'social', 'peri_peri_launch', 'story'],
    ['Google Ads - makhana', 'shop.html', 'google', 'cpc', 'healthy_snacks_search', ''],
    ['WhatsApp broadcast', 'shop.html', 'whatsapp', 'social', 'diwali_2026', 'broadcast'],
    ['Fitness influencer', 'product-cheesy-delight.html', 'influencer', 'affiliate', 'protein_snack', 'creator_ananya'],
    ['Newsletter October', 'index.html', 'email', 'email', 'october_newsletter', ''],
    ['Store QR code', 'shop.html', 'qr', 'offline', 'khari_baoli_store', ''],
];
DB::run('DELETE FROM campaign_links');
$codes = [];
foreach ($links as $i => [$name, $dest, $src, $med, $camp, $content]) {
    $code = substr(str_shuffle('abcdefghjkmnpqrstuvwxyz23456789'), 0, 7);
    $id = DB::insert('campaign_links', [
        'code' => $code, 'name' => $name, 'destination' => $dest, 'utm_source' => $src, 'utm_medium' => $med,
        'utm_campaign' => $camp, 'utm_content' => $content, 'created_by' => $adminId,
        'created_at' => date('Y-m-d H:i:s', strtotime('-' . (60 - $i * 6) . ' days')),
    ]);
    $codes[] = ['id' => $id, 'code' => $code, 'src' => $src, 'med' => $med, 'camp' => $camp, 'dest' => $dest, 'content' => $content];
}

// Clicks spread over the last 60 days
$clicks = 0;
foreach ($codes as $i => $l) {
    $n = [420, 260, 380, 300, 180, 140, 90][$i];
    for ($k = 0; $k < $n; $k++) {
        DB::insert('campaign_clicks', ['link_id' => $l['id'], 'clicked_at' => date('Y-m-d H:i:s', strtotime('-' . mt_rand(0, 59) . ' days -' . mt_rand(0, 86399) . ' seconds'))]);
    }
    DB::run('UPDATE campaign_links SET clicks = ?, last_clicked_at = NOW() - INTERVAL ? HOUR WHERE id = ?', [$n, mt_rand(1, 30), $l['id']]);
    $clicks += $n;
}

// Attribute demo orders: ~55% via a tracked link, ~15% organic Google, the rest direct
$orders = DB::all("SELECT id FROM orders WHERE customer_email LIKE '%@example.com'");
$referrers = ['https://www.instagram.com/', 'https://www.google.com/', '', 'https://l.facebook.com/'];
foreach ($orders as $o) {
    $roll = mt_rand(1, 100);
    if ($roll <= 55) {
        $l = $codes[[0, 0, 0, 1, 1, 2, 2, 2, 3, 3, 4, 5, 6][mt_rand(0, 12)]];
        $data = ['utm_source' => $l['src'], 'utm_medium' => $l['med'], 'utm_campaign' => $l['camp'], 'utm_content' => $l['content'] ?: null,
                 'utm_id' => $l['code'], 'landing_page' => $l['dest'], 'referrer' => $l['src'] === 'instagram' ? $referrers[0] : ($l['src'] === 'google' ? $referrers[1] : null)];
    } elseif ($roll <= 70) {
        $data = ['utm_source' => 'google', 'utm_medium' => 'organic', 'utm_campaign' => null, 'utm_content' => null, 'utm_id' => null,
                 'landing_page' => ['index.html', 'shop.html', 'product-pink-salt.html', 'product-peri-peri.html'][mt_rand(0, 3)], 'referrer' => $referrers[1]];
    } else {
        $data = ['utm_source' => null, 'utm_medium' => null, 'utm_campaign' => null, 'utm_content' => null, 'utm_id' => null,
                 'landing_page' => mt_rand(0, 1) ? 'index.html' : 'shop.html', 'referrer' => null];
    }
    DB::update('orders', $data, (int) $o['id']);
}

echo '✓ Demo marketing: ' . count($codes) . " links, $clicks clicks, " . count($orders) . " orders attributed\n";
