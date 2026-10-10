<?php
declare(strict_types=1);

namespace Vohra\Support;

use Vohra\Core\Config;
use Vohra\Core\Database as DB;

/**
 * Pre-fills SEO data from what the storefront already ships with, so nothing starts empty:
 *  - one page_seo row per storefront page (title + meta description read from the built HTML)
 *  - product SEO title/description, using the same pattern as the product pages
 */
final class PageSeoSeeder
{
    /** Pages Google should not index (private or transactional). */
    private const NOINDEX = ['cart.html', 'checkout.html', 'account.html', 'order-success.html', 'login.html', 'track-order.html', '404.html'];

    public static function run(): int
    {
        $count = 0;
        foreach (glob(Config::get('paths.public') . '/*.html') ?: [] as $file) {
            $path = basename($file);
            if (str_starts_with($path, 'product-')) {
                continue; // product pages are managed on the product itself
            }
            $html = (string) file_get_contents($file);
            $title = self::match('#<title>(.*?)</title>#s', $html) ?: $path;
            $desc = self::match('#<meta name="description" content="(.*?)"#s', $html);
            DB::run(
                'INSERT IGNORE INTO page_seo (path, label, seo_title, seo_description, noindex) VALUES (?, ?, ?, ?, ?)',
                [$path, trim(explode('|', $title)[0]), mb_substr($title, 0, 70), mb_substr($desc, 0, 170), in_array($path, self::NOINDEX, true) ? 1 : 0]
            );
            $count++;
        }

        foreach (DB::all('SELECT id, name, weight, tagline, description FROM products WHERE seo_title IS NULL') as $p) {
            DB::update('products', [
                'seo_title'       => mb_substr("{$p['name']} Roasted Makhana {$p['weight']} | Vohra's", 0, 70),
                'seo_description' => self::cut("{$p['tagline']}. {$p['description']}", 158),
                'seo_keywords'    => strtolower("{$p['name']} makhana, roasted makhana, {$p['name']} fox nuts, healthy snacks"),
            ], (int) $p['id']);
        }
        return $count;
    }

    /** Shorten at a word boundary and end with an ellipsis, so Google never shows a half word. */
    public static function cut(string $text, int $max): string
    {
        $text = trim(preg_replace('/\s+/', ' ', $text));
        if (mb_strlen($text) <= $max) {
            return $text;
        }
        $short = mb_substr($text, 0, $max - 1);
        $short = mb_substr($short, 0, (int) mb_strrpos($short, ' '));
        return rtrim($short, " ,.;:-") . '…';
    }

    private static function match(string $re, string $html): string
    {
        return preg_match($re, $html, $m) ? html_entity_decode(trim($m[1]), ENT_QUOTES | ENT_HTML5, 'UTF-8') : '';
    }
}
