<?php
declare(strict_types=1);

namespace Vohra\Core;

use RuntimeException;

/** An error that is safe to show to the client, with an HTTP status and optional per-field messages. */
class HttpException extends RuntimeException
{
    public function __construct(string $message, private int $status = 400, private array $errors = [])
    {
        parent::__construct($message);
    }

    public function status(): int
    {
        return $this->status;
    }

    public function errors(): array
    {
        return $this->errors;
    }

    public static function notFound(string $what = 'Record'): self
    {
        return new self("$what not found.", 404);
    }

    public static function validation(array $errors): self
    {
        return new self('Please check the highlighted fields.', 422, $errors);
    }
}
