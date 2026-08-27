<?php

declare(strict_types=1);

namespace Kumwe\Studio\PhpAuthoringHost;

use InvalidArgumentException;
use JsonException;
use stdClass;
use Throwable;

/**
 * Framework-neutral responder for the seven canonical contextual authoring
 * routes. It deliberately owns no persistence, workflow, rendering, webhook,
 * media, or business policy.
 */
final class AuthoringResponder
{
    public const WIRE_PROTOCOL_VERSION = '0.1.0-draft.2';
    public const DEFAULT_MAXIMUM_REQUEST_BYTES = 67_108_864;
    private const HOST_ERROR_SCHEMA = 'https://schemas.kumwe.org/studio/v1/host-error.schema.json';

    private readonly FailureMapper $failureMapper;
    private readonly CorrelationIdFactory $correlationIds;
    private readonly string $routePrefix;
    /** @var array<string, true> */
    private readonly array $supportedProtocolVersions;
    private int $fallbackCorrelationSerial = 0;

    /**
     * @param list<string> $supportedProtocolVersions
     */
    public function __construct(
        private readonly AuthoringApplicationService $application,
        private readonly SchemaValidator $schemas,
        private readonly TransportSecurityVerifier $security,
        ?FailureMapper $failureMapper = null,
        ?CorrelationIdFactory $correlationIds = null,
        string $routePrefix = '/ports',
        private readonly int $maximumRequestBytes = self::DEFAULT_MAXIMUM_REQUEST_BYTES,
        private readonly int $maximumJsonDepth = 128,
        array $supportedProtocolVersions = [self::WIRE_PROTOCOL_VERSION],
    ) {
        if ($maximumRequestBytes <= 0 || $maximumRequestBytes >= PHP_INT_MAX) {
            throw new InvalidArgumentException('maximumRequestBytes must be a positive bounded integer.');
        }
        if ($maximumJsonDepth < 2 || $maximumJsonDepth > 512) {
            throw new InvalidArgumentException('maximumJsonDepth must be between 2 and 512.');
        }

        $this->routePrefix = self::normalizeRoutePrefix($routePrefix);
        $versions = [];
        foreach ($supportedProtocolVersions as $version) {
            if (!is_string($version) || $version === '') {
                throw new InvalidArgumentException('supportedProtocolVersions must contain non-empty strings.');
            }
            $versions[$version] = true;
        }
        if ($versions === []) {
            throw new InvalidArgumentException('At least one wire protocol version must be supported.');
        }
        $this->supportedProtocolVersions = $versions;
        $this->failureMapper = $failureMapper ?? new DefaultFailureMapper();
        $this->correlationIds = $correlationIds ?? new RandomCorrelationIdFactory();
    }

    public function maximumRequestBytes(): int
    {
        return $this->maximumRequestBytes;
    }

    public function respond(HttpRequest $request): HttpResponse
    {
        $operation = $this->operationForPath($request->path);
        if ($operation === null) {
            return $this->failure(new HostFailure(
                'not-found',
                'studio.php/http-route-not-found',
                'The requested Studio host operation is unavailable.',
            ));
        }
        if ($request->method !== 'POST') {
            return $this->failure(new HostFailure(
                'invalid-request',
                'studio.php/http-method-invalid',
                'Studio host operations require POST.',
            ))->withHeader('Allow', 'POST');
        }
        if (!$this->hasJsonContentType($request->headers)) {
            return $this->failure(new HostFailure(
                'invalid-request',
                'studio.php/http-content-type-invalid',
                'Studio host operations require an application/json content type.',
            ));
        }
        if ($request->bodyTooLarge || strlen($request->body) > $this->maximumRequestBytes) {
            return $this->failure(new HostFailure(
                'limit-exceeded',
                'studio.php/http-request-too-large',
                'The Studio host request exceeds the configured transport limit.',
            ));
        }

        try {
            $decision = $this->security->verify(new TransportSecurityInput(
                'POST',
                $request->path,
                $request->headers,
                $operation->route,
                $operation->capability,
                $operation->mutating,
            ));
        } catch (Throwable) {
            return $this->failure(new HostFailure(
                'internal',
                'studio.php/http-security-check-failed',
                'The host could not verify request security.',
            ));
        }
        if ($decision->isUnauthenticated()) {
            return $this->failure(new HostFailure(
                'unauthenticated',
                'studio.php/http-unauthenticated',
                'Authentication is required for Studio authoring.',
            ));
        }
        if (!$decision->isAllowed()) {
            return $this->failure(new HostFailure(
                'forbidden',
                'studio.php/http-request-integrity-failed',
                'The Studio authoring request failed request-integrity verification.',
            ));
        }

        try {
            $wire = json_decode($request->body, false, $this->maximumJsonDepth, JSON_THROW_ON_ERROR);
        } catch (JsonException) {
            return $this->invalidRequest(
                'studio.php/http-request-malformed',
                'The Studio host request body is not valid JSON.',
            );
        }

        try {
            $valid = $this->schemas->validate($operation->requestSchema(), $wire);
        } catch (Throwable) {
            return $this->failure(new HostFailure(
                'internal',
                'studio.php/http-schema-validator-failed',
                'The host could not validate the Studio request.',
            ));
        }
        if (!$valid || !$this->isStructurallyValidWireRequest($wire, $operation)) {
            return $this->invalidRequest(
                'studio.php/http-request-invalid',
                'The Studio host request does not match the operation contract.',
            );
        }

        /** @var stdClass $wire */
        if (!array_key_exists($wire->context->protocolVersion, $this->supportedProtocolVersions)) {
            return $this->failure(new HostFailure(
                'incompatible',
                'studio.php/http-protocol-incompatible',
                'The negotiated Studio wire protocol is not supported.',
            ));
        }
        if (!$this->resourceContextMatches($wire, $operation)) {
            return $this->invalidRequest(
                'studio.php/http-resource-context-mismatch',
                'The operation resource context does not match the request envelope.',
            );
        }

        $context = new AuthoringCallContext($operation, $decision->principal(), $wire->context);
        try {
            $value = $this->dispatch($operation, $wire->arguments->{$operation->argumentKey}, $context);
        } catch (Throwable $failure) {
            try {
                return $this->failure($this->failureMapper->map($failure));
            } catch (Throwable) {
                return $this->failure(HostFailure::internal());
            }
        }

        $result = (object) ['value' => $value];
        try {
            $valid = $this->schemas->validate($operation->resultSchema(), $result);
        } catch (Throwable) {
            $valid = false;
        }
        if (!$valid) {
            return $this->failure(new HostFailure(
                'internal',
                'studio.php/http-response-invalid',
                'The host produced an invalid Studio operation result.',
            ));
        }

        return HttpResponse::json(200, $result);
    }

    private function operationForPath(string $path): ?AuthoringOperation
    {
        if (
            !str_starts_with($path, $this->routePrefix . '/')
            || str_contains($path, '?')
            || str_contains($path, '#')
        ) {
            return null;
        }

        return AuthoringOperationRegistry::find(substr($path, strlen($this->routePrefix) + 1));
    }

    /** @param array<string, string> $headers */
    private function hasJsonContentType(array $headers): bool
    {
        $values = [];
        foreach ($headers as $name => $value) {
            if (strtolower($name) === 'content-type') {
                $values[] = $value;
            }
        }
        if (count($values) !== 1) {
            return false;
        }

        return strtolower(trim(explode(';', $values[0], 2)[0])) === 'application/json';
    }

    private function isStructurallyValidWireRequest(
        mixed $wire,
        AuthoringOperation $operation,
    ): bool {
        if (!($wire instanceof stdClass) || !(($wire->arguments ?? null) instanceof stdClass)) {
            return false;
        }
        if (!(($wire->context ?? null) instanceof stdClass)) {
            return false;
        }
        if (!property_exists($wire->arguments, $operation->argumentKey)) {
            return false;
        }
        $argument = $wire->arguments->{$operation->argumentKey};
        if (!($argument instanceof stdClass)) {
            return false;
        }
        $context = $wire->context;
        foreach (
            ['operationId', 'protocolVersion', 'requestId', 'resourceContextKey', 'sessionGeneration']
            as $member
        ) {
            if (!property_exists($context, $member) || !is_string($context->{$member}) || $context->{$member} === '') {
                return false;
            }
        }
        if ($context->operationId !== $operation->capability) {
            return false;
        }
        if (property_exists($context, 'expectedRevision')) {
            return false;
        }
        $hasIdempotency = property_exists($context, 'idempotencyKey');
        if ($operation->idempotencyRequired !== $hasIdempotency) {
            return false;
        }
        if ($hasIdempotency && (!is_string($context->idempotencyKey) || $context->idempotencyKey === '')) {
            return false;
        }

        return true;
    }

    private function resourceContextMatches(stdClass $wire, AuthoringOperation $operation): bool
    {
        if (!$operation->carriesResourceContext) {
            return true;
        }

        $argument = $wire->arguments->{$operation->argumentKey};
        $resourceContext = $argument->resourceContext ?? null;
        return $resourceContext instanceof stdClass
            && is_string($resourceContext->key ?? null)
            && $resourceContext->key === $wire->context->resourceContextKey;
    }

    private function dispatch(
        AuthoringOperation $operation,
        stdClass $argument,
        AuthoringCallContext $context,
    ): mixed {
        return match ($operation->route) {
            'authoring/resolve-target' => $this->application->resolveTarget($argument, $context),
            'authoring/list-types' => $this->application->listTypes($argument, $context),
            'authoring/start' => $this->application->start($argument, $context),
            'authoring/plan-save' => $this->application->planSave($argument, $context),
            'authoring/save-item' => $this->application->saveItem($argument, $context),
            'authoring/save-new-type-version' => $this->application->saveNewTypeVersion($argument, $context),
            'authoring/save-as-new-type' => $this->application->saveAsNewType($argument, $context),
        };
    }

    private function invalidRequest(string $key, string $message): HttpResponse
    {
        return $this->failure(new HostFailure('invalid-request', $key, $message));
    }

    private function failure(HostFailure $failure): HttpResponse
    {
        $document = $failure->document($this->nextCorrelationId());
        try {
            if (!$this->schemas->validate(self::HOST_ERROR_SCHEMA, $document)) {
                return HttpResponse::emergencyInternal();
            }
        } catch (Throwable) {
            return HttpResponse::emergencyInternal();
        }

        return HttpResponse::json($failure->status(), $document);
    }

    private function nextCorrelationId(): string
    {
        try {
            $value = $this->correlationIds->next();
            if (preg_match('/\A[A-Za-z0-9][A-Za-z0-9._:\/-]{0,239}\z/', $value)) {
                return $value;
            }
        } catch (Throwable) {
            // Fall through to a process-local, non-sensitive identifier.
        }

        $this->fallbackCorrelationSerial++;
        return 'php-authoring/fallback-' . $this->fallbackCorrelationSerial;
    }

    private static function normalizeRoutePrefix(string $value): string
    {
        if (
            !str_starts_with($value, '/')
            || str_contains($value, '?')
            || str_contains($value, '#')
            || str_contains($value, '//')
        ) {
            throw new InvalidArgumentException('routePrefix must be one normalized absolute pathname.');
        }
        $normalized = str_ends_with($value, '/') ? substr($value, 0, -1) : $value;
        if ($normalized === '') {
            throw new InvalidArgumentException('routePrefix must not be the root pathname.');
        }

        return $normalized;
    }
}
