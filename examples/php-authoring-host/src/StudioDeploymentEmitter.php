<?php

declare(strict_types=1);

namespace Kumwe\Studio\PhpAuthoringHost;

use Closure;
use DateTimeImmutable;
use InvalidArgumentException;
use JsonException;
use RuntimeException;
use stdClass;
use Throwable;

/**
 * Emits one inert, schema-validated Studio deployment document beside its
 * declared mount. The browser bootstrap reads textContent through its strict,
 * duplicate-rejecting bounded JSON parser; no executable configuration or
 * inline JavaScript is generated.
 */
final class StudioDeploymentEmitter
{
    public const SCHEMA_ID = 'https://schemas.kumwe.org/studio/v1/studio-deployment.schema.json';
    /** Shared browser/PHP ceiling for 5,000 block locks plus 500 contributions. */
    public const MAXIMUM_JSON_BYTES = 2_097_152;
    public const MAXIMUM_JSON_DEPTH = 16;
    public const MAXIMUM_TOKEN_LIFETIME_MILLISECONDS = 15 * 60 * 1000;

    /** @var Closure(): int */
    private readonly Closure $currentTimeMilliseconds;

    /** @param null|callable(): int $currentTimeMilliseconds */
    public function __construct(
        private readonly SchemaValidator $schemas,
        ?callable $currentTimeMilliseconds = null,
    ) {
        $this->currentTimeMilliseconds = Closure::fromCallable(
            $currentTimeMilliseconds ?? static fn (): int => (int) floor(microtime(true) * 1000),
        );
    }

    public function render(string $mountId, string $configurationElementId, stdClass $configuration): string
    {
        self::assertElementId($mountId, 'mountId');
        self::assertElementId($configurationElementId, 'configurationElementId');
        if ($mountId === $configurationElementId) {
            throw new InvalidArgumentException('The mount and configuration element IDs must be distinct.');
        }
        if (($configuration->mount ?? null) !== '#' . $mountId) {
            throw new InvalidArgumentException('The deployment mount must select the emitted target div.');
        }

        try {
            $valid = $this->schemas->validate(self::SCHEMA_ID, $configuration);
        } catch (Throwable $failure) {
            throw new RuntimeException('The Studio deployment schema could not be evaluated.', 0, $failure);
        }
        if (!$valid) {
            throw new InvalidArgumentException('The Studio deployment configuration is invalid.');
        }
        $currentTimeMilliseconds = ($this->currentTimeMilliseconds)();
        self::assertHostedInvariants($configuration, $currentTimeMilliseconds);

        try {
            $json = json_encode(
                $configuration,
                JSON_THROW_ON_ERROR
                    | JSON_HEX_TAG
                    | JSON_HEX_AMP
                    | JSON_HEX_APOS
                    | JSON_HEX_QUOT
                    | JSON_UNESCAPED_SLASHES
                    | JSON_UNESCAPED_UNICODE,
                self::MAXIMUM_JSON_DEPTH,
            );
        } catch (JsonException $failure) {
            throw new InvalidArgumentException('The Studio deployment configuration is not bounded JSON.', 0, $failure);
        }
        if (strlen($json) > self::MAXIMUM_JSON_BYTES) {
            throw new InvalidArgumentException('The Studio deployment configuration exceeds 2 MiB.');
        }

        $mount = self::attribute($mountId);
        $configurationId = self::attribute($configurationElementId);
        return '<div id="' . $mount . '" data-kumwe-studio="' . $configurationId . '"></div>'
            . "\n"
            . '<script id="' . $configurationId . '" type="application/json">'
            . $json
            . '</script>';
    }

    private static function assertElementId(string $value, string $parameter): void
    {
        if (!preg_match('/\A[A-Za-z][A-Za-z0-9_.:-]{0,127}\z/', $value)) {
            throw new InvalidArgumentException($parameter . ' must be a bounded HTML element ID.');
        }
    }

    /** Mirror the canonical cross-document invariants not expressible in JSON Schema. */
    private static function assertHostedInvariants(
        stdClass $configuration,
        int $currentTimeMilliseconds,
    ): void
    {
        $transport = $configuration->transport ?? null;
        if (!($transport instanceof stdClass) || ($transport->kind ?? null) !== 'http') {
            return;
        }
        $launch = $configuration->launch ?? null;
        $session = $configuration->session ?? null;
        if (!($launch instanceof stdClass) || !($session instanceof stdClass)) {
            throw new InvalidArgumentException('An HTTP deployment requires launch and session documents.');
        }
        self::assertAuthenticationLifetime($transport, $currentTimeMilliseconds);
        if (($launch->resourceContext ?? null) != ($session->resourceContext ?? null)) {
            throw new InvalidArgumentException('Launch and session resource contexts must be identical.');
        }
        if (
            property_exists($configuration, 'contractVersion')
            && ($configuration->contractVersion ?? null) !== ($session->contractVersion ?? null)
        ) {
            throw new InvalidArgumentException('Deployment and session contract versions must match.');
        }

        $advertisedRoutes = [];
        $ports = $session->hostCapabilities->ports ?? null;
        if (is_array($ports)) {
            foreach ($ports as $port) {
                if (!($port instanceof stdClass) || !is_array($port->operations ?? null)) {
                    continue;
                }
                foreach ($port->operations as $capability) {
                    $route = is_string($capability) ? self::routeFromCapability($capability) : null;
                    if ($route !== null) {
                        $advertisedRoutes[$route] = true;
                    }
                }
            }
        }
        if (
            !isset($advertisedRoutes['authoring/resolve-target'])
            || !isset($advertisedRoutes['authoring/start'])
        ) {
            throw new InvalidArgumentException('A hosted session must advertise resolve-target and start.');
        }

        $routing = $transport->routing ?? null;
        if (!($routing instanceof stdClass) || ($routing->kind ?? null) !== 'operation-map') {
            return;
        }
        $endpoints = $routing->endpoints ?? null;
        if (!($endpoints instanceof stdClass)) {
            throw new InvalidArgumentException('Operation-map routing requires an endpoint object.');
        }
        $configuredRoutes = array_fill_keys(array_keys(get_object_vars($endpoints)), true);
        ksort($configuredRoutes, SORT_STRING);
        ksort($advertisedRoutes, SORT_STRING);
        if ($configuredRoutes !== $advertisedRoutes) {
            throw new InvalidArgumentException('Configured endpoints must exactly match advertised host operations.');
        }
    }

    private static function assertAuthenticationLifetime(
        stdClass $transport,
        int $currentTimeMilliseconds,
    ): void {
        $authentication = $transport->authentication ?? null;
        if (!($authentication instanceof stdClass)) {
            throw new InvalidArgumentException('An HTTP deployment requires authentication configuration.');
        }
        $kind = $authentication->kind ?? null;
        if ($kind === 'same-origin-session') {
            return;
        }
        if ($kind !== 'bearer-token' && $kind !== 'header-token') {
            throw new InvalidArgumentException('The HTTP authentication profile is not supported.');
        }
        $issuedAt = self::parseRfc3339Instant($authentication->issuedAt ?? null);
        $expiresAt = self::parseRfc3339Instant($authentication->expiresAt ?? null);
        if (
            $issuedAt === null
            || $expiresAt === null
            || !self::isPositiveBoundedLifetime($issuedAt, $expiresAt)
            || self::compareInstantToMilliseconds($issuedAt, $currentTimeMilliseconds) > 0
            || self::compareInstantToMilliseconds($expiresAt, $currentTimeMilliseconds) <= 0
        ) {
            throw new InvalidArgumentException(
                'Token authentication requires a current issuedAt/expiresAt window of at most 15 minutes.',
            );
        }
    }

    /** @return null|array{milliseconds: int, nanosecondRemainder: int} */
    private static function parseRfc3339Instant(mixed $value): ?array
    {
        if (!is_string($value) || strlen($value) > 40) {
            return null;
        }
        $matched = preg_match(
            '/\A([0-9]{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12][0-9]|3[01])T'
                . '(?:[01][0-9]|2[0-3]):[0-5][0-9]:(?:[0-5][0-9]|60))'
                . '(?:\.([0-9]{1,9}))?(Z|[+-](?:[01][0-9]|2[0-3]):[0-5][0-9])\z/',
            $value,
            $parts,
        );
        if ($matched !== 1) {
            return null;
        }
        $fractionNanoseconds = str_pad($parts[2] ?? '', 9, '0');
        $fractionMicroseconds = substr($fractionNanoseconds, 0, 6);
        $instant = DateTimeImmutable::createFromFormat(
            '!Y-m-d\TH:i:s.uP',
            $parts[1] . '.' . $fractionMicroseconds . $parts[3],
        );
        $errors = DateTimeImmutable::getLastErrors();
        if (
            $instant === false
            || (is_array($errors) && ($errors['warning_count'] > 0 || $errors['error_count'] > 0))
        ) {
            return null;
        }

        return [
            'milliseconds' => ((int) $instant->format('U') * 1000)
                + intdiv((int) $instant->format('u'), 1000),
            'nanosecondRemainder' => ((int) $fractionNanoseconds) % 1_000_000,
        ];
    }

    /** @param array{milliseconds: int, nanosecondRemainder: int} $instant */
    private static function compareInstantToMilliseconds(array $instant, int $milliseconds): int
    {
        return $instant['milliseconds'] === $milliseconds
            ? $instant['nanosecondRemainder'] <=> 0
            : $instant['milliseconds'] <=> $milliseconds;
    }

    /**
     * @param array{milliseconds: int, nanosecondRemainder: int} $issuedAt
     * @param array{milliseconds: int, nanosecondRemainder: int} $expiresAt
     */
    private static function isPositiveBoundedLifetime(array $issuedAt, array $expiresAt): bool
    {
        $wholeMilliseconds = $expiresAt['milliseconds'] - $issuedAt['milliseconds'];
        $remainder = $expiresAt['nanosecondRemainder'] - $issuedAt['nanosecondRemainder'];
        $positive = $wholeMilliseconds > 0 || ($wholeMilliseconds === 0 && $remainder > 0);
        $bounded = $wholeMilliseconds < self::MAXIMUM_TOKEN_LIFETIME_MILLISECONDS
            || (
                $wholeMilliseconds === self::MAXIMUM_TOKEN_LIFETIME_MILLISECONDS
                && $remainder <= 0
            );

        return $positive && $bounded;
    }

    private static function routeFromCapability(string $capability): ?string
    {
        $prefix = 'studio.operation/';
        if (!str_starts_with($capability, $prefix)) {
            return null;
        }
        $operation = substr($capability, strlen($prefix));
        $separator = strpos($operation, '.');
        if ($separator === false || $separator === 0 || $separator === strlen($operation) - 1) {
            return null;
        }

        return substr($operation, 0, $separator) . '/' . substr($operation, $separator + 1);
    }

    private static function attribute(string $value): string
    {
        return htmlspecialchars($value, ENT_QUOTES | ENT_SUBSTITUTE | ENT_HTML5, 'UTF-8');
    }
}
