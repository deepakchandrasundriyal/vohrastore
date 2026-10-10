<?php
/**
 * Applies pending SQL migrations from database/migrations in filename order.
 * Safe to run any number of times: applied files are recorded in `schema_migrations`.
 *
 *   php database/migrate.php
 */
declare(strict_types=1);

if (PHP_SAPI !== 'cli') {
    exit("Run this from the command line.\n");
}

require __DIR__ . '/../backend/bootstrap.php';

use Vohra\Core\Database as DB;
use Vohra\Repositories\DecorPropRepository;
use Vohra\Support\PageSeoSeeder;

DB::pdo()->exec('CREATE TABLE IF NOT EXISTS schema_migrations (
    name VARCHAR(190) PRIMARY KEY,
    applied_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4');

$applied = array_column(DB::all('SELECT name FROM schema_migrations'), 'name');
$files = glob(__DIR__ . '/migrations/*.sql') ?: [];
sort($files);

$ran = 0;
foreach ($files as $file) {
    $name = basename($file);
    if (in_array($name, $applied, true)) {
        continue;
    }
    // MySQL DDL auto-commits, so each statement runs on its own; a failure stops before recording the file.
    $sql = (string) preg_replace('/^\s*--.*$/m', '', (string) file_get_contents($file));
    foreach (array_filter(array_map('trim', explode(';', $sql))) as $statement) {
        DB::pdo()->exec($statement);
    }
    DB::insert('schema_migrations', ['name' => $name]);
    echo "✓ Applied $name\n";
    $ran++;

    if ($name === '002_seo_marketing.sql') {
        echo '✓ Seeded SEO for ' . PageSeoSeeder::run() . " storefront pages\n";
    }
    if ($name === '003_decor_props.sql') {
        echo '✓ Imported ' . DecorPropRepository::importBundled() . " bundled decorative props\n";
    }
}

echo $ran ? "Done.\n" : "Nothing to migrate — database is up to date.\n";
