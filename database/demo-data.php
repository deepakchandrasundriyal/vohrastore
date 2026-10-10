<?php
/**
 * Demo data for the analytics dashboard — included by install.php when run with --demo.
 * Deterministic (fixed seed) so every install looks the same. Not for production.
 */
declare(strict_types=1);

use Vohra\Core\Database as DB;

mt_srand(42);

$first = ['Aarav', 'Diya', 'Kabir', 'Ananya', 'Rohan', 'Isha', 'Vivaan', 'Meera', 'Arjun', 'Saanvi', 'Karan', 'Priya', 'Aditya', 'Nisha', 'Rahul', 'Kavya', 'Ishaan', 'Tara', 'Dev', 'Riya'];
$last = ['Sharma', 'Verma', 'Gupta', 'Mehta', 'Kapoor', 'Iyer', 'Nair', 'Reddy', 'Singh', 'Malhotra', 'Bansal', 'Chopra', 'Joshi', 'Agarwal'];
$places = [
    ['New Delhi', 'Delhi', '110001'], ['Gurugram', 'Haryana', '122001'], ['Noida', 'Uttar Pradesh', '201301'], ['Mumbai', 'Maharashtra', '400001'],
    ['Pune', 'Maharashtra', '411001'], ['Bengaluru', 'Karnataka', '560001'], ['Jaipur', 'Rajasthan', '302001'], ['Chandigarh', 'Chandigarh', '160017'],
    ['Faridabad', 'Haryana', '121004'], ['Hyderabad', 'Telangana', '500001'], ['Ahmedabad', 'Gujarat', '380001'], ['Kolkata', 'West Bengal', '700001'],
];
$products = DB::all('SELECT id, slug, name, price FROM products');
$weights = [18, 14, 12, 9, 16, 15, 8]; // popularity per product

$pick = static function (array $weights): int {
    $r = mt_rand(1, array_sum($weights));
    foreach ($weights as $i => $w) {
        if (($r -= $w) <= 0) {
            return $i;
        }
    }
    return 0;
};

// Customers, spread over the last ~120 days
$customers = [];
for ($i = 0; $i < 70; $i++) {
    $name = $first[mt_rand(0, count($first) - 1)] . ' ' . $last[mt_rand(0, count($last) - 1)];
    $place = $places[mt_rand(0, count($places) - 1)];
    $email = strtolower(str_replace(' ', '.', $name)) . $i . '@example.com';
    $created = date('Y-m-d H:i:s', strtotime('-' . mt_rand(0, 120) . ' days -' . mt_rand(0, 86399) . ' seconds'));
    $address = ['line1' => mt_rand(1, 300) . ', Block ' . chr(mt_rand(65, 72)), 'line2' => '', 'city' => $place[0], 'state' => $place[1], 'pin' => $place[2]];
    $id = DB::insert('customers', [
        'name' => $name, 'email' => $email, 'phone' => (string) mt_rand(7000000000, 9999999999),
        'password_hash' => mt_rand(0, 2) ? password_hash('password123', PASSWORD_DEFAULT, ['cost' => 4]) : null,
        'address' => json_encode($address), 'created_at' => $created,
    ]);
    $customers[] = ['id' => $id, 'name' => $name, 'email' => $email, 'created' => $created, 'address' => $address];
}

// Orders — more recent days are busier so the trend line rises
$orderCount = 0;
$statusFlow = ['placed', 'packed', 'shipped', 'out_for_delivery', 'delivered'];
foreach ($customers as $c) {
    $n = mt_rand(1, 5);
    for ($k = 0; $k < $n; $k++) {
        $ageDays = (int) floor((time() - strtotime($c['created'])) / 86400);
        $daysAgo = (int) floor(mt_rand(0, max(0, $ageDays) * 100) / 100 * (mt_rand(0, 1) ? 1 : 0.5));
        $created = date('Y-m-d H:i:s', strtotime("-$daysAgo days -" . mt_rand(0, 36000) . ' seconds'));

        $lines = [];
        foreach (range(1, mt_rand(1, 4)) as $_) {
            $p = $products[$pick($weights)];
            $lines[$p['id']] = ['p' => $p, 'qty' => ($lines[$p['id']]['qty'] ?? 0) + mt_rand(1, 3)];
        }
        $subtotal = array_sum(array_map(static fn ($l) => $l['p']['price'] * $l['qty'], $lines));
        $coupon = mt_rand(1, 5) === 1 ? 'VOHRA10' : null;
        $discount = $coupon ? round($subtotal * 0.10) : 0;
        $shipping = ($subtotal - $discount) >= 499 ? 0 : 49;

        $stage = $daysAgo > 6 ? 4 : min(4, intdiv($daysAgo, 2) + mt_rand(0, 1));
        $status = mt_rand(1, 18) === 1 ? 'cancelled' : $statusFlow[$stage];
        $method = mt_rand(1, 10) <= 6 ? 'razorpay' : 'cod';
        $payment = match (true) {
            $status === 'cancelled'                       => $method === 'razorpay' ? 'refunded' : 'pending',
            $method === 'razorpay'                        => mt_rand(1, 25) === 1 ? 'pending' : 'paid',
            $status === 'delivered'                       => 'paid',
            default                                       => 'pending',
        };

        $orderId = DB::insert('orders', [
            'order_no' => 'VS' . str_pad((string) mt_rand(10000000, 99999999), 8, '0', STR_PAD_LEFT),
            'customer_id' => $c['id'], 'customer_name' => $c['name'], 'customer_email' => $c['email'], 'customer_phone' => (string) mt_rand(7000000000, 9999999999),
            'address_line1' => $c['address']['line1'], 'address_line2' => '', 'city' => $c['address']['city'], 'state' => $c['address']['state'], 'pin' => $c['address']['pin'],
            'subtotal' => $subtotal, 'discount' => $discount, 'shipping' => $shipping, 'total' => $subtotal - $discount + $shipping,
            'coupon_code' => $coupon, 'payment_method' => $method, 'payment_status' => $payment, 'status' => $status, 'source' => 'web',
            'created_at' => $created, 'updated_at' => $created,
        ]);
        foreach ($lines as $l) {
            DB::insert('order_items', [
                'order_id' => $orderId, 'product_id' => $l['p']['id'], 'product_slug' => $l['p']['slug'], 'product_name' => $l['p']['name'],
                'unit_price' => $l['p']['price'], 'qty' => $l['qty'], 'line_total' => $l['p']['price'] * $l['qty'],
            ]);
        }
        $flow = $status === 'cancelled' ? ['placed', 'cancelled'] : array_slice($statusFlow, 0, $stage + 1);
        foreach ($flow as $step => $s) {
            DB::insert('order_status_history', [
                'order_id' => $orderId, 'status' => $s, 'note' => $step === 0 ? 'Order placed online' : '',
                'created_at' => date('Y-m-d H:i:s', min(time(), strtotime($created) + (int) ($step * 86400 * 0.8))),
            ]);
        }
        if ($coupon && $status !== 'cancelled') {
            DB::run('UPDATE coupons SET used_count = used_count + 1 WHERE code = ?', [$coupon]);
        }
        $orderCount++;
    }
}

// Enquiries
$topics = ['Order status', 'Bulk order', 'Corporate gifting', 'Distribution', 'Feedback'];
for ($i = 0; $i < 14; $i++) {
    $c = $customers[mt_rand(0, count($customers) - 1)];
    $bulk = $i % 2 === 0;
    DB::insert('enquiries', [
        'source' => $bulk ? 'services' : 'contact', 'topic' => $topics[mt_rand(0, count($topics) - 1)],
        'name' => $c['name'], 'email' => $c['email'], 'phone' => (string) mt_rand(7000000000, 9999999999),
        'company' => $bulk ? $last[mt_rand(0, count($last) - 1)] . ' Traders' : '', 'city' => $c['address']['city'],
        'quantity' => $bulk ? mt_rand(5, 50) * 10 . ' tins, mixed flavours' : '',
        'message' => $bulk ? 'We would like pricing for a festive gifting order with custom sleeves.' : 'Could you share when my order will be delivered?',
        'status' => ['new', 'new', 'in_progress', 'closed'][mt_rand(0, 3)],
        'created_at' => date('Y-m-d H:i:s', strtotime('-' . mt_rand(0, 40) . ' days')),
    ]);
}

echo '✓ Demo data: ' . count($customers) . " customers, $orderCount orders, 14 enquiries\n";

require __DIR__ . '/demo-marketing.php';
