<?php
declare(strict_types=1);

namespace Vohra\Controllers\Admin;

use Vohra\Core\HttpException;
use Vohra\Core\Request;
use Vohra\Core\Validator;
use Vohra\Repositories\EnquiryRepository;

final class EnquiryController
{
    public static function index(Request $r): array
    {
        return EnquiryRepository::paginate([
            'q' => $r->query('q'), 'status' => $r->query('status'), 'source' => $r->query('source'),
            'page' => $r->query('page', 1), 'per_page' => $r->query('per_page', 20),
        ]);
    }

    public static function show(Request $r): array
    {
        return EnquiryRepository::find($r->id()) ?? throw HttpException::notFound('Enquiry');
    }

    /** Admins can log enquiries that came in by phone or WhatsApp. */
    public static function store(Request $r): array
    {
        $id = EnquiryRepository::create(self::validate($r->body()));
        return EnquiryRepository::find($id);
    }

    public static function update(Request $r): array
    {
        $id = $r->id();
        EnquiryRepository::find($id) ?? throw HttpException::notFound('Enquiry');
        EnquiryRepository::update($id, self::validate($r->body()));
        return EnquiryRepository::find($id);
    }

    public static function destroy(Request $r): array
    {
        if (!EnquiryRepository::delete($r->id())) {
            throw HttpException::notFound('Enquiry');
        }
        return ['ok' => true];
    }

    private static function validate(array $in): array
    {
        $data = Validator::make($in, [
            'source'    => 'required|in:' . implode(',', array_keys(EnquiryRepository::SOURCES)),
            'topic'     => 'string|max:80',
            'name'      => 'required|string|max:120',
            'email'     => 'nullable|email|max:190',
            'phone'     => 'nullable|phone',
            'company'   => 'string|max:120',
            'city'      => 'string|max:80',
            'quantity'  => 'string|max:120',
            'order_ref' => 'string|max:20',
            'message'   => 'required|string|max:5000',
            'status'    => 'required|in:' . implode(',', array_keys(EnquiryRepository::STATUSES)),
        ], ['order_ref' => 'Order ID']);
        if (!$data['email'] && !$data['phone']) {
            throw HttpException::validation(['phone' => 'Add a phone number or an email.']);
        }
        $data['email'] ??= '';
        $data['phone'] ??= '';
        return $data;
    }
}
