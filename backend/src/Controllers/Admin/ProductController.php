<?php
declare(strict_types=1);

namespace Vohra\Controllers\Admin;

use Vohra\Core\HttpException;
use Vohra\Core\Request;
use Vohra\Core\Validator;
use Vohra\Repositories\DecorPropRepository;
use Vohra\Repositories\ProductRepository;
use Vohra\Services\ImageUploader;

final class ProductController
{
    private const IMAGE_FIELDS = ['image', 'image_bowl', 'image_label', 'og_image'];

    public static function index(Request $r): array
    {
        return ['data' => ProductRepository::list([
            'q' => $r->query('q'), 'status' => $r->query('status'), 'profile' => $r->query('profile'), 'sort' => $r->query('sort'),
        ])];
    }

    /** Lookups the product form needs: profiles, nutrient rows, decorative props. */
    public static function meta(): array
    {
        return [
            'profiles'  => ProductRepository::PROFILES,
            'nutrients' => ProductRepository::NUTRIENTS,
            'props'     => DecorPropRepository::all(),
            'allergens' => ['Peanut', 'Milk', 'Soya', 'Tree nuts', 'Gluten', 'Sesame', 'Mustard'],
        ];
    }

    public static function options(): array
    {
        return ['data' => ProductRepository::options()];
    }

    public static function show(Request $r): array
    {
        return ProductRepository::find($r->id()) ?? throw HttpException::notFound('Product');
    }

    public static function store(Request $r): array
    {
        $data = self::validate($r->body());
        $id = ProductRepository::create($data);
        return ProductRepository::find($id);
    }

    public static function update(Request $r): array
    {
        $id = $r->id();
        $current = ProductRepository::find($id) ?? throw HttpException::notFound('Product');
        $data = self::validate($r->body(), $id);
        ProductRepository::update($id, $data);
        foreach (self::IMAGE_FIELDS as $f) {
            if (($current[$f] ?? null) !== ($data[$f] ?? null)) {
                ImageUploader::remove($current[$f] ?? null);
            }
        }
        return ProductRepository::find($id);
    }

    /** PATCH-style quick edits from the list: stock and active flag. */
    public static function quickUpdate(Request $r): array
    {
        $id = $r->id();
        ProductRepository::find($id) ?? throw HttpException::notFound('Product');
        $rules = array_intersect_key(['stock' => 'required|int|min:0|max:1000000', 'is_active' => 'bool'], $r->body());
        if (!$rules) {
            throw HttpException::validation(['stock' => 'Nothing to update.']);
        }
        ProductRepository::update($id, Validator::make($r->body(), $rules));
        return ProductRepository::find($id);
    }

    public static function destroy(Request $r): array
    {
        $product = ProductRepository::find($r->id()) ?? throw HttpException::notFound('Product');
        ProductRepository::delete($product['id']);
        foreach (self::IMAGE_FIELDS as $f) {
            ImageUploader::remove($product[$f] ?? null);
        }
        return ['ok' => true];
    }

    /** POST products/upload (multipart: file, slug) → { path }. The path is saved with the product form. */
    public static function upload(Request $r): array
    {
        $file = $r->file('file') ?? throw HttpException::validation(['image' => 'Choose an image to upload.']);
        $slug = preg_replace('/[^a-z0-9-]/', '', strtolower((string) $r->input('slug', 'product'))) ?: 'product';
        return ['path' => ImageUploader::store($file, $slug)];
    }

    private static function validate(array $in, int $id = 0): array
    {
        $data = Validator::make($in, [
            'name'         => 'required|string|max:120',
            'slug'         => 'required|slug|max:80',
            'tagline'      => 'required|string|max:190',
            'description'  => 'required|string|max:5000',
            'profile'      => 'required|in:' . implode(',', array_keys(ProductRepository::PROFILES)),
            'price'        => 'required|numeric|min:1|max:100000',
            'mrp'          => 'required|numeric|min:1|max:100000',
            'weight'       => 'required|string|max:30',
            'stock'        => 'required|int|min:0|max:1000000',
            'low_stock_at' => 'required|int|min:0|max:100000',
            'color'        => 'required|color',
            'tint'         => 'required|color',
            'image'        => 'required|string|max:255',
            'image_bowl'   => 'nullable|string|max:255',
            'image_label'  => 'nullable|string|max:255',
            'props'        => 'array|max:2',
            'ingredients'  => 'required|string|max:5000',
            'allergens'    => 'array|max:12',
            'nutrition'    => 'required|array',
            'is_active'    => 'bool',
            'sort_order'   => 'required|int|min:0|max:10000',
            'seo_title'       => 'nullable|string|max:70',
            'seo_description' => 'nullable|string|max:170',
            'seo_keywords'    => 'nullable|string|max:255',
            'og_image'        => 'nullable|string|max:255',
            'image_alt'       => 'nullable|string|max:160',
        ], ['image_alt' => 'Image alt text', 'mrp' => 'MRP', 'low_stock_at' => 'Low-stock alert', 'image' => 'Product image', 'sort_order' => 'Display order',
            'seo_title' => 'SEO title', 'seo_description' => 'Meta description', 'seo_keywords' => 'Keywords', 'og_image' => 'Share image']);

        $errors = [];
        if (ProductRepository::slugTaken($data['slug'], $id)) {
            $errors['slug'] = 'Another product already uses this URL slug.';
        }
        if ($data['price'] > $data['mrp']) {
            $errors['price'] = 'Selling price cannot be higher than MRP.';
        }
        foreach (self::IMAGE_FIELDS as $f) {
            if ($data[$f] !== null && !ImageUploader::isValidPath($data[$f])) {
                $errors[$f] = 'Upload the image again.';
            }
        }
        if (array_diff($data['props'], DecorPropRepository::slugs())) {
            $errors['props'] = 'One of the chosen props no longer exists. Pick again.';
        }
        if ($errors) {
            throw HttpException::validation($errors);
        }

        $data['props'] = array_values(array_map('strval', array_slice($data['props'], 0, 2)));
        $data['allergens'] = array_values(array_unique(array_filter(array_map(static fn ($a) => trim((string) $a), $data['allergens']))));
        $data['nutrition'] = self::nutrition($data['nutrition']);
        return $data;
    }

    /** Keep only known nutrients as [per100g(float), perServe(float), rda(string)]. */
    private static function nutrition(array $in): array
    {
        $out = [];
        foreach (array_keys(ProductRepository::NUTRIENTS) as $key) {
            $row = array_values((array) ($in[$key] ?? []));
            $out[$key] = [
                round((float) ($row[0] ?? 0), 2),
                round((float) ($row[1] ?? 0), 2),
                mb_substr(trim((string) ($row[2] ?? '-')), 0, 12) ?: '-',
            ];
        }
        return $out;
    }
}
