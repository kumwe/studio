<?php

declare(strict_types=1);

namespace Kumwe\Studio\PhpAuthoringHost;

use Closure;
use InvalidArgumentException;

/**
 * Optional non-ambient authentication example for short-lived bearer or
 * custom-header tokens. The callback must verify signature/entropy, issuance,
 * expiry, a maximum 15-minute lifetime, audience, purpose, session generation,
 * revocation, and resource scope. Browser deployment timestamps are not proof.
 */
final class ShortLivedTokenVerifier implements TransportSecurityVerifier
{
    /** @var Closure(string, TransportSecurityInput): ?object */
    private readonly Closure $authenticateToken;

    /**
     * @param callable(string, TransportSecurityInput): ?object $authenticateToken
     */
    private function __construct(
        callable $authenticateToken,
        private readonly string $headerName,
        private readonly ?string $scheme,
    ) {
        if (!preg_match("/\\A[!#$%&'*+.^_`|~0-9A-Za-z-]+\\z/", $headerName)) {
            throw new InvalidArgumentException('headerName is not a valid HTTP field name.');
        }
        if ($scheme !== null && !preg_match('/\A[A-Za-z][A-Za-z0-9._~-]{0,31}\z/', $scheme)) {
            throw new InvalidArgumentException('scheme is not a bounded HTTP authentication scheme.');
        }
        $this->authenticateToken = Closure::fromCallable($authenticateToken);
    }

    /** @param callable(string, TransportSecurityInput): ?object $authenticateToken */
    public static function bearer(callable $authenticateToken): self
    {
        return new self($authenticateToken, 'Authorization', 'Bearer');
    }

    /** @param callable(string, TransportSecurityInput): ?object $authenticateToken */
    public static function header(callable $authenticateToken, string $headerName): self
    {
        AuthenticationHeaderPolicy::assertCustom($headerName);
        return new self($authenticateToken, $headerName, null);
    }

    public function verify(TransportSecurityInput $input): TransportSecurityDecision
    {
        $fieldValue = self::singleHeader($input->headers, $this->headerName);
        if ($fieldValue === null) {
            return TransportSecurityDecision::unauthenticated();
        }

        $token = $fieldValue;
        if ($this->scheme !== null) {
            $prefix = $this->scheme . ' ';
            if (!str_starts_with($fieldValue, $prefix)) {
                return TransportSecurityDecision::unauthenticated();
            }
            $token = substr($fieldValue, strlen($prefix));
        }
        if (
            $token === ''
            || strlen($token) > 8_192
            || trim($token) !== $token
            || preg_match('/[\x00-\x20\x7f]/', $token)
        ) {
            return TransportSecurityDecision::unauthenticated();
        }

        $principal = ($this->authenticateToken)($token, $input);
        return is_object($principal)
            ? TransportSecurityDecision::allowed($principal)
            : TransportSecurityDecision::unauthenticated();
    }

    /** @param array<string, string> $headers */
    private static function singleHeader(array $headers, string $expectedName): ?string
    {
        $value = null;
        foreach ($headers as $name => $candidate) {
            if (strcasecmp($name, $expectedName) !== 0) {
                continue;
            }
            if ($value !== null || preg_match('/[\r\n]/', $candidate)) {
                return null;
            }
            $value = $candidate;
        }

        return $value;
    }

}
