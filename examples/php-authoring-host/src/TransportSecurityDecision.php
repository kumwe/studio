<?php

declare(strict_types=1);

namespace Kumwe\Studio\PhpAuthoringHost;

use LogicException;

final class TransportSecurityDecision
{
    private const ALLOWED = 'allowed';
    private const UNAUTHENTICATED = 'unauthenticated';
    private const FORBIDDEN = 'forbidden';

    private function __construct(
        private readonly string $state,
        private readonly ?object $principal,
    ) {
    }

    /** The principal is trusted transport state and is never read from JSON. */
    public static function allowed(object $principal): self
    {
        return new self(self::ALLOWED, $principal);
    }

    public static function unauthenticated(): self
    {
        return new self(self::UNAUTHENTICATED, null);
    }

    public static function forbidden(): self
    {
        return new self(self::FORBIDDEN, null);
    }

    public function isAllowed(): bool
    {
        return $this->state === self::ALLOWED;
    }

    public function isUnauthenticated(): bool
    {
        return $this->state === self::UNAUTHENTICATED;
    }

    public function principal(): object
    {
        if (!$this->isAllowed() || $this->principal === null) {
            throw new LogicException('A rejected request has no authenticated principal.');
        }

        return $this->principal;
    }
}
