<?php

declare(strict_types=1);

namespace Kumwe\Studio\PhpAuthoringHost;

use LogicException;
use stdClass;

final class AuthoringCallContext
{
    public function __construct(
        public readonly AuthoringOperation $operation,
        public readonly object $principal,
        private readonly stdClass $requestContext,
    ) {
    }

    /** The exact validated Studio request context; it is not authentication evidence. */
    public function requestContext(): stdClass
    {
        return $this->requestContext;
    }

    public function requestId(): string
    {
        return $this->requestContext->requestId;
    }

    public function resourceContextKey(): string
    {
        return $this->requestContext->resourceContextKey;
    }

    public function sessionGeneration(): string
    {
        return $this->requestContext->sessionGeneration;
    }

    public function idempotencyKey(): ?string
    {
        return property_exists($this->requestContext, 'idempotencyKey')
            ? $this->requestContext->idempotencyKey
            : null;
    }

    /**
     * Convenience for authoritative start/save implementations.
     *
     * The service must scope this value to actor/context/operation and bind it
     * to a canonical intent digest inside the same transaction as persistence,
     * audit, and outbox work. A responder-level cache is not sufficient.
     */
    public function requireIdempotencyKey(): string
    {
        $key = $this->idempotencyKey();
        if (!is_string($key) || $key === '') {
            throw new LogicException('This authoring operation requires an idempotency key.');
        }

        return $key;
    }
}
