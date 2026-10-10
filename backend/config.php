<?php
/**
 * Application configuration.
 * Values can be overridden with environment variables (e.g. in the Apache vhost or hosting panel),
 * so production credentials never need to live in this file.
 */
return [
    'db' => [
        'host'    => getenv('VOHRA_DB_HOST') ?: '127.0.0.1',
        'port'    => (int) (getenv('VOHRA_DB_PORT') ?: 3306),
        'name'    => getenv('VOHRA_DB_NAME') ?: 'vohrastore',
        'user'    => getenv('VOHRA_DB_USER') ?: 'root',
        'pass'    => getenv('VOHRA_DB_PASS') ?: '',
        'charset' => 'utf8mb4',
    ],
    'app' => [
        'debug'        => (getenv('VOHRA_DEBUG') ?: '1') === '1',
        'timezone'     => 'Asia/Kolkata',
        'session_name' => 'vohra_sid',
    ],
    'paths' => [
        'root'    => dirname(__DIR__),
        'src'     => dirname(__DIR__) . '/src',
        'public'  => dirname(__DIR__) . '/dist',
        'uploads' => dirname(__DIR__) . '/dist/uploads',
    ],
];
