<?php
declare(strict_types=1);

namespace Vohra\Controllers\Admin;

use Vohra\Core\HttpException;
use Vohra\Core\Request;
use Vohra\Core\Validator;
use Vohra\Repositories\CustomerRepository;
use Vohra\Repositories\OrderRepository;

final class CustomerController
{
    public static function index(Request $r): array
    {
        return CustomerRepository::paginate([
            'q' => $r->query('q'), 'type' => $r->query('type'), 'sort' => $r->query('sort'),
            'page' => $r->query('page', 1), 'per_page' => $r->query('per_page', 20),
        ]);
    }

    public static function show(Request $r): array
    {
        $customer = CustomerRepository::find($r->id()) ?? throw HttpException::notFound('Customer');
        $customer['orders'] = OrderRepository::forCustomer($customer['id']);
        return $customer;
    }

    public static function store(Request $r): array
    {
        $data = self::validate($r->body());
        $id = CustomerRepository::create($data);
        return CustomerRepository::find($id);
    }

    public static function update(Request $r): array
    {
        $id = $r->id();
        CustomerRepository::find($id) ?? throw HttpException::notFound('Customer');
        CustomerRepository::update($id, self::validate($r->body(), $id));
        return CustomerRepository::find($id);
    }

    /** Orders keep their name/address snapshot; only the link to the customer is removed. */
    public static function destroy(Request $r): array
    {
        if (!CustomerRepository::delete($r->id())) {
            throw HttpException::notFound('Customer');
        }
        return ['ok' => true];
    }

    private static function validate(array $in, int $id = 0): array
    {
        $data = Validator::make($in, [
            'name'  => 'required|string|max:120',
            'email' => 'required|email|max:190',
            'phone' => 'nullable|phone',
            'notes' => 'nullable|string|max:2000',
            'line1' => 'nullable|string|max:190',
            'line2' => 'nullable|string|max:190',
            'city'  => 'nullable|string|max:80',
            'state' => 'nullable|string|max:80',
            'pin'   => 'nullable|pin',
        ], ['line1' => 'Address', 'pin' => 'PIN code']);
        if (CustomerRepository::emailTaken($data['email'], $id)) {
            throw HttpException::validation(['email' => 'A customer with this email already exists.']);
        }
        $address = array_intersect_key($data, array_flip(['line1', 'line2', 'city', 'state', 'pin']));
        return [
            'name'    => $data['name'],
            'email'   => $data['email'],
            'phone'   => $data['phone'] ?? '',
            'notes'   => $data['notes'],
            'address' => array_filter($address) ? array_map(static fn ($v) => (string) $v, $address) : null,
        ];
    }
}
