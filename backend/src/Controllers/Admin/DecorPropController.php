<?php
declare(strict_types=1);

namespace Vohra\Controllers\Admin;

use Vohra\Core\HttpException;
use Vohra\Core\Request;
use Vohra\Core\Validator;
use Vohra\Repositories\DecorPropRepository;
use Vohra\Services\ImageUploader;

/** Library of decorative prop images used around the tin on product pages. */
final class DecorPropController
{
    public static function index(): array
    {
        return ['data' => DecorPropRepository::all()];
    }

    /** POST props (multipart: label, file) */
    public static function store(Request $r): array
    {
        $data = Validator::make($r->body(), ['label' => 'required|string|max:80', 'sort_order' => 'nullable|int|min:0|max:10000']);
        $file = $r->file('file') ?? throw HttpException::validation(['file' => 'Choose an image.']);
        $slug = self::uniqueSlug($data['label']);
        $id = DecorPropRepository::create([
            'slug' => $slug, 'label' => $data['label'], 'image' => ImageUploader::store($file, $slug, 'props'),
            'sort_order' => $data['sort_order'] ?? 1000,
        ]);
        return DecorPropRepository::find($id);
    }

    /** POST props/{id} (multipart: label, sort_order, optional file). The slug stays fixed so products keep their link. */
    public static function update(Request $r): array
    {
        $prop = DecorPropRepository::find($r->id()) ?? throw HttpException::notFound('Prop');
        $data = Validator::make($r->body(), ['label' => 'required|string|max:80', 'sort_order' => 'required|int|min:0|max:10000']);
        if ($file = $r->file('file')) {
            $data['image'] = ImageUploader::store($file, $prop['slug'], 'props');
            ImageUploader::remove($prop['image']);
        }
        DecorPropRepository::update($prop['id'], $data);
        return DecorPropRepository::find($prop['id']);
    }

    public static function destroy(Request $r): array
    {
        $prop = DecorPropRepository::find($r->id()) ?? throw HttpException::notFound('Prop');
        DecorPropRepository::delete($prop);
        ImageUploader::remove($prop['image']);
        return ['ok' => true, 'unlinked_products' => $prop['used_by']];
    }

    private static function uniqueSlug(string $label): string
    {
        $base = trim(preg_replace('/[^a-z0-9]+/', '-', strtolower($label)), '-') ?: 'prop';
        $slug = mb_substr($base, 0, 50);
        for ($i = 2; DecorPropRepository::slugTaken($slug); $i++) {
            $slug = mb_substr($base, 0, 50) . "-$i";
        }
        return $slug;
    }
}
