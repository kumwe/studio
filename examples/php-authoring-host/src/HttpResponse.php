<?php

declare(strict_types=1);

namespace Kumwe\Studio\PhpAuthoringHost;

use JsonException;
use LogicException;

final class HttpResponse
{
    /** @param array<string, string> $headers */
    private function __construct(
        public readonly int $status,
        public readonly array $headers,
        public readonly string $body,
    ) {
    }

    public static function json(int $status, mixed $value): self
    {
        try {
            $body = json_encode(
                $value,
                JSON_THROW_ON_ERROR | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE,
            );
        } catch (JsonException) {
            return self::emergencyInternal();
        }

        return new self($status, self::jsonHeaders(), $body);
    }

    public static function emergencyInternal(): self
    {
        return new self(
            500,
            self::jsonHeaders(),
            '{"contractVersion":"0.1-draft","kind":"host-error","category":"internal",'
                . '"correlationId":"php-authoring/emergency","message":{"key":"studio.php/http-internal",'
                . '"defaultMessage":"The host could not complete the Studio operation."},"retryable":false}',
        );
    }

    public function withHeader(string $name, string $value): self
    {
        if (!preg_match("/\\A[!#$%&'*+.^_`|~0-9A-Za-z-]+\\z/", $name) || preg_match('/[\r\n]/', $value)) {
            throw new LogicException('Invalid HTTP response header.');
        }

        return new self($this->status, [...$this->headers, $name => $value], $this->body);
    }

    public function emit(): never
    {
        http_response_code($this->status);
        foreach ($this->headers as $name => $value) {
            header($name . ': ' . $value, true);
        }
        echo $this->body;
        exit;
    }

    /** @return array<string, string> */
    private static function jsonHeaders(): array
    {
        return [
            'Cache-Control' => 'no-store',
            'Content-Type' => 'application/json; charset=utf-8',
            'X-Content-Type-Options' => 'nosniff',
        ];
    }
}
