<?php
/**
 * Creates the database, runs schema.sql and seeds it.
 *
 *   php database/install.php                       # schema + catalogue + settings + first admin
 *   php database/install.php --demo                # ...plus ~4 months of demo customers/orders/enquiries for the dashboard
 *   php database/install.php --admin-email=you@x.com --admin-password=secret123
 *
 * WARNING: drops and recreates every store table.
 */
declare(strict_types=1);

if (PHP_SAPI !== 'cli') {
    exit("Run this from the command line.\n");
}

require __DIR__ . '/../backend/bootstrap.php';

use Vohra\Core\Config;
use Vohra\Core\Database as DB;
use Vohra\Repositories\AdminRepository;
use Vohra\Repositories\SettingRepository;

$opts = getopt('', ['demo', 'admin-email::', 'admin-password::', 'admin-name::']);
$adminEmail = $opts['admin-email'] ?? 'admin@vohrastore.com';
$adminPassword = $opts['admin-password'] ?? 'Admin@12345';
$adminName = $opts['admin-name'] ?? 'Store Admin';

// 1. Database
$c = Config::get('db');
$server = new PDO("mysql:host={$c['host']};port={$c['port']};charset={$c['charset']}", $c['user'], $c['pass'], [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]);
$server->exec("CREATE DATABASE IF NOT EXISTS `{$c['name']}` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci");
echo "✓ Database `{$c['name']}` ready\n";

// 2. Schema
DB::pdo()->exec((string) file_get_contents(__DIR__ . '/schema.sql'));
echo "✓ Tables created\n";

// 3. Catalogue from the storefront's product data
$products = json_decode((string) file_get_contents(Config::get('paths.src') . '/data/products.json'), true, 512, JSON_THROW_ON_ERROR);
$stock = [120, 86, 64, 8, 140, 52, 0]; // varied so the dashboard shows low/out-of-stock states
foreach ($products as $i => $p) {
    DB::insert('products', [
        'slug' => $p['slug'], 'name' => $p['name'], 'tagline' => $p['tagline'], 'description' => $p['description'],
        'profile' => $p['profile'], 'price' => $p['price'], 'mrp' => $p['mrp'], 'weight' => $p['weight'],
        'stock' => $stock[$i] ?? 50, 'low_stock_at' => 10, 'color' => $p['color'], 'tint' => $p['tint'],
        'image' => "assets/img/products/{$p['slug']}.webp", 'image_bowl' => "assets/img/bowls/{$p['slug']}.webp", 'image_label' => "assets/img/labels/{$p['slug']}.webp",
        'props' => json_encode($p['props']), 'ingredients' => $p['ingredients'],
        'allergens' => json_encode($p['allergens']), 'nutrition' => json_encode($p['nutrition'], JSON_PRESERVE_ZERO_FRACTION),
        'is_active' => 1, 'sort_order' => ($i + 1) * 10,
    ]);
}
echo '✓ ' . count($products) . " products imported\n";

// 4. Coupons + settings
DB::insert('coupons', ['code' => 'VOHRA10', 'type' => 'percent', 'value' => 10, 'label' => '10% off your order', 'min_order' => 0, 'is_active' => 1]);
SettingRepository::save(SettingRepository::DEFAULTS);
echo "✓ Coupon VOHRA10 and default settings saved\n";

// 5. First admin
AdminRepository::create(['name' => $adminName, 'email' => strtolower($adminEmail), 'role' => 'admin', 'is_active' => 1], $adminPassword);
echo "✓ Admin created: $adminEmail / $adminPassword  (change this password after signing in)\n";

// 6. Migrations (SEO, marketing attribution, campaign links)
require __DIR__ . '/migrate.php';

if (isset($opts['demo'])) {
    require __DIR__ . '/demo-data.php';
}

echo "\nDone. Open /vohrastore/dist/admin/ to sign in.\n";
