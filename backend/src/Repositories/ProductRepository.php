<?php
declare(strict_types=1);

namespace Vohra\Repositories;

use Vohra\Core\Database as DB;

final class ProductRepository
{
    public const PROFILES = ['classic' => 'Classic & Light', 'spicy' => 'Spicy & Tangy', 'creamy' => 'Creamy & Cheesy', 'herby' => 'Fresh & Herby'];
    public const NUTRIENTS = [
        'energy' => ['Energy', 'kcal'], 'protein' => ['Protein', 'g'], 'carbs' => ['Carbohydrates', 'g'],
        'sugar' => ['Total sugar', 'g'], 'addedSugar' => ['Added sugar', 'g'], 'fat' => ['Total fat', 'g'],
        'satFat' => ['Saturated fat', 'g'], 'transFat' => ['Trans fat', 'g'], 'cholesterol' => ['Cholesterol', 'mg'],
        'sodium' => ['Sodium', 'mg'], 'fibre' => ['Dietary fibre', 'g'],
    ];
    private const JSON_COLUMNS = ['props', 'allergens', 'nutrition'];

    /** Units sold excludes cancelled orders. */
    private const SOLD = "(SELECT COALESCE(SUM(oi.qty), 0) FROM order_items oi JOIN orders o ON o.id = oi.order_id
                           WHERE oi.product_id = p.id AND o.status <> 'cancelled')";

    public static function list(array $f): array
    {
        $where = ['1 = 1'];
        $params = [];
        if (!empty($f['q'])) {
            $where[] = '(p.name LIKE :q OR p.slug LIKE :q OR p.tagline LIKE :q)';
            $params['q'] = '%' . $f['q'] . '%';
        }
        match ($f['status'] ?? '') {
            'active'   => $where[] = 'p.is_active = 1',
            'inactive' => $where[] = 'p.is_active = 0',
            'low'      => $where[] = 'p.stock > 0 AND p.stock <= p.low_stock_at',
            'out'      => $where[] = 'p.stock <= 0',
            default    => null,
        };
        if (!empty($f['profile']) && isset(self::PROFILES[$f['profile']])) {
            $where[] = 'p.profile = :profile';
            $params['profile'] = $f['profile'];
        }
        $order = DB::sort($f['sort'] ?? null, [
            'name' => 'p.name', 'price' => 'p.price', 'stock' => 'p.stock', 'sold' => 'sold', 'created_at' => 'p.created_at', 'sort_order' => 'p.sort_order',
        ], 'p.sort_order ASC, p.id ASC');

        $rows = DB::all(
            'SELECT p.id, p.slug, p.name, p.tagline, p.profile, p.price, p.mrp, p.weight, p.stock, p.low_stock_at, p.color, p.tint,
                    p.image, p.is_active, p.sort_order, p.updated_at, p.seo_title, p.seo_description, ' . self::SOLD . ' AS sold
             FROM products p WHERE ' . implode(' AND ', $where) . " ORDER BY $order",
            $params
        );
        return array_map([self::class, 'cast'], $rows);
    }

    public static function options(): array
    {
        return array_map([self::class, 'cast'], DB::all('SELECT id, slug, name, price, stock, image, is_active FROM products ORDER BY sort_order, name'));
    }

    public static function find(int $id): ?array
    {
        $row = DB::one('SELECT p.*, ' . self::SOLD . ' AS sold FROM products p WHERE p.id = ?', [$id]);
        return $row ? self::cast($row) : null;
    }

    public static function slugTaken(string $slug, int $exceptId = 0): bool
    {
        return (bool) DB::value('SELECT 1 FROM products WHERE slug = ? AND id <> ?', [$slug, $exceptId]);
    }

    public static function create(array $data): int
    {
        return DB::insert('products', self::encode($data));
    }

    public static function update(int $id, array $data): void
    {
        DB::update('products', self::encode($data), $id);
    }

    public static function delete(int $id): bool
    {
        return DB::delete('products', $id);
    }

    /** Lock rows for a stock check inside a transaction. */
    public static function lockMany(array $ids): array
    {
        if (!$ids) {
            return [];
        }
        $in = implode(',', array_fill(0, count($ids), '?'));
        $rows = DB::all("SELECT id, slug, name, price, stock, is_active FROM products WHERE id IN ($in) FOR UPDATE", array_values($ids));
        return array_column(array_map([self::class, 'cast'], $rows), null, 'id');
    }

    public static function adjustStock(int $id, int $delta): void
    {
        DB::run('UPDATE products SET stock = stock + ? WHERE id = ?', [$delta, $id]);
    }

    private static function encode(array $data): array
    {
        foreach (self::JSON_COLUMNS as $col) {
            if (array_key_exists($col, $data)) {
                $data[$col] = json_encode($data[$col], JSON_UNESCAPED_UNICODE | JSON_PRESERVE_ZERO_FRACTION);
            }
        }
        return $data;
    }

    private static function cast(array $r): array
    {
        foreach (['id', 'stock', 'low_stock_at', 'sort_order', 'sold'] as $k) {
            if (isset($r[$k])) {
                $r[$k] = (int) $r[$k];
            }
        }
        foreach (['price', 'mrp'] as $k) {
            if (isset($r[$k])) {
                $r[$k] = (float) $r[$k];
            }
        }
        if (isset($r['is_active'])) {
            $r['is_active'] = (bool) $r['is_active'];
        }
        foreach (self::JSON_COLUMNS as $col) {
            if (isset($r[$col]) && is_string($r[$col])) {
                $r[$col] = json_decode($r[$col], true) ?? [];
            }
        }
        return $r;
    }
}
