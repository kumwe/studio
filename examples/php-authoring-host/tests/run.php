<?php

declare(strict_types=1);

use Kumwe\Studio\PhpAuthoringHost\AuthoringApplicationService;
use Kumwe\Studio\PhpAuthoringHost\AuthoringCallContext;
use Kumwe\Studio\PhpAuthoringHost\AuthoringOperation;
use Kumwe\Studio\PhpAuthoringHost\AuthoringOperationRegistry;
use Kumwe\Studio\PhpAuthoringHost\AuthoringResponder;
use Kumwe\Studio\PhpAuthoringHost\CorrelationIdFactory;
use Kumwe\Studio\PhpAuthoringHost\FailureMapper;
use Kumwe\Studio\PhpAuthoringHost\HostFailure;
use Kumwe\Studio\PhpAuthoringHost\HttpRequest;
use Kumwe\Studio\PhpAuthoringHost\HttpResponse;
use Kumwe\Studio\PhpAuthoringHost\SchemaValidator;
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
