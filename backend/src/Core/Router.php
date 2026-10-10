<?php
declare(strict_types=1);

namespace Vohra\Core;

use Throwable;

/**
 * Minimal router. Routes look like 'products/{id}'; the path comes from PATH_INFO
 * (api/admin.php/products/3) or, as a fallback, ?r=products/3.
 */
final class Router
{
    private array $routes = [];
    /** @var callable[] */
    private array $middleware = [];

    public function get(string $path, callable $handler): self    { return $this->add('GET', $path, $handler); }
    public function post(string $path, callable $handler): self   { return $this->add('POST', $path, $handler); }
    public function put(string $path, callable $handler): self    { return $this->add('PUT', $path, $handler); }
    public function delete(string $path, callable $handler): self { return $this->add('DELETE', $path, $handler); }

    /** Runs before every matched handler; receives (Request, string $path). */
    public function before(callable $fn): self
    {
        $this->middleware[] = $fn;
        return $this;
    }

    public function dispatch(): void
    {
        try {
            $request = new Request();
            $method = $request->method();
            $path = trim((string) ($_SERVER['PATH_INFO'] ?? $request->query('r', '')), '/');

            foreach ($this->routes as [$m, $pattern, $handler, $raw]) {
                if (!preg_match($pattern, $path, $match)) {
                    continue;
                }
                if ($m !== $method) {
                    $allowed = true;
                    continue;
                }
                $request = $request->withParams(array_filter($match, 'is_string', ARRAY_FILTER_USE_KEY));
                foreach ($this->middleware as $mw) {
                    $mw($request, $raw);
                }
                Response::json($handler($request) ?? ['ok' => true]);
            }
            throw new HttpException(isset($allowed) ? 'Method not allowed.' : 'Endpoint not found.', isset($allowed) ? 405 : 404);
        } catch (Throwable $e) {
            Response::error($e);
        }
    }

    private function add(string $method, string $path, callable $handler): self
    {
        $pattern = '#^' . preg_replace('#\{(\w+)\}#', '(?P<$1>[^/]+)', trim($path, '/')) . '$#';
        $this->routes[] = [$method, $pattern, $handler, $path];
        return $this;
    }
}
