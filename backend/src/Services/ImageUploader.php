<?php
declare(strict_types=1);

namespace Vohra\Services;

use finfo;
use Vohra\Core\Config;
use Vohra\Core\HttpException;

/** Stores admin-uploaded images under dist/uploads/<folder> and returns a site-relative path. */
final class ImageUploader
{
    public const FOLDERS = ['products', 'props', 'seo'];
    private const MAX_BYTES = 3 * 1024 * 1024;
    private const TYPES = ['image/webp' => 'webp', 'image/png' => 'png', 'image/jpeg' => 'jpg'];

    public static function store(array $file, string $basename, string $folder = 'products'): string
    {
        if (!in_array($folder, self::FOLDERS, true)) {
            throw new \InvalidArgumentException("Unknown upload folder '$folder'.");
        }
        if (($file['error'] ?? UPLOAD_ERR_NO_FILE) !== UPLOAD_ERR_OK || !is_uploaded_file($file['tmp_name'])) {
            throw HttpException::validation(['image' => 'The upload failed. Please try again.']);
        }
        if ($file['size'] > self::MAX_BYTES) {
            throw HttpException::validation(['image' => 'Images must be 3 MB or smaller.']);
        }
        $mime = (new finfo(FILEINFO_MIME_TYPE))->file($file['tmp_name']);
        $ext = self::TYPES[$mime] ?? null;
        if (!$ext || @getimagesize($file['tmp_name']) === false) {
            throw HttpException::validation(['image' => 'Upload a WebP, PNG or JPG image.']);
        }

        $dir = Config::get('paths.uploads') . '/' . $folder;
        if (!is_dir($dir) && !mkdir($dir, 0775, true) && !is_dir($dir)) {
            throw new \RuntimeException('Could not create the uploads folder.');
        }
        $basename = preg_replace('/[^a-z0-9-]/', '', strtolower($basename)) ?: 'image';
        $name = $basename . '-' . bin2hex(random_bytes(4)) . '.' . $ext;
        if (!move_uploaded_file($file['tmp_name'], "$dir/$name")) {
            throw new \RuntimeException('Could not save the uploaded image.');
        }
        return "uploads/$folder/$name";
    }

    /** True for a path this app may reference: bundled theme assets or our uploads. */
    public static function isValidPath(?string $path): bool
    {
        return $path !== null
            && !str_contains($path, '..')
            && (bool) preg_match('#^(assets/img|uploads/(' . implode('|', self::FOLDERS) . '))/[\w./-]+\.(webp|png|jpe?g)$#', $path);
    }

    /** Delete a previously uploaded file. Bundled theme images (assets/...) are never touched. */
    public static function remove(?string $path): void
    {
        if (!$path || !str_starts_with($path, 'uploads/') || !self::isValidPath($path)) {
            return;
        }
        $full = Config::get('paths.public') . '/' . $path;
        if (is_file($full)) {
            @unlink($full);
        }
    }
}
