<?php
declare(strict_types=1);

namespace Vohra\Repositories;

use Vohra\Core\Config;
use Vohra\Core\Database as DB;

/** Decorative prop images shown around the tin on product pages (onion, chilli, …). */
final class DecorPropRepository
{
    public static function all(): array
    {
        return array_map([self::class, 'cast'], DB::all(
            "SELECT d.*, (SELECT COUNT(*) FROM products p WHERE JSON_CONTAINS(p.props, JSON_QUOTE(d.slug))) AS used_by
             FROM decor_props d ORDER BY d.sort_order, d.label"
        ));
    }

    public static function find(int $id): ?array
    {
        $row = DB::one("SELECT d.*, (SELECT COUNT(*) FROM products p WHERE JSON_CONTAINS(p.props, JSON_QUOTE(d.slug))) AS used_by FROM decor_props d WHERE d.id = ?", [$id]);
        return $row ? self::cast($row) : null;
    }

    public static function slugs(): array
    {
        return array_column(DB::all('SELECT slug FROM decor_props'), 'slug');
    }

    public static function slugTaken(string $slug, int $exceptId = 0): bool
    {
        return (bool) DB::value('SELECT 1 FROM decor_props WHERE slug = ? AND id <> ?', [$slug, $exceptId]);
    }

    public static function create(array $data): int
    {
        return DB::insert('decor_props', $data);
    }

    public static function update(int $id, array $data): void
    {
        DB::update('decor_props', $data, $id);
    }

    /** Delete the prop and unlink it from every product that used it. */
    public static function delete(array $prop): void
    {
        DB::transaction(static function () use ($prop): void {
            foreach (DB::all('SELECT id, props FROM products WHERE JSON_CONTAINS(props, JSON_QUOTE(?))', [$prop['slug']]) as $p) {
                $props = array_values(array_diff(json_decode($p['props'], true) ?: [], [$prop['slug']]));
                DB::update('products', ['props' => json_encode($props)], (int) $p['id']);
            }
            DB::delete('decor_props', $prop['id']);
        });
    }

    /** One-time import of the images that ship with the theme (assets/img/props/*.webp). */
    public static function importBundled(): int
    {
        $n = 0;
        foreach (glob(Config::get('paths.public') . '/assets/img/props/*.webp') ?: [] as $i => $file) {
            $slug = basename($file, '.webp');
            if (str_starts_with($slug, 'makhana-')) {
                continue; // background makhana pieces, not props
            }
            DB::run('INSERT IGNORE INTO decor_props (slug, label, image, sort_order) VALUES (?, ?, ?, ?)',
                [$slug, ucfirst(str_replace('-', ' ', $slug)), "assets/img/props/$slug.webp", ($i + 1) * 10]);
            $n++;
        }
        return $n;
    }

    private static function cast(array $r): array
    {
        $r['id'] = (int) $r['id'];
        $r['sort_order'] = (int) $r['sort_order'];
        $r['used_by'] = (int) $r['used_by'];
        return $r;
    }
}
