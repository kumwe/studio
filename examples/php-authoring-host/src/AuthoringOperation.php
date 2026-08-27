<?php

declare(strict_types=1);

namespace Kumwe\Studio\PhpAuthoringHost;

final class AuthoringOperation
{
    public const SCHEMA_ID = 'https://schemas.kumwe.org/studio/v1/authoring-http.schema.json';

    public function __construct(
        public readonly string $route,
        public readonly string $capability,
        public readonly string $definition,
        public readonly string $argumentKey,
        public readonly bool $mutating,
        public readonly bool $idempotencyRequired,
        public readonly bool $carriesResourceContext,
    ) {
    }

    public function requestSchema(): string
    {
        return self::SCHEMA_ID . '#/$defs/' . $this->definition . 'Request';
    }

    public function resultSchema(): string
    {
        return self::SCHEMA_ID . '#/$defs/' . $this->definition . 'Result';
    }
}
