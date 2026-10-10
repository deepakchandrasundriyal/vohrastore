<?php
declare(strict_types=1);

namespace Vohra\Controllers\Admin;

use Vohra\Core\HttpException;
use Vohra\Core\Request;
use Vohra\Services\ReportService;

final class ReportController
{
    private const REPORTS = ['locations', 'products', 'marketing', 'customers', 'time'];

    /** GET reports/{name}?from=YYYY-MM-DD&to=YYYY-MM-DD */
    public static function show(Request $r): array
    {
        $name = $r->param('name');
        if (!in_array($name, self::REPORTS, true)) {
            throw HttpException::notFound('Report');
        }
        $service = ReportService::fromRequest($r->query('from'), $r->query('to'));
        return ['range' => $service->range()] + $service->{$name}();
    }
}
