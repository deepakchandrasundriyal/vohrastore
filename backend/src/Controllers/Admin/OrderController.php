<?php
declare(strict_types=1);

namespace Vohra\Controllers\Admin;

use Vohra\Auth\AdminAuth;
use Vohra\Core\HttpException;
use Vohra\Core\Request;
use Vohra\Repositories\OrderRepository;
use Vohra\Services\Attribution;
use Vohra\Services\OrderService;
use Vohra\Services\Shipping\ShippingService;

final class OrderController
{
    private const FILTERS = ['q', 'status', 'payment_status', 'payment_method', 'customer_id', 'utm_source', 'utm_campaign', 'utm_id', 'state', 'from', 'to', 'sort', 'page', 'per_page'];

    public static function index(Request $r): array
    {
        return OrderRepository::paginate(self::filters($r));
    }

    public static function meta(): array
    {
        return [
            'statuses'         => OrderRepository::STATUSES,
            'payment_statuses' => OrderRepository::PAYMENT_STATUSES,
            'payment_methods'  => OrderRepository::PAYMENT_METHODS,
            'utm_sources'      => OrderRepository::sources(),
            'suggested_sources' => Attribution::SOURCES,
            'suggested_mediums' => Attribution::MEDIUMS,
        ];
    }

    public static function show(Request $r): array
    {
        $order = OrderRepository::find($r->id()) ?? throw HttpException::notFound('Order');
        $order['shipment'] = ShippingService::forOrder($order['id']);
        return $order;
    }

    public static function store(Request $r): array
    {
        return OrderService::create($r->body(), 'admin', AdminAuth::user()['id']);
    }

    public static function preview(Request $r): array
    {
        return OrderService::preview($r->body());
    }

    public static function update(Request $r): array
    {
        $order = OrderService::update($r->id(), $r->body());
        $order['shipment'] = ShippingService::forOrder($order['id']);
        return $order;
    }

    public static function changeStatus(Request $r): array
    {
        $adminId = AdminAuth::user()['id'];
        $order = OrderService::changeStatus($r->id(), (string) $r->input('status'), trim((string) $r->input('note', '')), $adminId);
        if ($order['status'] === 'cancelled') {
            $order['warning'] = ShippingService::cancelForCancelledOrder($order['id'], $adminId);
        }
        $order['shipment'] = ShippingService::forOrder($order['id']);
        return $order;
    }

    public static function destroy(Request $r): array
    {
        OrderService::delete($r->id());
        return ['ok' => true];
    }

    /** GET orders/export — CSV of the current filter. Streams a file instead of JSON. */
    public static function export(Request $r): void
    {
        $rows = OrderRepository::export(self::filters($r));
        header('Content-Type: text/csv; charset=utf-8');
        header('Content-Disposition: attachment; filename="orders-' . date('Y-m-d') . '.csv"');
        $out = fopen('php://output', 'w');
        fwrite($out, "\xEF\xBB\xBF"); // UTF-8 BOM so Excel shows ₹ and Hindi names correctly
        fputcsv($out, ['Order no', 'Date', 'Customer', 'Email', 'Phone', 'Address', 'City', 'State', 'PIN', 'Subtotal', 'Discount', 'Coupon', 'Shipping', 'Total', 'Payment method', 'Payment status', 'Status', 'Source', 'UTM source', 'UTM medium', 'UTM campaign', 'UTM term', 'UTM content', 'Link code', 'Landing page', 'Referrer']);
        foreach ($rows as $o) {
            fputcsv($out, [
                $o['order_no'], $o['created_at'], $o['customer_name'], $o['customer_email'], $o['customer_phone'],
                trim($o['address_line1'] . ', ' . $o['address_line2'], ', '), $o['city'], $o['state'], $o['pin'],
                $o['subtotal'], $o['discount'], $o['coupon_code'], $o['shipping'], $o['total'],
                OrderRepository::PAYMENT_METHODS[$o['payment_method']], $o['payment_status'], OrderRepository::STATUSES[$o['status']], $o['source'],
                $o['utm_source'], $o['utm_medium'], $o['utm_campaign'], $o['utm_term'], $o['utm_content'], $o['utm_id'], $o['landing_page'], $o['referrer'],
            ]);
        }
        fclose($out);
        exit;
    }

    private static function filters(Request $r): array
    {
        $f = [];
        foreach (self::FILTERS as $k) {
            $f[$k] = $r->query($k);
        }
        return $f;
    }
}
