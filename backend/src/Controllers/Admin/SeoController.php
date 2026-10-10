<?php
declare(strict_types=1);

namespace Vohra\Controllers\Admin;

use Vohra\Core\HttpException;
use Vohra\Core\Request;
use Vohra\Core\Validator;
use Vohra\Repositories\PageSeoRepository;
use Vohra\Services\ImageUploader;

/** SEO for storefront pages (product SEO is edited on the product itself). */
final class SeoController
{
    public static function index(): array
    {
        return ['pages' => PageSeoRepository::all(), 'products' => PageSeoRepository::products()];
    }

    public static function store(Request $r): array
    {
        $data = self::validate($r->body());
        return PageSeoRepository::find(PageSeoRepository::create($data));
    }

    public static function update(Request $r): array
    {
        $id = $r->id();
        PageSeoRepository::find($id) ?? throw HttpException::notFound('Page');
        PageSeoRepository::update($id, self::validate($r->body(), $id));
        return PageSeoRepository::find($id);
    }

    public static function destroy(Request $r): array
    {
        if (!PageSeoRepository::delete($r->id())) {
            throw HttpException::notFound('Page');
        }
        return ['ok' => true];
    }

    /** POST seo/upload — social share image (multipart: file). */
    public static function upload(Request $r): array
    {
        $file = $r->file('file') ?? throw HttpException::validation(['og_image' => 'Choose an image to upload.']);
        return ['path' => ImageUploader::store($file, 'share', 'seo')];
    }

    private static function validate(array $in, int $id = 0): array
    {
        $data = Validator::make($in, [
            'path'            => 'required|string|max:190',
            'label'           => 'required|string|max:120',
            'seo_title'       => 'required|string|max:70',
            'seo_description' => 'string|max:170',
            'seo_keywords'    => 'string|max:255',
            'og_image'        => 'nullable|string|max:255',
            'canonical_url'   => 'nullable|string|max:255',
            'noindex'         => 'bool',
        ], ['seo_title' => 'SEO title', 'seo_description' => 'Meta description', 'seo_keywords' => 'Keywords', 'og_image' => 'Share image', 'canonical_url' => 'Canonical URL']);

        $errors = [];
        if (!preg_match('#^[a-z0-9][a-z0-9._/-]*\.html$#i', $data['path']) || str_contains($data['path'], '..')) {
            $errors['path'] = 'Use a storefront file name like about.html.';
        } elseif (PageSeoRepository::pathTaken($data['path'], $id)) {
            $errors['path'] = 'This page already has SEO settings.';
        }
        if ($data['og_image'] !== null && !ImageUploader::isValidPath($data['og_image'])) {
            $errors['og_image'] = 'Upload the image again.';
        }
        if ($data['canonical_url'] !== null && !filter_var($data['canonical_url'], FILTER_VALIDATE_URL)) {
            $errors['canonical_url'] = 'Enter a full URL starting with https://';
        }
        if ($errors) {
            throw HttpException::validation($errors);
        }
        return $data;
    }
}
