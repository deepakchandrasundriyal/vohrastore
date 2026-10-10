<?php
/**
 * Marketing short link: go.php?c=<code>
 * Counts the click, then redirects to the page with its UTM parameters (+ utm_id=<code> for exact attribution).
 * Unknown or switched-off codes fall back to the home page so a shared link never dead-ends.
 */
declare(strict_types=1);

require __DIR__ . '/../backend/bootstrap.php';

use Vohra\Repositories\CampaignRepository;

$code = preg_replace('/[^a-z0-9]/', '', strtolower((string) ($_GET['c'] ?? '')));
$target = 'index.html';

try {
    $link = $code !== '' ? CampaignRepository::findActiveByCode($code) : null;
    if ($link) {
        $bot = (bool) preg_match('/bot|crawl|spider|facebookexternalhit|whatsapp|preview|slurp/i', $_SERVER['HTTP_USER_AGENT'] ?? '');
        if (!$bot) { // link previews from WhatsApp/Facebook etc. are not real clicks
            CampaignRepository::recordClick((int) $link['id'], (string) ($_SERVER['HTTP_REFERER'] ?? ''));
        }
        $query = array_filter([
            'utm_source' => $link['utm_source'], 'utm_medium' => $link['utm_medium'], 'utm_campaign' => $link['utm_campaign'],
            'utm_term' => $link['utm_term'], 'utm_content' => $link['utm_content'], 'utm_id' => $link['code'],
        ], static fn ($v) => $v !== '' && $v !== null);
        $target = $link['destination'] . '?' . http_build_query($query);
    }
} catch (Throwable $e) {
    error_log((string) $e); // never block the visitor because tracking failed
}

header('Cache-Control: no-store');
header('Location: ' . $target, true, 302);
