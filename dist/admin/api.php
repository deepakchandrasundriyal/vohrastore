<?php
/**
 * Admin JSON API — front controller.
 * Routes: admin/api.php/<resource>[/<id>[/<action>]]  (or admin/api.php?r=<resource>/... when PATH_INFO is unavailable)
 */
declare(strict_types=1);

require __DIR__ . '/../../backend/bootstrap.php';

use Vohra\Auth\AdminAuth;
use Vohra\Controllers\Admin\AdminUserController as Team;
use Vohra\Controllers\Admin\AuthController as Auth;
use Vohra\Controllers\Admin\CampaignController as Campaigns;
use Vohra\Controllers\Admin\DecorPropController as Props;
use Vohra\Controllers\Admin\ReportController as Reports;
use Vohra\Controllers\Admin\SeoController as Seo;
use Vohra\Controllers\Admin\ShippingController as Shipping;
use Vohra\Controllers\Admin\CouponController as Coupons;
use Vohra\Controllers\Admin\CustomerController as Customers;
use Vohra\Controllers\Admin\DashboardController as Dashboard;
use Vohra\Controllers\Admin\EnquiryController as Enquiries;
use Vohra\Controllers\Admin\OrderController as Orders;
use Vohra\Controllers\Admin\ProductController as Products;
use Vohra\Controllers\Admin\SettingController as Settings;
use Vohra\Core\Router;

AdminAuth::start();

(new Router())
    ->before([AdminAuth::class, 'guard'])

    // Session
    ->get('auth/session',  [Auth::class, 'session'])
    ->post('auth/login',   [Auth::class, 'login'])
    ->post('auth/logout',  [Auth::class, 'logout'])
    ->put('auth/profile',  [Auth::class, 'updateProfile'])

    // Analytics
    ->get('dashboard',     [Dashboard::class, 'show'])

    // Orders
    ->get('orders',                 [Orders::class, 'index'])
    ->get('orders/meta',            [Orders::class, 'meta'])
    ->get('orders/export',          [Orders::class, 'export'])
    ->post('orders/preview',        [Orders::class, 'preview'])
    ->post('orders',                [Orders::class, 'store'])
    ->get('orders/{id}',            [Orders::class, 'show'])
    ->put('orders/{id}',            [Orders::class, 'update'])
    ->post('orders/{id}/status',    [Orders::class, 'changeStatus'])
    ->delete('orders/{id}',         [Orders::class, 'destroy'])

    // Shipping / fulfilment
    ->get('shipping/queue',                    [Shipping::class, 'queue'])
    ->get('shipping/slips',                    [Shipping::class, 'slips'])
    ->post('shipping/bulk-pack',               [Shipping::class, 'bulkPack'])
    ->post('shipping/sync',                    [Shipping::class, 'syncAll'])
    ->get('shipping/settings',                 [Shipping::class, 'settings'])
    ->put('shipping/settings',                 [Shipping::class, 'saveSettings'])
    ->post('shipping/test',                    [Shipping::class, 'test'])
    ->post('shipping/webhook-token',           [Shipping::class, 'rotateWebhookToken'])
    ->get('orders/{id}/shipping',              [Shipping::class, 'show'])
    ->post('orders/{id}/shipping/rates',       [Shipping::class, 'rates'])
    ->post('orders/{id}/shipping/ship',        [Shipping::class, 'ship'])
    ->post('orders/{id}/shipping/awb',         [Shipping::class, 'retryAwb'])
    ->post('orders/{id}/shipping/manual',      [Shipping::class, 'manual'])
    ->post('orders/{id}/shipping/manual-status', [Shipping::class, 'manualStatus'])
    ->post('orders/{id}/shipping/pickup',      [Shipping::class, 'pickup'])
    ->get('orders/{id}/shipping/doc/{type}',   [Shipping::class, 'document'])
    ->post('orders/{id}/shipping/track',       [Shipping::class, 'track'])
    ->post('orders/{id}/shipping/cancel',      [Shipping::class, 'cancel'])

    // Products
    ->get('products',               [Products::class, 'index'])
    ->get('products/meta',          [Products::class, 'meta'])
    ->get('products/options',       [Products::class, 'options'])
    ->post('products/upload',       [Products::class, 'upload'])
    ->post('products',              [Products::class, 'store'])
    ->get('products/{id}',          [Products::class, 'show'])
    ->put('products/{id}',          [Products::class, 'update'])
    ->post('products/{id}/quick',   [Products::class, 'quickUpdate'])
    ->delete('products/{id}',       [Products::class, 'destroy'])

    // Customers
    ->get('customers',              [Customers::class, 'index'])
    ->post('customers',             [Customers::class, 'store'])
    ->get('customers/{id}',         [Customers::class, 'show'])
    ->put('customers/{id}',         [Customers::class, 'update'])
    ->delete('customers/{id}',      [Customers::class, 'destroy'])

    // Coupons
    ->get('coupons',                [Coupons::class, 'index'])
    ->post('coupons',               [Coupons::class, 'store'])
    ->get('coupons/{id}',           [Coupons::class, 'show'])
    ->put('coupons/{id}',           [Coupons::class, 'update'])
    ->post('coupons/{id}/toggle',   [Coupons::class, 'toggle'])
    ->delete('coupons/{id}',        [Coupons::class, 'destroy'])

    // Enquiries
    ->get('enquiries',              [Enquiries::class, 'index'])
    ->post('enquiries',             [Enquiries::class, 'store'])
    ->get('enquiries/{id}',         [Enquiries::class, 'show'])
    ->put('enquiries/{id}',         [Enquiries::class, 'update'])
    ->delete('enquiries/{id}',      [Enquiries::class, 'destroy'])

    // Reports
    ->get('reports/{name}',         [Reports::class, 'show'])

    // Marketing links
    ->get('campaigns',              [Campaigns::class, 'index'])
    ->get('campaigns/meta',         [Campaigns::class, 'meta'])
    ->post('campaigns',             [Campaigns::class, 'store'])
    ->get('campaigns/{id}',         [Campaigns::class, 'show'])
    ->put('campaigns/{id}',         [Campaigns::class, 'update'])
    ->delete('campaigns/{id}',      [Campaigns::class, 'destroy'])

    // SEO
    ->get('seo',                    [Seo::class, 'index'])
    ->post('seo/upload',            [Seo::class, 'upload'])
    ->post('seo/pages',             [Seo::class, 'store'])
    ->put('seo/pages/{id}',         [Seo::class, 'update'])
    ->delete('seo/pages/{id}',      [Seo::class, 'destroy'])

    // Decorative props library
    ->get('props',                  [Props::class, 'index'])
    ->post('props',                 [Props::class, 'store'])
    ->post('props/{id}',            [Props::class, 'update'])
    ->delete('props/{id}',          [Props::class, 'destroy'])

    // Settings & team
    ->get('settings',               [Settings::class, 'show'])
    ->put('settings',               [Settings::class, 'update'])
    ->get('team',                   [Team::class, 'index'])
    ->post('team',                  [Team::class, 'store'])
    ->put('team/{id}',              [Team::class, 'update'])
    ->delete('team/{id}',           [Team::class, 'destroy'])

    ->dispatch();
