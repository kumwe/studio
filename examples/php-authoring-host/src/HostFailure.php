<?php

declare(strict_types=1);

namespace Kumwe\Studio\PhpAuthoringHost;

use InvalidArgumentException;
use RuntimeException;
use stdClass;

/** A safe host-authored failure that can cross the Studio transport boundary. */
final class HostFailure extends RuntimeException
{
    public const CONTRACT_VERSION = '0.1-draft';

    private const STATUS_BY_CATEGORY = [
        'invalid-request' => 400,
        'unauthenticated' => 401,
        'forbidden' => 403,
        'not-found' => 404,
        'conflict' => 409,
        'validation-failed' => 422,
        'incompatible' => 400,
        'limit-exceeded' => 413,
        'rate-limited' => 429,
        'unavailable' => 503,
        'cancelled' => 400,
        'internal' => 500,
    ];

    public function __construct(
        public readonly string $category,
        public readonly string $messageKey,
        public readonly string $defaultMessage,
        public readonly bool $retryable = false,
        public readonly ?int $retryAfterMilliseconds = null,
        public readonly ?string $revision = null,
    ) {
        if (!array_key_exists($category, self::STATUS_BY_CATEGORY)) {
            throw new InvalidArgumentException('Unknown Studio host-error category.');
        }
        if (!preg_match(
            '/\A[a-z][a-z0-9]*(?:[.-][a-z0-9]+)*\/[a-z][a-z0-9]*(?:[.-][a-z0-9]+)*\z/',
            $messageKey,
        ) || strlen($messageKey) > 160) {
            throw new InvalidArgumentException('messageKey must be a Studio qualified name.');
        }
        if ($defaultMessage === '' || strlen($defaultMessage) > 500) {
            throw new InvalidArgumentException('defaultMessage must contain 1 to 500 bytes.');
        }
        if (
            $retryAfterMilliseconds !== null
            && ($retryAfterMilliseconds < 0 || $retryAfterMilliseconds > 86_400_000)
        ) {
            throw new InvalidArgumentException('retryAfterMilliseconds is outside the contract range.');
        }
        if (
            $retryAfterMilliseconds !== null
            && (!$retryable || !in_array($category, ['rate-limited', 'unavailable'], true))
        ) {
            throw new InvalidArgumentException(
                'retryAfterMilliseconds is allowed only for retryable rate-limited or unavailable failures.',
            );
        }
        if ($revision !== null && ($revision === '' || strlen($revision) > 200)) {
            throw new InvalidArgumentException('revision is outside the contract range.');
        }
        if ($revision !== null && $category !== 'conflict') {
            throw new InvalidArgumentException('A safe current revision is allowed only on a conflict.');
        }

        parent::__construct($defaultMessage);
    }

    public static function internal(): self
    {
        return new self(
            'internal',
            'studio.php/host-failure',
            'The host could not complete the Studio operation.',
        );
    }

    public function status(): int
    {
        return self::STATUS_BY_CATEGORY[$this->category];
    }

    public function document(string $correlationId): stdClass
    {
        if (
            strlen($correlationId) > 240
            || !preg_match('/\A[A-Za-z0-9][A-Za-z0-9._:\/-]*\z/', $correlationId)
            || in_array($correlationId, ['__proto__', 'prototype', 'constructor'], true)
        ) {
            throw new InvalidArgumentException('correlationId must be a Studio stable identifier.');
        }

        $document = (object) [
            'contractVersion' => self::CONTRACT_VERSION,
            'kind' => 'host-error',
            'category' => $this->category,
            'correlationId' => $correlationId,
            'message' => (object) [
                'key' => $this->messageKey,
                'defaultMessage' => $this->defaultMessage,
            ],
            'retryable' => $this->retryable,
        ];
        if ($this->retryAfterMilliseconds !== null) {
            $document->retryAfterMilliseconds = $this->retryAfterMilliseconds;
        }
        if ($this->revision !== null) {
            $document->revision = $this->revision;
        }

        return $document;
    }
}
