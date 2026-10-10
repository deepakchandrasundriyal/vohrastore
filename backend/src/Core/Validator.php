<?php
declare(strict_types=1);

namespace Vohra\Core;

/**
 * Declarative input validation + casting.
 *
 *   $data = Validator::make($input, [
 *       'name'  => 'required|string|max:120',
 *       'price' => 'required|numeric|min:0',
 *       'type'  => 'required|in:percent,flat',
 *       'ends'  => 'nullable|date',
 *   ]);
 *
 * Returns only the declared keys, cast to their types. Throws a 422 HttpException
 * carrying one message per failing field.
 */
final class Validator
{
    public static function make(array $input, array $rules, array $labels = []): array
    {
        $clean = [];
        $errors = [];

        foreach ($rules as $field => $spec) {
            $list = explode('|', $spec);
            $label = $labels[$field] ?? ucfirst(str_replace('_', ' ', $field));
            $value = $input[$field] ?? null;
            $value = is_string($value) ? trim($value) : $value;

            if (in_array('bool', $list, true)) {
                $clean[$field] = filter_var($value, FILTER_VALIDATE_BOOLEAN) ? 1 : 0;
                continue;
            }
            if ($value === null || $value === '' || $value === []) {
                if (in_array('required', $list, true)) {
                    $errors[$field] = "$label is required.";
                } else {
                    $clean[$field] = match (true) {
                        in_array('array', $list, true)  => [],
                        in_array('string', $list, true) && !in_array('nullable', $list, true) => '',
                        default => null,
                    };
                }
                continue;
            }

            $numeric = in_array('int', $list, true) || in_array('numeric', $list, true);
            foreach ($list as $rule) {
                [$name, $arg] = array_pad(explode(':', $rule, 2), 2, '');
                $error = self::check($name, $arg, $value, $label, $numeric);
                if ($error !== null) {
                    $errors[$field] = $error;
                    continue 2;
                }
                $value = self::cast($name, $value);
            }
            $clean[$field] = $value;
        }

        if ($errors) {
            throw HttpException::validation($errors);
        }
        return $clean;
    }

    private static function check(string $rule, string $arg, mixed $v, string $label, bool $numeric): ?string
    {
        $size = $numeric ? (float) $v : (is_array($v) ? count($v) : mb_strlen((string) $v));
        $unit = $numeric ? '' : (is_array($v) ? ' items' : ' characters');

        return match ($rule) {
            'required', 'nullable' => null,
            'string'  => is_scalar($v) ? null : "$label must be text.",
            'array'   => is_array($v) ? null : "$label must be a list.",
            'int'     => filter_var($v, FILTER_VALIDATE_INT) !== false ? null : "$label must be a whole number.",
            'numeric' => is_numeric($v) ? null : "$label must be a number.",
            'email'   => filter_var($v, FILTER_VALIDATE_EMAIL) ? null : 'Enter a valid email address.',
            'phone'   => preg_match('/^[6-9]\d{9}$/', self::digits((string) $v)) ? null : 'Enter a 10-digit Indian mobile number.',
            'pin'     => preg_match('/^[1-9]\d{5}$/', (string) $v) ? null : 'Enter a 6-digit PIN code.',
            'slug'    => preg_match('/^[a-z0-9]+(?:-[a-z0-9]+)*$/', (string) $v) ? null : "$label may only use lowercase letters, numbers and dashes.",
            'color'   => preg_match('/^#[0-9a-fA-F]{6}$/', (string) $v) ? null : "$label must be a hex colour like #C98A1B.",
            'date'    => strtotime((string) $v) !== false ? null : "$label must be a valid date.",
            'in'      => in_array((string) $v, explode(',', $arg), true) ? null : "$label has an invalid value.",
            'min'     => $size >= (float) $arg ? null : "$label must be at least $arg$unit.",
            'max'     => $size <= (float) $arg ? null : "$label must be at most $arg$unit.",
            default   => throw new \LogicException("Unknown validation rule '$rule'."),
        };
    }

    private static function cast(string $rule, mixed $v): mixed
    {
        return match ($rule) {
            'int'     => (int) $v,
            'numeric' => round((float) $v, 2),
            'string'  => (string) $v,
            'email'   => strtolower((string) $v),
            'phone'   => self::digits((string) $v),
            'slug'    => strtolower((string) $v),
            'color'   => strtoupper((string) $v),
            'date'    => date('Y-m-d H:i:s', (int) strtotime((string) $v)),
            default   => $v,
        };
    }

    private static function digits(string $v): string
    {
        $d = (string) preg_replace('/\D/', '', $v);
        return strlen($d) === 12 && str_starts_with($d, '91') ? substr($d, 2) : $d;
    }
}
