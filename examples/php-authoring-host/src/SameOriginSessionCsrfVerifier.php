<?php

declare(strict_types=1);

namespace Kumwe\Studio\PhpAuthoringHost;

use Closure;
use InvalidArgumentException;

/**
 * Reference request-integrity verifier for an existing host session.
 *
 * The session callback resolves the server-side session/HttpOnly cookie and
 * returns its trusted principal. The CSRF callback reads the current token
 * from that same server-side session. Both callbacks run for every request so
 * rotation and revocation are observed immediately.
 */
final class SameOriginSessionCsrfVerifier implements TransportSecurityVerifier
{
    /** @var Closure(TransportSecurityInput): ?object */
    private readonly Closure $authenticateSession;
    /** @var Closure(object, TransportSecurityInput): ?string */
    private readonly Closure $csrfTokenForSession;

    /**
     * @param callable(TransportSecurityInput): ?object $authenticateSession
     * @param callable(object, TransportSecurityInput): ?string $csrfTokenForSession
     */
    public function __construct(
        callable $authenticateSession,
        callable $csrfTokenForSession,
        private readonly string $allowedOrigin,
        private readonly string $csrfHeaderName = 'X-CSRF-Token',
        bool $allowHttpLoopbackForDevelopment = false,
    ) {
        self::assertAllowedOrigin($allowedOrigin, $allowHttpLoopbackForDevelopment);
        AuthenticationHeaderPolicy::assertCustom($csrfHeaderName);
        $this->authenticateSession = Closure::fromCallable($authenticateSession);
        $this->csrfTokenForSession = Closure::fromCallable($csrfTokenForSession);
    }

    public function verify(TransportSecurityInput $input): TransportSecurityDecision
    {
        $origin = self::singleHeader($input->headers, 'Origin');
        if ($origin !== $this->allowedOrigin) {
            return TransportSecurityDecision::forbidden();
        }

        // Fetch Metadata supplements Origin and CSRF. Absence is tolerated for
        // older user agents; any explicit non-same-origin value fails closed.
        $fetchSite = self::singleHeader($input->headers, 'Sec-Fetch-Site');
        if ($fetchSite === false || ($fetchSite !== null && $fetchSite !== 'same-origin')) {
            return TransportSecurityDecision::forbidden();
        }

        // Provenance is intentionally checked before touching a session or
        // any host authority callback. Cross-site traffic learns no identity
        // state and cannot trigger session-backed work.
        $principal = ($this->authenticateSession)($input);
        if (!is_object($principal)) {
            return TransportSecurityDecision::unauthenticated();
        }

        $expectedToken = ($this->csrfTokenForSession)($principal, $input);
        $suppliedToken = self::singleHeader($input->headers, $this->csrfHeaderName);
        if (
            !is_string($expectedToken)
            || $expectedToken === ''
            || strlen($expectedToken) > 4_096
            || !is_string($suppliedToken)
            || $suppliedToken === ''
            || strlen($suppliedToken) > 4_096
            || !hash_equals($expectedToken, $suppliedToken)
        ) {
            return TransportSecurityDecision::forbidden();
        }

        return TransportSecurityDecision::allowed($principal);
    }

    private static function assertAllowedOrigin(string $origin, bool $allowHttpLoopback): void
    {
        $parts = parse_url($origin);
        if (!is_array($parts)) {
            throw new InvalidArgumentException(
                'allowedOrigin must be one HTTPS origin, or an explicitly enabled HTTP loopback development origin.',
            );
        }
        $scheme = strtolower((string) ($parts['scheme'] ?? ''));
        $host = strtolower((string) ($parts['host'] ?? ''));
        $isExplicitDevelopmentLoopback = $allowHttpLoopback
            && $scheme === 'http'
            && in_array($host, ['localhost', '127.0.0.1', '[::1]'], true);
        if (
            strlen($origin) > 2_048
            || preg_match('/[\\x00-\\x20\\x7f\\\\]/', $origin) === 1
            || ($scheme !== 'https' && !$isExplicitDevelopmentLoopback)
            || $host === ''
            || array_intersect(['path', 'query', 'fragment', 'user', 'pass'], array_keys($parts)) !== []
        ) {
            throw new InvalidArgumentException(
                'allowedOrigin must be one HTTPS origin, or an explicitly enabled HTTP loopback development origin.',
            );
        }
    }

    /** @param array<string, string> $headers @return string|false|null false means ambiguous/invalid */
    private static function singleHeader(array $headers, string $expectedName): string|false|null
    {
        $value = null;
        foreach ($headers as $name => $candidate) {
            if (strcasecmp($name, $expectedName) !== 0) {
                continue;
            }
            if ($value !== null || preg_match('/[\r\n]/', $candidate)) {
                return false;
            }
            $value = $candidate;
        }

        return $value;
    }
}
