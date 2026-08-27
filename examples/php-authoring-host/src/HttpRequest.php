<?php

declare(strict_types=1);

namespace Kumwe\Studio\PhpAuthoringHost;

use InvalidArgumentException;
use RuntimeException;

final class HttpRequest
{
    /** @param array<string, string> $headers */
    public function __construct(
        public readonly string $method,
        public readonly string $path,
        public readonly array $headers,
        public readonly string $body,
        public readonly bool $bodyTooLarge = false,
    ) {
        foreach ($headers as $name => $value) {
            if (!is_string($name) || !is_string($value)) {
                throw new InvalidArgumentException('HTTP request headers must contain string names and values.');
            }
        }
    }

    /**
     * Bounded adapter for a traditional PHP front controller.
     *
     * Framework integrations should construct HttpRequest from their native
     * request object so the framework/web server's duplicate-header rejection,
     * proxy trust, and request limits remain authoritative.
     *
     * @param array<string, mixed>|null $server
     */
    public static function fromGlobals(int $maximumBodyBytes, ?array $server = null): self
    {
        if ($maximumBodyBytes <= 0 || $maximumBodyBytes >= PHP_INT_MAX) {
            throw new InvalidArgumentException('maximumBodyBytes must be a positive bounded integer.');
        }

        $server ??= $_SERVER;
        $stream = fopen('php://input', 'rb');
        if ($stream === false) {
            throw new RuntimeException('The request body stream is unavailable.');
        }

        try {
            $body = stream_get_contents($stream, $maximumBodyBytes + 1);
        } finally {
            fclose($stream);
        }
        if (!is_string($body)) {
            throw new RuntimeException('The request body could not be read.');
        }

        $declaredLength = $server['CONTENT_LENGTH'] ?? null;
        $declaredTooLarge = is_scalar($declaredLength)
            && preg_match('/\A[0-9]+\z/', (string) $declaredLength) === 1
            && (int) $declaredLength > $maximumBodyBytes;

        return new self(
            is_string($server['REQUEST_METHOD'] ?? null) ? $server['REQUEST_METHOD'] : '',
            is_string($server['REQUEST_URI'] ?? null) ? $server['REQUEST_URI'] : '/',
            self::headersFromServer($server),
            $body,
            $declaredTooLarge || strlen($body) > $maximumBodyBytes,
        );
    }

    /** @param array<string, mixed> $server @return array<string, string> */
    private static function headersFromServer(array $server): array
    {
        $headers = [];
        foreach ($server as $name => $value) {
            if (!is_string($name) || !is_string($value)) {
                continue;
            }
            if (str_starts_with($name, 'HTTP_')) {
                $headers[str_replace('_', '-', substr($name, 5))] = $value;
            }
        }
        if (is_string($server['CONTENT_TYPE'] ?? null)) {
            $headers['CONTENT-TYPE'] = $server['CONTENT_TYPE'];
        }
        if (is_string($server['CONTENT_LENGTH'] ?? null)) {
            $headers['CONTENT-LENGTH'] = $server['CONTENT_LENGTH'];
        }

        return $headers;
    }
}
