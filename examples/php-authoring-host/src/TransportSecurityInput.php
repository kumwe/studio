<?php

declare(strict_types=1);

namespace Kumwe\Studio\PhpAuthoringHost;

final class TransportSecurityInput
{
    /**
     * @param array<string, string> $headers
     *
     * The body is intentionally absent. Authentication and cookie-backed
     * CSRF/origin checks must complete before the responder parses JSON.
     */
    public function __construct(
        public readonly string $method,
        public readonly string $path,
        public readonly array $headers,
        public readonly string $route,
        public readonly string $capability,
        public readonly bool $mutating,
    ) {
    }
}
