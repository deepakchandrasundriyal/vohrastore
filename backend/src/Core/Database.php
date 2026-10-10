<?php
declare(strict_types=1);

namespace Vohra\Core;

use PDO;
use PDOStatement;
use Throwable;

/** Thin PDO wrapper: one shared connection, prepared statements everywhere. */
final class Database
{
    private static ?PDO $pdo = null;

    public static function pdo(): PDO
    {
        if (self::$pdo === null) {
            $c = Config::get('db');
            $dsn = sprintf('mysql:host=%s;port=%d;dbname=%s;charset=%s', $c['host'], $c['port'], $c['name'], $c['charset']);
            self::$pdo = new PDO($dsn, $c['user'], $c['pass'], [
                PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
                PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
                PDO::ATTR_EMULATE_PREPARES   => true, // lets one named placeholder (e.g. :q) appear several times

            ]);
            self::$pdo->exec("SET time_zone = '" . (new \DateTime())->format('P') . "'");
        }
        return self::$pdo;
    }

    public static function run(string $sql, array $params = []): PDOStatement
    {
        $stmt = self::pdo()->prepare($sql);
        $stmt->execute($params);
        return $stmt;
    }

    public static function all(string $sql, array $params = []): array
    {
        return self::run($sql, $params)->fetchAll();
    }

    public static function one(string $sql, array $params = []): ?array
    {
        $row = self::run($sql, $params)->fetch();
        return $row === false ? null : $row;
    }

    public static function value(string $sql, array $params = []): mixed
    {
        $value = self::run($sql, $params)->fetchColumn();
        return $value === false ? null : $value;
    }

    /** Insert an associative array and return the new id. Column names come from code, never from user input. */
    public static function insert(string $table, array $data): int
    {
        $cols = array_keys($data);
        $sql = sprintf(
            'INSERT INTO `%s` (%s) VALUES (%s)',
            $table,
            implode(', ', array_map(fn ($c) => "`$c`", $cols)),
            implode(', ', array_map(fn ($c) => ":$c", $cols))
        );
        self::run($sql, $data);
        return (int) self::pdo()->lastInsertId();
    }

    public static function update(string $table, array $data, int $id): void
    {
        if (!$data) {
            return;
        }
        $set = implode(', ', array_map(fn ($c) => "`$c` = :$c", array_keys($data)));
        self::run("UPDATE `$table` SET $set WHERE id = :__id", $data + ['__id' => $id]);
    }

    public static function delete(string $table, int $id): bool
    {
        return self::run("DELETE FROM `$table` WHERE id = ?", [$id])->rowCount() > 0;
    }

    /**
     * Paginate a query. $from is everything after SELECT ... (FROM, JOINs, WHERE).
     * Returns ['data' => rows, 'meta' => [page, per_page, total, pages]].
     */
    public static function paginate(string $select, string $from, array $params, string $orderBy, int $page, int $perPage = 20): array
    {
        $perPage = max(1, min(100, $perPage));
        $total = (int) self::value("SELECT COUNT(*) $from", $params);
        $pages = max(1, (int) ceil($total / $perPage));
        $page = max(1, min($page, $pages));
        $offset = ($page - 1) * $perPage;
        $rows = self::all("SELECT $select $from ORDER BY $orderBy LIMIT $perPage OFFSET $offset", $params);

        return ['data' => $rows, 'meta' => ['page' => $page, 'per_page' => $perPage, 'total' => $total, 'pages' => $pages]];
    }

    /** Build a safe ORDER BY from a client value like "-created_at" using an allow-list. */
    public static function sort(?string $requested, array $allowed, string $default): string
    {
        $requested = (string) $requested;
        $desc = str_starts_with($requested, '-');
        $key = ltrim($requested, '-');
        return isset($allowed[$key]) ? $allowed[$key] . ($desc ? ' DESC' : ' ASC') : $default;
    }

    /** @template T @param callable():T $fn @return T */
    public static function transaction(callable $fn): mixed
    {
        $pdo = self::pdo();
        $pdo->beginTransaction();
        try {
            $result = $fn();
            $pdo->commit();
            return $result;
        } catch (Throwable $e) {
            $pdo->rollBack();
            throw $e;
        }
    }
}
