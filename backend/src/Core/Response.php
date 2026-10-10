<?php
declare(strict_types=1);

namespace Vohra\Core;

use Throwable;

final class Response
{
    public static function json(mixed $data, int $status = 200): void
    {
        http_response_code($status);
        header('Content-Type: application/json; charset=utf-8');
        header('Cache-Control: no-store');
        header('X-Content-Type-Options: nosniff');
        echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_PRESERVE_ZERO_FRACTION);
        exit;
    }

    public static function error(Throwable $e): void
    {
        if ($e instanceof HttpException) {
            self::json(['error' => $e->getMessage(), 'errors' => (object) $e->errors()], $e->status());
        }
        error_log((string) $e);
        $message = Config::get('app.debug') ? $e->getMessage() : 'Something went wrong. Please try again.';
        self::json(['error' => $message], 500);
    }
}
