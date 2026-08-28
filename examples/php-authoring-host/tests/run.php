<?php

declare(strict_types=1);

use Kumwe\Studio\PhpAuthoringHost\AuthoringApplicationService;
use Kumwe\Studio\PhpAuthoringHost\AuthoringCallContext;
use Kumwe\Studio\PhpAuthoringHost\AuthoringEndpointConfiguration;
use Kumwe\Studio\PhpAuthoringHost\AuthoringOperation;
use Kumwe\Studio\PhpAuthoringHost\AuthoringOperationRegistry;
use Kumwe\Studio\PhpAuthoringHost\AuthoringResponder;
use Kumwe\Studio\PhpAuthoringHost\CorrelationIdFactory;
use Kumwe\Studio\PhpAuthoringHost\FailureMapper;
use Kumwe\Studio\PhpAuthoringHost\HostFailure;
use Kumwe\Studio\PhpAuthoringHost\HttpRequest;
use Kumwe\Studio\PhpAuthoringHost\HttpResponse;
use Kumwe\Studio\PhpAuthoringHost\SchemaValidator;
use Kumwe\Studio\PhpAuthoringHost\SameOriginSessionCsrfVerifier;
use Kumwe\Studio\PhpAuthoringHost\ShortLivedTokenVerifier;
use Kumwe\Studio\PhpAuthoringHost\StudioDeploymentEmitter;
use Kumwe\Studio\PhpAuthoringHost\TransportSecurityDecision;
use Kumwe\Studio\PhpAuthoringHost\TransportSecurityInput;
use Kumwe\Studio\PhpAuthoringHost\TransportSecurityVerifier;

require dirname(__DIR__) . '/src/autoload.php';

final class TestPrincipal
{
}

final class TestCorrelationIds implements CorrelationIdFactory
{
    private int $serial = 0;

    public function next(): string
    {
        $this->serial++;
        return 'tests/correlation-' . $this->serial;
    }
}

final class TestSchemas implements SchemaValidator
{
    /** @var list<string> */
    public array $references = [];
    public ?string $rejectReference = null;
    public ?string $throwReference = null;

    public function validate(string $schemaReference, mixed $value): bool
    {
        $this->references[] = $schemaReference;
        if ($schemaReference === $this->throwReference) {
            throw new RuntimeException('schema backend unavailable');
        }

        return $schemaReference !== $this->rejectReference;
    }
}

final class TestSecurity implements TransportSecurityVerifier
{
    public int $calls = 0;
    public bool $throw = false;
    public ?TransportSecurityInput $lastInput = null;

    public function __construct(public TransportSecurityDecision $decision)
    {
    }

    public function verify(TransportSecurityInput $input): TransportSecurityDecision
    {
        $this->calls++;
        $this->lastInput = $input;
        if ($this->throw) {
            throw new RuntimeException('security backend detail');
        }

        return $this->decision;
    }
}

final class TestApplication implements AuthoringApplicationService
{
    /** @var list<array{route: string, argument: stdClass, context: AuthoringCallContext}> */
    public array $calls = [];
    public ?Throwable $failure = null;

    public function resolveTarget(stdClass $request, AuthoringCallContext $context): mixed
    {
        return $this->record('authoring/resolve-target', $request, $context);
    }

    public function listTypes(stdClass $query, AuthoringCallContext $context): mixed
    {
        return $this->record('authoring/list-types', $query, $context);
    }

    public function start(stdClass $request, AuthoringCallContext $context): mixed
    {
        $context->requireIdempotencyKey();
        return $this->record('authoring/start', $request, $context);
    }

    public function planSave(stdClass $intent, AuthoringCallContext $context): mixed
    {
        return $this->record('authoring/plan-save', $intent, $context);
    }

    public function saveItem(stdClass $request, AuthoringCallContext $context): mixed
    {
        $context->requireIdempotencyKey();
        return $this->record('authoring/save-item', $request, $context);
    }

    public function saveNewTypeVersion(stdClass $request, AuthoringCallContext $context): mixed
    {
        $context->requireIdempotencyKey();
        return $this->record('authoring/save-new-type-version', $request, $context);
    }

    public function saveAsNewType(stdClass $request, AuthoringCallContext $context): mixed
    {
        $context->requireIdempotencyKey();
        return $this->record('authoring/save-as-new-type', $request, $context);
    }

    private function record(
        string $route,
        stdClass $argument,
        AuthoringCallContext $context,
    ): stdClass {
        if ($this->failure !== null) {
            $failure = $this->failure;
            $this->failure = null;
            throw $failure;
        }
        $this->calls[] = ['route' => $route, 'argument' => $argument, 'context' => $context];
        return (object) ['operation' => $route];
    }
}

final class ValidationFailureMapper implements FailureMapper
{
    public function map(Throwable $failure): HostFailure
    {
        return new HostFailure(
            'validation-failed',
            'studio.host/domain-validation',
            'The host rejected the submitted authoring value.',
        );
    }
}

/** @var array<string, Closure(): void> $tests */
$tests = [];

function test(string $name, Closure $body): void
{
    global $tests;
    $tests[$name] = $body;
}

function assertSameValue(mixed $expected, mixed $actual, string $message = ''): void
{
    if ($expected !== $actual) {
        throw new RuntimeException(
            ($message === '' ? 'Values are not identical.' : $message)
                . ' expected=' . var_export($expected, true)
                . ' actual=' . var_export($actual, true),
        );
    }
}

function assertTrueValue(bool $condition, string $message): void
{
    if (!$condition) {
        throw new RuntimeException($message);
    }
}

/** @param callable(): mixed $operation @param class-string<Throwable> $expectedClass */
function assertThrows(callable $operation, string $expectedClass): void
{
    try {
        $operation();
    } catch (Throwable $failure) {
        if ($failure instanceof $expectedClass) {
            return;
        }
        throw new RuntimeException(
            'Expected ' . $expectedClass . ', received ' . $failure::class . '.',
            0,
            $failure,
        );
    }
    throw new RuntimeException('Expected ' . $expectedClass . ' to be thrown.');
}

function jsonBody(HttpResponse $response): stdClass
{
    $value = json_decode($response->body, false, 128, JSON_THROW_ON_ERROR);
    if (!($value instanceof stdClass)) {
        throw new RuntimeException('Response body is not a JSON object.');
    }
    return $value;
}

function transportMatrix(): stdClass
{
    static $matrix;
    if ($matrix instanceof stdClass) {
        return $matrix;
    }
    $path = dirname(__DIR__, 3) . '/schemas/vectors/authoring-http/transport-matrix.json';
    $json = file_get_contents($path);
    if (!is_string($json)) {
        throw new RuntimeException('The canonical authoring HTTP transport matrix is unavailable.');
    }
    $decoded = json_decode($json, false, 128, JSON_THROW_ON_ERROR);
    if (!($decoded instanceof stdClass)) {
        throw new RuntimeException('The canonical authoring HTTP transport matrix is invalid.');
    }
    $matrix = $decoded;
    return $matrix;
}

/** @return array{0: AuthoringResponder, 1: TestApplication, 2: TestSchemas, 3: TestSecurity} */
function fixture(
    ?TransportSecurityDecision $decision = null,
    ?FailureMapper $failureMapper = null,
    int $maximumRequestBytes = AuthoringResponder::DEFAULT_MAXIMUM_REQUEST_BYTES,
): array {
    $application = new TestApplication();
    $schemas = new TestSchemas();
    $security = new TestSecurity($decision ?? TransportSecurityDecision::allowed(new TestPrincipal()));
    $responder = new AuthoringResponder(
        $application,
        $schemas,
        $security,
        $failureMapper,
        new TestCorrelationIds(),
        '/ports',
        $maximumRequestBytes,
    );
    return [$responder, $application, $schemas, $security];
}

function requestFor(AuthoringOperation $operation, ?callable $mutate = null): HttpRequest
{
    $argument = (object) ['marker' => $operation->route];
    if ($operation->carriesResourceContext) {
        $argument->resourceContext = (object) ['key' => 'contexts/article-42'];
    }
    $context = (object) [
        'operationId' => $operation->capability,
        'protocolVersion' => AuthoringResponder::WIRE_PROTOCOL_VERSION,
        'requestId' => 'requests/one',
        'resourceContextKey' => 'contexts/article-42',
        'sessionGeneration' => 'session-r1',
    ];
    if ($operation->idempotencyRequired) {
        $context->idempotencyKey = 'idempotency/one';
    }
    $wire = (object) [
        'arguments' => (object) [$operation->argumentKey => $argument],
        'context' => $context,
    ];
    if ($mutate !== null) {
        $mutate($wire);
    }

    return new HttpRequest(
        'POST',
        '/ports/' . $operation->route,
        ['Content-Type' => 'application/json', 'Accept' => 'application/json'],
        json_encode($wire, JSON_THROW_ON_ERROR | JSON_UNESCAPED_SLASHES),
    );
}

function deploymentConfiguration(string $mount = '#studio-a'): stdClass
{
    $resourceContext = (object) [
        'key' => 'contexts/article-42',
        'surface' => 'kumwe/administrator',
        'scopes' => [],
        'resource' => (object) ['type' => 'kumwe/article', 'id' => 'articles/42'],
    ];
    return (object) [
        'contractVersion' => '0.1-draft',
        'kind' => 'studio-deployment',
        'instanceId' => 'studio/article-42',
        'mount' => $mount,
        'launch' => (object) [
            'targetId' => 'kumwe/article-editor',
            'intent' => 'edit',
            'resourceContext' => $resourceContext,
            'start' => (object) ['kind' => 'existing'],
            'initialPresentation' => 'maximized',
        ],
        'session' => resolvedSessionConfiguration($resourceContext),
        'transport' => (object) [
            'kind' => 'http',
            'routing' => AuthoringEndpointConfiguration::operationMap(),
            'authentication' => (object) [
                'kind' => 'same-origin-session',
                'credentials' => 'same-origin',
                'csrf' => (object) [
                    'headerName' => 'X-CSRF-Token',
                    'token' => '<test-csrf-token>',
                ],
            ],
            'requestTimeoutMilliseconds' => 10_000,
            'maximumResponseBytes' => 8_388_608,
        ],
    ];
}

function resolvedSessionConfiguration(stdClass $resourceContext): stdClass
{
    $operations = array_map(
        static fn (AuthoringOperation $operation): string => $operation->capability,
        array_values(AuthoringOperationRegistry::all()),
    );
    return (object) [
        'contractVersion' => '0.1-draft',
        'protocolVersion' => AuthoringResponder::WIRE_PROTOCOL_VERSION,
        'sessionId' => 'sessions/article-42',
        'sessionGeneration' => 'session-r1',
        'mode' => 'content',
        'composite' => 'hybrid',
        'sessionState' => 'editable',
        'actor' => (object) ['id' => 'actors/editor-7', 'displayName' => 'Example editor'],
        'locale' => (object) [
            'requested' => 'en-GB',
            'resolved' => 'en-GB',
            'fallbacks' => ['en'],
            'direction' => 'ltr',
            'timeZone' => 'UTC',
        ],
        'displayPreferences' => (object) [
            'calendar' => 'gregory',
            'numberingSystem' => 'latn',
            'hourCycle' => 'h23',
            'measurementSystem' => 'metric',
        ],
        'resourceContext' => $resourceContext,
        'permissions' => ['studio.permission/authoring'],
        'artifacts' => (object) [],
        'blocks' => [],
        'plugins' => [],
        'hostCapabilities' => (object) [
            'contractVersion' => '0.1-draft',
            'kind' => 'host-capabilities',
            'host' => (object) [
                'id' => 'example/php-host',
                'version' => '1.0.0',
                'generation' => 'host-r1',
            ],
            'protocolVersions' => [AuthoringResponder::WIRE_PROTOCOL_VERSION],
            'ports' => [
                (object) [
                    'id' => 'studio.port/authoring',
                    'version' => '0.1.0',
                    'operations' => $operations,
                ],
            ],
            'capabilities' => [],
        ],
        'limits' => (object) [
            'maxNodes' => 10_000,
            'maxDepth' => 64,
            'maxSlotsPerNode' => 32,
            'maxChildrenPerSlot' => 1_000,
            'maxPropertyBytes' => 1_048_576,
            'maxExtensionBytes' => 1_048_576,
            'maxCommandBatch' => 1_000,
            'maxHistoryEntries' => 1_000,
            'maxRichTextBytes' => 1_048_576,
            'maxRichTextDepth' => 64,
            'maxPreviewRequestsPerMinute' => 120,
            'maxPreviewBytes' => 8_388_608,
            'maxMediaUploadBytes' => 67_108_864,
            'maxMediaBatch' => 100,
            'maxPluginCount' => 20,
            'maxContributionsPerPlugin' => 500,
            'maxLocaleBytes' => 1_048_576,
        ],
        'features' => (object) [
            'executablePlugins' => false,
            'customInspectors' => false,
            'externalMediaImport' => false,
            'clipboardMediaUpload' => false,
            'collaboration' => false,
            'offlineRecovery' => false,
        ],
        'preview' => (object) [
            'enabled' => false,
            'sameOriginRequired' => true,
            'allowApproximateRenderer' => false,
        ],
    ];
}

test('registry and error mapping replay the canonical transport matrix', function (): void {
    $matrix = transportMatrix();
    assertSameValue(HostFailure::CONTRACT_VERSION, $matrix->contractVersion);
    assertSameValue(7, count($matrix->operations));
    assertSameValue(7, count(AuthoringOperationRegistry::all()));
    foreach ($matrix->operations as $expected) {
        $operation = AuthoringOperationRegistry::find($expected->route);
        assertTrueValue($operation !== null, 'Canonical operation is missing: ' . $expected->route);
        assertSameValue($expected->capability, $operation->capability);
        assertSameValue($expected->argumentMember, $operation->argumentKey);
        assertSameValue($expected->requestSchema, $operation->requestSchema());
        assertSameValue($expected->responseSchema, $operation->resultSchema());
        assertSameValue($expected->mutating, $operation->mutating);
        assertSameValue($expected->idempotencyKey === 'required', $operation->idempotencyRequired);
        assertSameValue('forbidden', $expected->expectedRevision);
        assertSameValue($expected->resourceContextMatch, $operation->carriesResourceContext);
        assertSameValue(200, $expected->successStatus);
    }
    foreach ($matrix->errorMappings as $mapping) {
        $failure = new HostFailure(
            $mapping->category,
            'studio.tests/error-mapping',
            'Canonical error mapping test.',
        );
        assertSameValue($mapping->status, $failure->status(), $mapping->category);
    }
});

test('all seven routes dispatch and select exact request/result schemas', function (): void {
    [$responder, $application, $schemas, $security] = fixture();
    foreach (AuthoringOperationRegistry::all() as $operation) {
        $response = $responder->respond(requestFor($operation));
        assertSameValue(200, $response->status, $operation->route);
        $body = jsonBody($response);
        assertSameValue($operation->route, $body->value->operation);
        assertTrueValue(!property_exists($body, 'revision'), 'Contextual result must have no outer revision.');
        assertTrueValue(in_array($operation->requestSchema(), $schemas->references, true), 'Missing request schema.');
        assertTrueValue(in_array($operation->resultSchema(), $schemas->references, true), 'Missing result schema.');
    }
    assertSameValue(7, count($application->calls));
    assertSameValue(7, $security->calls);
    assertSameValue('idempotency/one', $application->calls[2]['context']->requireIdempotencyKey());
});

test('default endpoint helpers survive emission and round-trip through the responder', function (): void {
    $application = new TestApplication();
    $schemas = new TestSchemas();
    $configuration = deploymentConfiguration();
    $emitter = new StudioDeploymentEmitter($schemas);
    $html = $emitter->render('studio-a', 'studio-config-a', $configuration);
    $matched = preg_match(
        '/<script id="studio-config-a" type="application\/json">(.*)<\/script>\z/s',
        $html,
        $matches,
    );
    assertSameValue(1, $matched);
    $emitted = json_decode($matches[1], false, StudioDeploymentEmitter::MAXIMUM_JSON_DEPTH, JSON_THROW_ON_ERROR);
    assertTrueValue($emitted instanceof stdClass, 'Emitted deployment is not an object.');

    $csrf = $emitted->transport->authentication->csrf->token;
    $security = new SameOriginSessionCsrfVerifier(
        static fn (TransportSecurityInput $input): ?object => new TestPrincipal(),
        static fn (object $principal, TransportSecurityInput $input): ?string => $csrf,
        'https://admin.example.test',
    );
    $responder = new AuthoringResponder(
        $application,
        $schemas,
        $security,
        correlationIds: new TestCorrelationIds(),
    );
    $save = AuthoringOperationRegistry::find('authoring/save-item');
    assertTrueValue($save !== null, 'Operation is missing.');
    $routing = $emitted->transport->routing;
    assertSameValue('operation-map', $routing->kind);
    assertSameValue(7, count(get_object_vars($routing->endpoints)));

    $mapped = requestFor($save);
    $mapped = new HttpRequest(
        $mapped->method,
        $routing->endpoints->{$save->route},
        [
            ...$mapped->headers,
            'Origin' => 'https://admin.example.test',
            'Sec-Fetch-Site' => 'same-origin',
            $emitted->transport->authentication->csrf->headerName => $csrf,
        ],
        $mapped->body,
    );
    assertSameValue(200, $responder->respond($mapped)->status);

    $singleConfiguration = deploymentConfiguration();
    $singleConfiguration->transport->routing = AuthoringEndpointConfiguration::singleEndpoint();
    $singleHtml = $emitter->render('studio-a', 'studio-config-a', $singleConfiguration);
    $singleMatched = preg_match(
        '/<script id="studio-config-a" type="application\/json">(.*)<\/script>\z/s',
        $singleHtml,
        $singleMatches,
    );
    assertSameValue(1, $singleMatched);
    $singleEmitted = json_decode(
        $singleMatches[1],
        false,
        StudioDeploymentEmitter::MAXIMUM_JSON_DEPTH,
        JSON_THROW_ON_ERROR,
    );
    assertTrueValue($singleEmitted instanceof stdClass, 'Single-endpoint deployment is not an object.');
    $singleRouting = $singleEmitted->transport->routing;
    $single = requestFor($save);
    $single = new HttpRequest(
        $single->method,
        $singleRouting->endpoint,
        [
            ...$single->headers,
            'Origin' => 'https://admin.example.test',
            'Sec-Fetch-Site' => 'same-origin',
            $singleEmitted->transport->authentication->csrf->headerName => $csrf,
            AuthoringEndpointConfiguration::SINGLE_ENDPOINT_OPERATION_HEADER => $save->route,
        ],
        $single->body,
    );
    assertSameValue(200, $responder->respond($single)->status);
    assertSameValue(2, count($application->calls));

    try {
        AuthoringEndpointConfiguration::singleEndpoint('/ports/..');
        throw new RuntimeException('A dot-segment endpoint was accepted.');
    } catch (InvalidArgumentException) {
        // Expected.
    }
});

test('deployment emitter produces inert XSS-safe JSON for its exact mount', function (): void {
    $schemas = new TestSchemas();
    $configuration = deploymentConfiguration();
    $unsafe = "</script><script>alert('configuration')</script>&\u{2028}\u{2029}";
    $configuration->transport->authentication->csrf->token = $unsafe;
    $html = (new StudioDeploymentEmitter($schemas))->render(
        'studio-a',
        'studio-config-a',
        $configuration,
    );

    assertTrueValue(
        str_starts_with($html, '<div id="studio-a" data-kumwe-studio="studio-config-a"></div>'),
        'The emitted mount pair is not browser-discoverable.',
    );
    assertSameValue(1, substr_count(strtolower($html), '</script>'));
    assertTrueValue(!str_contains($html, '<script>alert'), 'Configuration escaped its inert script element.');
    assertTrueValue(str_contains($html, '\\u003C/script\\u003E'), 'Less-than/greater-than were not hex escaped.');
    assertTrueValue(str_contains($html, '\\u0026'), 'Ampersand was not hex escaped.');
    assertTrueValue(!str_contains($html, "\u{2028}"), 'U+2028 remained executable-source-sensitive text.');

    $matched = preg_match(
        '/<script id="studio-config-a" type="application\/json">(.*)<\/script>\z/s',
        $html,
        $matches,
    );
    assertSameValue(1, $matched);
    $decoded = json_decode($matches[1], false, 16, JSON_THROW_ON_ERROR);
    assertSameValue($unsafe, $decoded->transport->authentication->csrf->token);
    assertSameValue([StudioDeploymentEmitter::SCHEMA_ID], $schemas->references);

    $minimal = (object) ['mount' => '#studio-b'];
    $second = (new StudioDeploymentEmitter(new TestSchemas()))->render(
        'studio-b',
        'studio-config-b',
        $minimal,
    );
    assertTrueValue(str_contains($second, 'data-kumwe-studio="studio-config-b"'), 'Second mount failed.');
});

test('deployment emitter refuses mismatched mounts invalid schemas and oversized JSON', function (): void {
    $emitter = new StudioDeploymentEmitter(new TestSchemas());
    assertSameValue(2_097_152, StudioDeploymentEmitter::MAXIMUM_JSON_BYTES);
    $largerThanLegacyLimit = (object) [
        'mount' => '#studio-a',
        'padding' => str_repeat('x', 70_000),
    ];
    assertTrueValue(
        str_contains($emitter->render('studio-a', 'studio-config-a', $largerThanLegacyLimit), '"padding"'),
        'A bounded deployment above the legacy 64 KiB limit was refused.',
    );
    try {
        $emitter->render('studio-a', 'studio-config-a', (object) ['mount' => '#studio-other']);
        throw new RuntimeException('A mismatched deployment mount was accepted.');
    } catch (InvalidArgumentException) {
        // Expected.
    }

    $schemas = new TestSchemas();
    $schemas->rejectReference = StudioDeploymentEmitter::SCHEMA_ID;
    try {
        (new StudioDeploymentEmitter($schemas))->render(
            'studio-a',
            'studio-config-a',
            (object) ['mount' => '#studio-a'],
        );
        throw new RuntimeException('An invalid deployment configuration was accepted.');
    } catch (InvalidArgumentException) {
        // Expected.
    }

    $oversized = (object) [
        'mount' => '#studio-a',
        'padding' => str_repeat('x', StudioDeploymentEmitter::MAXIMUM_JSON_BYTES),
    ];
    try {
        $emitter->render('studio-a', 'studio-config-a', $oversized);
        throw new RuntimeException('An oversized deployment configuration was accepted.');
    } catch (InvalidArgumentException) {
        // Expected.
    }

    $tooDeep = (object) ['mount' => '#studio-a'];
    $cursor = $tooDeep;
    for ($depth = 0; $depth < StudioDeploymentEmitter::MAXIMUM_JSON_DEPTH; $depth++) {
        $cursor->nested = (object) [];
        $cursor = $cursor->nested;
    }
    try {
        $emitter->render('studio-a', 'studio-config-a', $tooDeep);
        throw new RuntimeException('A deployment beyond the JSON depth limit was accepted.');
    } catch (InvalidArgumentException) {
        // Expected.
    }

    $mismatchedContext = deploymentConfiguration();
    $alteredContext = clone $mismatchedContext->launch->resourceContext;
    $alteredContext->key = 'contexts/altered';
    $mismatchedContext->launch->resourceContext = $alteredContext;
    try {
        $emitter->render('studio-a', 'studio-config-a', $mismatchedContext);
        throw new RuntimeException('Mismatched launch/session resource contexts were accepted.');
    } catch (InvalidArgumentException) {
        // Expected.
    }

    $mismatchedRoutes = deploymentConfiguration();
    unset($mismatchedRoutes->transport->routing->endpoints->{'authoring/list-types'});
    try {
        $emitter->render('studio-a', 'studio-config-a', $mismatchedRoutes);
        throw new RuntimeException('Endpoint/capability drift was accepted.');
    } catch (InvalidArgumentException) {
        // Expected.
    }
});

test('deployment emitter enforces current fifteen-minute token windows', function (): void {
    $now = strtotime('2029-01-01T00:00:00Z') * 1000;
    $emitter = new StudioDeploymentEmitter(new TestSchemas(), static fn (): int => $now);
    assertSameValue(900_000, StudioDeploymentEmitter::MAXIMUM_TOKEN_LIFETIME_MILLISECONDS);

    $configuration = deploymentConfiguration();
    $configuration->transport->authentication = (object) [
        'kind' => 'bearer-token',
        'credentials' => 'omit',
        'token' => 'placeholder',
        'issuedAt' => '2029-01-01T00:00:00Z',
        'expiresAt' => '2029-01-01T00:15:00Z',
    ];
    assertTrueValue(
        str_contains(
            $emitter->render('studio-a', 'studio-config-a', $configuration),
            '"issuedAt"',
        ),
        'A valid maximum-lifetime token deployment was refused.',
    );

    foreach (
        [
            ['2029-01-01T00:00:00Z', '2029-01-01T00:15:00.000000001Z'],
            ['2029-01-01T00:00:01Z', '2029-01-01T00:10:01Z'],
            ['2028-12-31T23:50:00Z', '2029-01-01T00:00:00Z'],
            ['not-an-instant', '2029-01-01T00:10:00Z'],
        ] as [$issuedAt, $expiresAt]
    ) {
        $invalid = clone $configuration;
        $invalid->transport = clone $configuration->transport;
        $invalid->transport->authentication = clone $configuration->transport->authentication;
        $invalid->transport->authentication->issuedAt = $issuedAt;
        $invalid->transport->authentication->expiresAt = $expiresAt;
        assertThrows(
            static fn () => $emitter->render('studio-a', 'studio-config-a', $invalid),
            InvalidArgumentException::class,
        );
    }
});

test('same-origin session and CSRF verifier observes current server-side state', function (): void {
    $principal = new TestPrincipal();
    $expectedToken = 'rotating/session-token';
    $authenticationCalls = 0;
    $csrfCalls = 0;
    $verifier = new SameOriginSessionCsrfVerifier(
        static function (TransportSecurityInput $input) use ($principal, &$authenticationCalls): ?object {
            $authenticationCalls++;
            return $principal;
        },
        static function (object $trusted, TransportSecurityInput $input) use ($expectedToken, &$csrfCalls): ?string {
            $csrfCalls++;
            return $expectedToken;
        },
        'https://admin.example.test',
        'X-CSRF-Token',
    );
    $headers = [
        'Origin' => 'https://admin.example.test',
        'Sec-Fetch-Site' => 'same-origin',
    ];
    $headers['X-CSRF-Token'] = $expectedToken;
    $input = new TransportSecurityInput(
        'POST',
        '/ports/authoring/save-item',
        $headers,
        'authoring/save-item',
        'studio.operation/authoring.save-item',
        true,
    );
    assertTrueValue($verifier->verify($input)->isAllowed(), 'Valid session request was refused.');
    assertSameValue(1, $authenticationCalls);
    assertSameValue(1, $csrfCalls);

    $hostileOrigin = new TransportSecurityInput(
        $input->method,
        $input->path,
        [...$input->headers, 'Origin' => 'https://hostile.example.test'],
        $input->route,
        $input->capability,
        $input->mutating,
    );
    $decision = $verifier->verify($hostileOrigin);
    assertTrueValue(!$decision->isAllowed() && !$decision->isUnauthenticated(), 'Hostile Origin was allowed.');
    assertSameValue(1, $authenticationCalls, 'Hostile Origin reached session authentication.');
    assertSameValue(1, $csrfCalls, 'Hostile Origin reached server-side CSRF state.');

    $crossSite = new TransportSecurityInput(
        $input->method,
        $input->path,
        [...$input->headers, 'Sec-Fetch-Site' => 'cross-site'],
        $input->route,
        $input->capability,
        $input->mutating,
    );
    $decision = $verifier->verify($crossSite);
    assertTrueValue(!$decision->isAllowed() && !$decision->isUnauthenticated(), 'Cross-site request was allowed.');
    assertSameValue(1, $authenticationCalls, 'Hostile Fetch Metadata reached session authentication.');
    assertSameValue(1, $csrfCalls, 'Hostile Fetch Metadata reached server-side CSRF state.');
});

test('HTTP loopback origins require an explicit development opt-in', function (): void {
    $authenticate = static fn (TransportSecurityInput $input): ?object => new TestPrincipal();
    $csrf = static fn (object $principal, TransportSecurityInput $input): ?string => '<test-csrf-token>';
    try {
        new SameOriginSessionCsrfVerifier($authenticate, $csrf, 'http://localhost:8080');
        throw new RuntimeException('An HTTP loopback origin was enabled by default.');
    } catch (InvalidArgumentException) {
        // Expected: production defaults require HTTPS.
    }

    $development = new SameOriginSessionCsrfVerifier(
        $authenticate,
        $csrf,
        'http://127.0.0.1:8080',
        allowHttpLoopbackForDevelopment: true,
    );
    assertTrueValue($development->verify(new TransportSecurityInput(
        'POST',
        '/studio/ports/authoring/start',
        [
            'Origin' => 'http://127.0.0.1:8080',
            'Sec-Fetch-Site' => 'same-origin',
            'X-CSRF-Token' => '<test-csrf-token>',
        ],
        'authoring/start',
        'studio.operation/authoring.start',
        true,
    ))->isAllowed(), 'Explicit loopback development origin was refused.');

    try {
        new SameOriginSessionCsrfVerifier(
            $authenticate,
            $csrf,
            'http://admin.example.test',
            allowHttpLoopbackForDevelopment: true,
        );
        throw new RuntimeException('A non-loopback HTTP origin was enabled for development.');
    } catch (InvalidArgumentException) {
        // Expected.
    }
});

test('short-lived bearer and custom header verifiers delegate authoritative token checks', function (): void {
    $seen = [];
    $authenticate = static function (string $token, TransportSecurityInput $input) use (&$seen): ?object {
        $seen[] = [$token, $input->route];
        return $token === 'signed.short-lived.token' ? new TestPrincipal() : null;
    };
    $input = new TransportSecurityInput(
        'POST',
        '/ports/authoring/start',
        ['Authorization' => 'Bearer signed.short-lived.token'],
        'authoring/start',
        'studio.operation/authoring.start',
        true,
    );
    assertTrueValue(ShortLivedTokenVerifier::bearer($authenticate)->verify($input)->isAllowed(), 'Bearer failed.');

    $headerInput = new TransportSecurityInput(
        $input->method,
        $input->path,
        ['X-Studio-Session' => 'signed.short-lived.token'],
        $input->route,
        $input->capability,
        $input->mutating,
    );
    assertTrueValue(
        ShortLivedTokenVerifier::header($authenticate, 'X-Studio-Session')->verify($headerInput)->isAllowed(),
        'Custom token header failed.',
    );
    assertSameValue(
        [
            ['signed.short-lived.token', 'authoring/start'],
            ['signed.short-lived.token', 'authoring/start'],
        ],
        $seen,
    );
    foreach (['X-Studio-Operation', 'aUtHoRiZaTiOn', 'Keep-Alive', 'Sec-Fetch-Site'] as $reservedHeader) {
        try {
            ShortLivedTokenVerifier::header($authenticate, $reservedHeader);
            throw new RuntimeException('A transport-owned token header was accepted: ' . $reservedHeader);
        } catch (InvalidArgumentException) {
            // Expected.
        }
    }
    try {
        new SameOriginSessionCsrfVerifier(
            static fn (TransportSecurityInput $request): ?object => new TestPrincipal(),
            static fn (object $principal, TransportSecurityInput $request): ?string => '<test-csrf-token>',
            'https://admin.example.test',
            'Authorization',
        );
        throw new RuntimeException('A reserved CSRF header was accepted.');
    } catch (InvalidArgumentException) {
        // Expected.
    }
});

test('authentication and request integrity run before malformed JSON is parsed', function (): void {
    [$responder, $application, $schemas, $security] = fixture(TransportSecurityDecision::unauthenticated());
    $response = $responder->respond(new HttpRequest(
        'POST',
        '/ports/authoring/resolve-target',
        ['Content-Type' => 'application/json'],
        '{not-json',
    ));
    assertSameValue(401, $response->status);
    assertSameValue('unauthenticated', jsonBody($response)->category);
    assertSameValue(0, count($application->calls));
    assertSameValue(1, $security->calls);
    assertSameValue(
        ['https://schemas.kumwe.org/studio/v1/host-error.schema.json'],
        $schemas->references,
    );

    [$responder] = fixture(TransportSecurityDecision::forbidden());
    assertSameValue(403, $responder->respond(new HttpRequest(
        'POST',
        '/ports/authoring/resolve-target',
        ['Content-Type' => 'application/json'],
        '{still-not-json',
    ))->status);
});

test('duplicate JSON members are rejected before schema dispatch', function (): void {
    [$responder, $application, $schemas, $security] = fixture();
    $resolve = AuthoringOperationRegistry::find('authoring/resolve-target');
    assertTrueValue($resolve !== null, 'Operation is missing.');
    $request = requestFor($resolve);
    $duplicate = preg_replace(
        '/\{"operationId":/',
        '{"operationId":"studio.operation/authoring.resolve-target","operationId":',
        $request->body,
        1,
    );
    assertTrueValue(is_string($duplicate), 'Duplicate-member fixture could not be built.');

    $response = $responder->respond(new HttpRequest(
        $request->method,
        $request->path,
        $request->headers,
        $duplicate,
    ));

    assertSameValue(400, $response->status);
    assertSameValue('invalid-request', jsonBody($response)->category);
    assertSameValue(0, count($application->calls));
    assertSameValue(1, $security->calls);
    assertTrueValue(
        !in_array($resolve->requestSchema(), $schemas->references, true),
        'Ambiguous JSON reached schema dispatch.',
    );
});

test('method content type duplicate header route query and byte guards fail closed', function (): void {
    [$responder] = fixture(maximumRequestBytes: 8);
    $operation = AuthoringOperationRegistry::find('authoring/resolve-target');
    assertTrueValue($operation !== null, 'Operation is missing.');
    $valid = requestFor($operation);

    $method = $responder->respond(new HttpRequest('GET', $valid->path, $valid->headers, $valid->body));
    assertSameValue(400, $method->status);
    assertSameValue('POST', $method->headers['Allow']);
    assertSameValue(400, $responder->respond(new HttpRequest(
        'POST',
        $valid->path,
        ['Content-Type' => 'text/plain'],
        $valid->body,
    ))->status);
    assertSameValue(400, $responder->respond(new HttpRequest(
        'POST',
        $valid->path,
        ['Content-Type' => 'application/json', 'content-type' => 'application/json'],
        $valid->body,
    ))->status);
    assertSameValue(404, $responder->respond(new HttpRequest(
        'POST',
        $valid->path . '?resource=secret',
        ['Content-Type' => 'application/json'],
        '{}',
    ))->status);
    assertSameValue(413, $responder->respond(new HttpRequest(
        'POST',
        $valid->path,
        $valid->headers,
        '123456789',
    ))->status);
});

test('operation id protocol idempotency outer revision and resource context are guarded', function (): void {
    [$responder, $application] = fixture();
    $start = AuthoringOperationRegistry::find('authoring/start');
    $resolve = AuthoringOperationRegistry::find('authoring/resolve-target');
    $save = AuthoringOperationRegistry::find('authoring/save-item');
    assertTrueValue($start !== null && $resolve !== null && $save !== null, 'Operations are missing.');

    assertSameValue(400, $responder->respond(requestFor(
        $resolve,
        static fn (stdClass $wire) => $wire->context->operationId = 'studio.operation/authoring.start',
    ))->status);
    $protocol = $responder->respond(requestFor(
        $resolve,
        static fn (stdClass $wire) => $wire->context->protocolVersion = '9.0.0',
    ));
    assertSameValue(400, $protocol->status);
    assertSameValue('incompatible', jsonBody($protocol)->category);
    assertSameValue(400, $responder->respond(requestFor(
        $start,
        static function (stdClass $wire): void {
            unset($wire->context->idempotencyKey);
        },
    ))->status);
    assertSameValue(400, $responder->respond(requestFor(
        $resolve,
        static fn (stdClass $wire) => $wire->context->idempotencyKey = 'unexpected/key',
    ))->status);
    assertSameValue(400, $responder->respond(requestFor(
        $save,
        static fn (stdClass $wire) => $wire->context->expectedRevision = 'outer-r1',
    ))->status);
    assertSameValue(400, $responder->respond(requestFor(
        $resolve,
        static fn (stdClass $wire) => $wire->arguments->request->resourceContext->key = 'contexts/other',
    ))->status);
    assertSameValue(0, count($application->calls));
});

test('host failures preserve safe category and revision while unknown failures do not leak', function (): void {
    [$responder, $application] = fixture();
    $save = AuthoringOperationRegistry::find('authoring/save-item');
    assertTrueValue($save !== null, 'Operation is missing.');
    $application->failure = new HostFailure(
        'conflict',
        'studio.host/save-conflict',
        'The authoring coordinates changed.',
        false,
        null,
        'entry-r9',
    );
    $conflict = $responder->respond(requestFor($save));
    assertSameValue(409, $conflict->status);
    assertSameValue('entry-r9', jsonBody($conflict)->revision);

    $application->failure = new RuntimeException('database password and SQL detail');
    $internal = $responder->respond(requestFor($save));
    assertSameValue(500, $internal->status);
    assertTrueValue(!str_contains($internal->body, 'database password'), 'Unknown failure leaked.');
});

test('host failure values are bounded before serialization', function (): void {
    foreach (
        [
            static fn (): HostFailure => new HostFailure(
                'internal',
                'studio.' . str_repeat('a', 150) . '/failure',
                'Too-long message key.',
            ),
            static function (): HostFailure {
                $failure = HostFailure::internal();
                $failure->document('../invalid-correlation');
                return $failure;
            },
        ] as $invalid
    ) {
        try {
            $invalid();
            throw new RuntimeException('Invalid host failure value was accepted.');
        } catch (InvalidArgumentException) {
            // Expected: invalid values never reach the host-error encoder.
        }
    }
});

test('host failures bind retry delay and revision to their canonical categories', function (): void {
    assertThrows(
        static fn (): HostFailure => new HostFailure(
            'forbidden',
            'studio.php/invalid-retry-delay',
            'The request is forbidden.',
            true,
            1_000,
        ),
        InvalidArgumentException::class,
    );
    assertThrows(
        static fn (): HostFailure => new HostFailure(
            'unavailable',
            'studio.php/non-retryable-delay',
            'The service is unavailable.',
            false,
            1_000,
        ),
        InvalidArgumentException::class,
    );
    assertThrows(
        static fn (): HostFailure => new HostFailure(
            'validation-failed',
            'studio.php/invalid-current-revision',
            'The request failed validation.',
            false,
            null,
            'entry-r2',
        ),
        InvalidArgumentException::class,
    );

    $rateLimited = new HostFailure(
        'rate-limited',
        'studio.php/rate-limited',
        'The request is rate limited.',
        true,
        1_000,
    );
    assertSameValue(1_000, $rateLimited->retryAfterMilliseconds);
    $conflict = new HostFailure(
        'conflict',
        'studio.php/conflict',
        'The request conflicts with current state.',
        false,
        null,
        'entry-r2',
    );
    assertSameValue('entry-r2', $conflict->revision);
});

test('custom failure mapper and invalid host result remain canonical', function (): void {
    [$responder, $application] = fixture(failureMapper: new ValidationFailureMapper());
    $save = AuthoringOperationRegistry::find('authoring/save-item');
    assertTrueValue($save !== null, 'Operation is missing.');
    $application->failure = new DomainException('private validation detail');
    $validation = $responder->respond(requestFor($save));
    assertSameValue(422, $validation->status);
    assertSameValue('validation-failed', jsonBody($validation)->category);
    assertTrueValue(!str_contains($validation->body, 'private validation detail'), 'Domain detail leaked.');

    [$responder, , $schemas] = fixture();
    $schemas->rejectReference = $save->resultSchema();
    $invalid = $responder->respond(requestFor($save));
    assertSameValue(500, $invalid->status);
    assertSameValue('internal', jsonBody($invalid)->category);
});

test('security and schema backend failures are safe JSON with required headers', function (): void {
    [$responder, , , $security] = fixture();
    $resolve = AuthoringOperationRegistry::find('authoring/resolve-target');
    assertTrueValue($resolve !== null, 'Operation is missing.');
    $security->throw = true;
    $response = $responder->respond(requestFor($resolve));
    assertSameValue(500, $response->status);
    assertSameValue('no-store', $response->headers['Cache-Control']);
    assertSameValue('application/json; charset=utf-8', $response->headers['Content-Type']);
    assertSameValue('nosniff', $response->headers['X-Content-Type-Options']);
    assertTrueValue(!str_contains($response->body, 'security backend detail'), 'Security detail leaked.');

    [$responder, , $schemas] = fixture();
    $schemas->throwReference = $resolve->requestSchema();
    $response = $responder->respond(requestFor($resolve));
    assertSameValue(500, $response->status);
    assertTrueValue(!str_contains($response->body, 'schema backend unavailable'), 'Schema detail leaked.');
});

$failures = 0;
foreach ($tests as $name => $body) {
    try {
        $body();
        fwrite(STDOUT, "ok - {$name}\n");
    } catch (Throwable $failure) {
        $failures++;
        fwrite(STDERR, "not ok - {$name}: {$failure->getMessage()}\n");
    }
}

if ($failures !== 0) {
    fwrite(STDERR, "{$failures} PHP authoring-host reference test(s) failed.\n");
    exit(1);
}

fwrite(STDOUT, count($tests) . " PHP authoring-host reference tests passed.\n");
