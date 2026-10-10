<?php
declare(strict_types=1);

namespace Vohra\Controllers\Admin;

use Vohra\Auth\AdminAuth;
use Vohra\Core\HttpException;
use Vohra\Core\Request;
use Vohra\Core\Validator;
use Vohra\Repositories\CampaignRepository;
use Vohra\Repositories\PageSeoRepository;
use Vohra\Repositories\ProductRepository;
use Vohra\Services\Attribution;

/** Marketing links: the team builds a tracked URL for any storefront page and shares it. */
final class CampaignController
{
    public static function index(Request $r): array
    {
        return ['data' => CampaignRepository::list(['q' => $r->query('q'), 'source' => $r->query('source')])];
    }

    /** Pages a link can point to, plus naming suggestions. */
    public static function meta(): array
    {
        $pages = array_map(static fn ($p) => ['path' => $p['path'], 'label' => $p['label']], array_filter(PageSeoRepository::all(), static fn ($p) => !$p['noindex']));
        foreach (ProductRepository::options() as $p) {
            if ($p['is_active']) {
                $pages[] = ['path' => "product-{$p['slug']}.html", 'label' => "Product · {$p['name']}"];
            }
        }
        $used = CampaignRepository::usedValues();
        $merge = static fn (array $a, array $b): array => array_values(array_unique(array_merge($a, $b)));
        return [
            'pages'     => array_values($pages),
            'sources'   => $merge($used['sources'], Attribution::SOURCES),
            'mediums'   => $merge($used['mediums'], Attribution::MEDIUMS),
            'campaigns' => $used['campaigns'],
        ];
    }

    public static function show(Request $r): array
    {
        $link = CampaignRepository::find($r->id()) ?? throw HttpException::notFound('Link');
        $link['daily_clicks'] = CampaignRepository::dailyClicks($link['id']);
        return $link;
    }

    public static function store(Request $r): array
    {
        $data = self::validate($r->body());
        $data['code'] = self::newCode();
        $data['created_by'] = AdminAuth::user()['id'];
        return CampaignRepository::find(CampaignRepository::create($data));
    }

    /** The code never changes, so links already shared keep working. */
    public static function update(Request $r): array
    {
        $id = $r->id();
        CampaignRepository::find($id) ?? throw HttpException::notFound('Link');
        CampaignRepository::update($id, self::validate($r->body()));
        return CampaignRepository::find($id);
    }

    public static function destroy(Request $r): array
    {
        if (!CampaignRepository::delete($r->id())) {
            throw HttpException::notFound('Link');
        }
        return ['ok' => true];
    }

    private static function validate(array $in): array
    {
        $data = Validator::make($in, [
            'name'         => 'required|string|max:120',
            'destination'  => 'required|string|max:190',
            'utm_source'   => 'required|string|max:100',
            'utm_medium'   => 'required|string|max:100',
            'utm_campaign' => 'required|string|max:100',
            'utm_term'     => 'string|max:100',
            'utm_content'  => 'string|max:100',
            'notes'        => 'string|max:255',
            'is_active'    => 'bool',
        ], ['utm_source' => 'Source', 'utm_medium' => 'Medium', 'utm_campaign' => 'Campaign name', 'utm_term' => 'Keyword', 'utm_content' => 'Content']);

        if (!preg_match('#^[a-z0-9][a-z0-9._/-]*\.html$#i', $data['destination']) || str_contains($data['destination'], '..')) {
            throw HttpException::validation(['destination' => 'Choose a page from the list.']);
        }
        // UTM values: lowercase, no spaces — keeps reports consistent ("Instagram" vs "instagram ").
        foreach (['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content'] as $k) {
            $data[$k] = trim(preg_replace('/[^a-z0-9_.-]+/', '_', strtolower($data[$k])), '_');
        }
        return $data;
    }

    private static function newCode(): string
    {
        $alphabet = 'abcdefghjkmnpqrstuvwxyz23456789'; // no look-alike characters
        do {
            $code = '';
            for ($i = 0; $i < 7; $i++) {
                $code .= $alphabet[random_int(0, strlen($alphabet) - 1)];
            }
        } while (CampaignRepository::codeTaken($code));
        return $code;
    }
}
