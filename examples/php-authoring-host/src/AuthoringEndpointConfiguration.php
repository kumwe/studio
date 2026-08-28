<?php

declare(strict_types=1);

namespace Kumwe\Studio\PhpAuthoringHost;

use InvalidArgumentException;
use stdClass;

/** Creates deployment routing values that exactly match AuthoringResponder. */
final class AuthoringEndpointConfiguration
{
    public const DEFAULT_ROUTE_PREFIX = '/studio/ports';
    public const SINGLE_ENDPOINT_OPERATION_HEADER = 'X-Studio-Operation';

    public static function operationMap(string $routePrefix = self::DEFAULT_ROUTE_PREFIX): stdClass
    {
        $prefix = self::normalizeRoutePrefix($routePrefix);
        $endpoints = [];
        foreach (AuthoringOperationRegistry::all() as $operation) {
            $endpoints[$operation->route] = $prefix . '/' . $operation->route;
        }

        return (object) [
            'kind' => 'operation-map',
            'endpoints' => (object) $endpoints,
        ];
    }

    public static function singleEndpoint(string $endpoint = self::DEFAULT_ROUTE_PREFIX): stdClass
    {
        return (object) [
            'kind' => 'single-endpoint',
            'endpoint' => self::normalizeRoutePrefix($endpoint),
        ];
    }

    public static function normalizeRoutePrefix(string $value): string
    {
        if (
            !str_starts_with($value, '/')
            || !preg_match('/\A\/[A-Za-z0-9._~-]+(?:\/[A-Za-z0-9._~-]+)*\/?\z/', $value)
            || str_contains($value, '?')
            || str_contains($value, '#')
            || str_contains($value, '//')
            || str_contains($value, '\\')
        ) {
            throw new InvalidArgumentException('A Studio endpoint must be one normalized same-origin pathname.');
        }
        foreach (explode('/', trim($value, '/')) as $segment) {
            if ($segment === '.' || $segment === '..') {
                throw new InvalidArgumentException('A Studio endpoint must not contain dot segments.');
            }
        }
        $normalized = str_ends_with($value, '/') ? substr($value, 0, -1) : $value;
        if ($normalized === '') {
            throw new InvalidArgumentException('A Studio endpoint must not be the site root.');
        }

        return $normalized;
    }
}
