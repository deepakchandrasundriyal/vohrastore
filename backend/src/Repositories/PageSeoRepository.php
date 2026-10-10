<?php
declare(strict_types=1);

namespace Vohra\Repositories;

use Vohra\Core\Database as DB;

final class PageSeoRepository
{
    public static function all(): array
    {
        return array_map([self::class, 'cast'], DB::all('SELECT * FROM page_seo ORDER BY noindex, path'));
    }

    public static function find(int $id): ?array
    {
        $row = DB::one('SELECT * FROM page_seo WHERE id = ?', [$id]);
        return $row ? self::cast($row) : null;
    }

    public static function pathTaken(string $path, int $exceptId = 0): bool
    {
        return (bool) DB::value('SELECT 1 FROM page_seo WHERE path = ? AND id <> ?', [$path, $exceptId]);
    }

    public static function create(array $data): int
    {
        return DB::insert('page_seo', $data);
    }

    public static function update(int $id, array $data): void
    {
        DB::update('page_seo', $data, $id);
    }

    public static function delete(int $id): bool
    {
        return DB::delete('page_seo', $id);
    }

    /** SEO fields of every product, for the SEO overview. */
    public static function products(): array
    {
        return array_map(static fn (array $r): array => ['id' => (int) $r['id'], 'is_active' => (bool) $r['is_active']] + $r, DB::all(
            'SELECT id, name, slug, image, is_active, seo_title, seo_description, seo_keywords, og_image FROM products ORDER BY sort_order, name'
        ));
    }

    private static function cast(array $r): array
    {
        $r['id'] = (int) $r['id'];
        $r['noindex'] = (bool) $r['noindex'];
        return $r;
    }
}
