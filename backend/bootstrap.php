<?php
declare(strict_types=1);

use Vohra\Core\Config;

spl_autoload_register(static function (string $class): void {
    $prefix = 'Vohra\\';
    if (strncmp($class, $prefix, strlen($prefix)) !== 0) {
        return;
    }
    $file = __DIR__ . '/src/' . str_replace('\\', '/', substr($class, strlen($prefix))) . '.php';
    if (is_file($file)) {
        require $file;
    }
});

Config::load(require __DIR__ . '/config.php');
date_default_timezone_set(Config::get('app.timezone'));
