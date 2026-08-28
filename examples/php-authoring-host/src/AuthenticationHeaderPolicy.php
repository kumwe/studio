<?php

declare(strict_types=1);

namespace Kumwe\Studio\PhpAuthoringHost;

use InvalidArgumentException;

/** Closed policy for configurable CSRF and short-lived-token request fields. */
final class AuthenticationHeaderPolicy
{
    /** @var list<string> */
    private const RESERVED_NAMES = [
        'accept',
        'authorization',
        'connection',
        'content-length',
        'content-type',
        'cookie',
        'date',
        'expect',
        'forwarded',
        'host',
        'keep-alive',
        'origin',
        'referer',
        'set-cookie',
        'te',
        'trailer',
        'transfer-encoding',
        'upgrade',
        'user-agent',
        'via',
        'x-studio-operation',
    ];

    /** @var list<string> */
    private const RESERVED_PREFIXES = [
        'access-control-',
        'proxy-',
        'sec-',
        'x-forwarded-',
    ];

    public static function assertCustom(string $headerName): void
    {
        if (
            strlen($headerName) > 100
            || !preg_match("/\\A[!#$%&'*+.^_`|~0-9A-Za-z-]+\\z/", $headerName)
        ) {
            throw new InvalidArgumentException('The custom authentication field name is invalid or too long.');
        }

        $normalized = strtolower($headerName);
        if (in_array($normalized, self::RESERVED_NAMES, true)) {
            throw new InvalidArgumentException('The custom authentication field is transport-owned or browser-controlled.');
        }
        foreach (self::RESERVED_PREFIXES as $prefix) {
            if (str_starts_with($normalized, $prefix)) {
                throw new InvalidArgumentException('The custom authentication field is transport-owned or browser-controlled.');
            }
        }
    }
}
