<?php
declare(strict_types=1);

namespace Vohra\Controllers\Admin;

use Vohra\Core\Request;
use Vohra\Services\AnalyticsService;

final class DashboardController
{
    public static function show(Request $r): array
    {
        return AnalyticsService::dashboard((string) $r->query('range', '30d'));
    }
}
