<?php
declare(strict_types=1);

namespace Vohra\Support;

use RuntimeException;

/**
 * Encrypts secrets (API passwords, tokens) before they are stored in the database.
 * AES-256-GCM with a key from VOHRA_APP_KEY, or backend/storage/app.key (created on first use, never web-accessible).
 */
final class Secret
{
    private const CIPHER = 'aes-256-gcm';

    public static function encrypt(string $plain): string
    {
        $iv = random_bytes(12);
        $cipher = openssl_encrypt($plain, self::CIPHER, self::key(), OPENSSL_RAW_DATA, $iv, $tag);
        if ($cipher === false) {
            throw new RuntimeException('Encryption failed.');
        }
        return 'v1:' . base64_encode($iv . $tag . $cipher);
    }

    public static function decrypt(?string $stored): ?string
    {
        if (!$stored || !str_starts_with($stored, 'v1:')) {
            return null;
        }
        $raw = base64_decode(substr($stored, 3), true);
        if ($raw === false || strlen($raw) < 29) {
            return null;
        }
        $plain = openssl_decrypt(substr($raw, 28), self::CIPHER, self::key(), OPENSSL_RAW_DATA, substr($raw, 0, 12), substr($raw, 12, 16));
        return $plain === false ? null : $plain;
    }

    private static function key(): string
    {
        static $key = null;
        if ($key !== null) {
            return $key;
        }
        $env = getenv('VOHRA_APP_KEY');
        if ($env) {
            return $key = hash('sha256', $env, true);
        }
        $file = dirname(__DIR__, 2) . '/storage/app.key';
        if (!is_file($file)) {
            if (!is_dir(dirname($file))) {
                mkdir(dirname($file), 0770, true);
            }
            file_put_contents($file, bin2hex(random_bytes(32)), LOCK_EX);
            @chmod($file, 0600);
        }
        return $key = hash('sha256', trim((string) file_get_contents($file)), true);
    }
}
