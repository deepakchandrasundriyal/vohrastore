<?php
declare(strict_types=1);

namespace Vohra\Core;

final class Request
{
    private ?array $body = null;

    public function __construct(private array $params = [])
    {
    }

    public function method(): string
    {
        return strtoupper($_SERVER['REQUEST_METHOD'] ?? 'GET');
    }

    /** Route parameter, e.g. {id}. */
    public function param(string $key): string
    {
        return $this->params[$key] ?? '';
    }

    public function id(): int
    {
        $id = (int) $this->param('id');
        if ($id <= 0) {
            throw HttpException::notFound();
        }
        return $id;
    }

    public function withParams(array $params): self
    {
        $clone = clone $this;
        $clone->params = $params;
        return $clone;
    }

    public function query(string $key, mixed $default = null): mixed
    {
        $v = $_GET[$key] ?? $default;
        return is_string($v) ? trim($v) : $v;
    }

    /** JSON body (or form body for multipart uploads). */
    public function body(): array
    {
        if ($this->body === null) {
            $type = $_SERVER['CONTENT_TYPE'] ?? '';
            if (str_contains($type, 'application/json')) {
                $decoded = json_decode((string) file_get_contents('php://input'), true);
                if (!is_array($decoded) && $decoded !== null) {
                    throw new HttpException('Invalid JSON body.', 400);
                }
                $this->body = $decoded ?? [];
            } else {
                $this->body = $_POST;
            }
        }
        return $this->body;
    }

    public function input(string $key, mixed $default = null): mixed
    {
        return $this->body()[$key] ?? $default;
    }

    public function file(string $key): ?array
    {
        $f = $_FILES[$key] ?? null;
        return $f && ($f['error'] ?? UPLOAD_ERR_NO_FILE) !== UPLOAD_ERR_NO_FILE ? $f : null;
    }

    public function ip(): string
    {
        return $_SERVER['REMOTE_ADDR'] ?? '0.0.0.0';
    }

    public function header(string $name): string
    {
        $key = 'HTTP_' . strtoupper(str_replace('-', '_', $name));
        return $_SERVER[$key] ?? '';
    }
}
