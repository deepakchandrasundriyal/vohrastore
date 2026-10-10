<?php
declare(strict_types=1);

namespace Vohra\Repositories;

use Vohra\Core\Database as DB;

final class EnquiryRepository
{
    public const STATUSES = ['new' => 'New', 'in_progress' => 'In progress', 'closed' => 'Closed'];
    public const SOURCES = ['contact' => 'Contact form', 'services' => 'Bulk / B2B'];

    public static function paginate(array $f): array
    {
        $where = ['1 = 1'];
        $params = [];
        if (!empty($f['q'])) {
            $where[] = '(e.name LIKE :q OR e.email LIKE :q OR e.phone LIKE :q OR e.company LIKE :q OR e.message LIKE :q)';
            $params['q'] = '%' . $f['q'] . '%';
        }
        if (!empty($f['status']) && isset(self::STATUSES[$f['status']])) {
            $where[] = 'e.status = :status';
            $params['status'] = $f['status'];
        }
        if (!empty($f['source']) && isset(self::SOURCES[$f['source']])) {
            $where[] = 'e.source = :source';
            $params['source'] = $f['source'];
        }
        $page = DB::paginate('e.*', 'FROM enquiries e WHERE ' . implode(' AND ', $where), $params, 'e.created_at DESC', (int) ($f['page'] ?? 1), (int) ($f['per_page'] ?? 20));
        $page['data'] = array_map([self::class, 'cast'], $page['data']);
        $page['counts'] = self::statusCounts();
        return $page;
    }

    public static function find(int $id): ?array
    {
        $row = DB::one('SELECT * FROM enquiries WHERE id = ?', [$id]);
        return $row ? self::cast($row) : null;
    }

    public static function create(array $data): int
    {
        return DB::insert('enquiries', $data);
    }

    public static function update(int $id, array $data): void
    {
        DB::update('enquiries', $data, $id);
    }

    public static function delete(int $id): bool
    {
        return DB::delete('enquiries', $id);
    }

    public static function statusCounts(): array
    {
        $counts = array_fill_keys(array_keys(self::STATUSES), 0);
        foreach (DB::all('SELECT status, COUNT(*) AS n FROM enquiries GROUP BY status') as $r) {
            $counts[$r['status']] = (int) $r['n'];
        }
        return $counts;
    }

    private static function cast(array $r): array
    {
        $r['id'] = (int) $r['id'];
        return $r;
    }
}
