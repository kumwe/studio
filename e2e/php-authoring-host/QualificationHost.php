<?php

declare(strict_types=1);

namespace Kumwe\Studio\PhpBrowserQualification;

use Kumwe\Studio\PhpAuthoringHost\AuthoringApplicationService;
use Kumwe\Studio\PhpAuthoringHost\AuthoringCallContext;
use Kumwe\Studio\PhpAuthoringHost\AuthoringEndpointConfiguration;
use Kumwe\Studio\PhpAuthoringHost\AuthoringOperationRegistry;
use Kumwe\Studio\PhpAuthoringHost\HostFailure;
use Kumwe\Studio\PhpAuthoringHost\SchemaValidator;
use Kumwe\Studio\PhpAuthoringHost\StudioDeploymentEmitter;
use Kumwe\Studio\PhpAuthoringHost\TransportSecurityInput;
use RuntimeException;
use stdClass;

/**
 * Deliberately narrow validator for this executable boundary fixture.
 *
 * It proves that the PHP responder asks for the exact canonical schema
 * references and fails closed for unknown references. It is not a JSON Schema
 * draft 2020-12 implementation and MUST NOT be cited as schema qualification.
 * The compiled browser runtime independently applies Studio's complete bundled
 * schemas to every emitted deployment and every PHP response in this lane.
 */
final class QualificationBoundarySchemaValidator implements SchemaValidator
{
    private const AUTHORING_SCHEMA_PREFIX =
        'https://schemas.kumwe.org/studio/v1/authoring-http.schema.json#/$defs/';
    private const HOST_ERROR_SCHEMA =
        'https://schemas.kumwe.org/studio/v1/host-error.schema.json';

    public function validate(string $schemaReference, mixed $value): bool
    {
        if ($schemaReference === StudioDeploymentEmitter::SCHEMA_ID) {
            return $value instanceof stdClass
                && ($value->kind ?? null) === 'studio-deployment'
                && is_string($value->mount ?? null)
                && ($value->release ?? null) instanceof stdClass
                && is_string($value->release->version ?? null)
                && is_string($value->release->corpusManifestDigest ?? null)
                && ($value->launch ?? null) instanceof stdClass
                && ($value->session ?? null) instanceof stdClass
                && ($value->transport ?? null) instanceof stdClass
                && ($value->transport->kind ?? null) === 'http';
        }

        if ($schemaReference === self::HOST_ERROR_SCHEMA) {
            return $value instanceof stdClass
                && ($value->kind ?? null) === 'host-error'
                && is_string($value->category ?? null)
                && ($value->message ?? null) instanceof stdClass;
        }

        if (!str_starts_with($schemaReference, self::AUTHORING_SCHEMA_PREFIX)) {
            return false;
        }
        $definition = substr($schemaReference, strlen(self::AUTHORING_SCHEMA_PREFIX));
        if (str_ends_with($definition, 'Request')) {
            return $value instanceof stdClass
                && ($value->arguments ?? null) instanceof stdClass
                && ($value->context ?? null) instanceof stdClass;
        }
        if (str_ends_with($definition, 'Result')) {
            return $value instanceof stdClass
                && property_exists($value, 'value')
                && $value->value instanceof stdClass;
        }

        return false;
    }
}

final class QualificationState
{
    private const SESSION_KEY = 'studio_php_browser_qualification';
    private const MOUNTS = [
        'alpha',
        'beta',
        'refused',
        'missing-content-type',
        'wrong-content-type',
        'duplicate-json',
        'conflict',
        'oversized',
    ];
    private const RESPONSE_ATTACKS = [
        'missing-content-type' => 'missing-content-type',
        'wrong-content-type' => 'wrong-content-type',
        'duplicate-json' => 'duplicate-json-member',
        'oversized' => 'oversized-json',
    ];

    /** @return list<string> */
    public static function mounts(): array
    {
        return self::MOUNTS;
    }

    public static function isKnownMount(string $mount): bool
    {
        return in_array($mount, self::MOUNTS, true);
    }

    public static function responseAttack(string $mount): ?string
    {
        return self::RESPONSE_ATTACKS[$mount] ?? null;
    }

    public static function reset(string $repositoryRoot): void
    {
        $mounts = [];
        foreach (self::MOUNTS as $mount) {
            $mounts[$mount] = [
                'csrfToken' => 'studio-e2e-' . $mount . '-csrf-token',
                'routePrefix' => '/studio/' . $mount . '/ports',
                'saveSerial' => 7,
                'session' => self::buildSession($repositoryRoot, $mount),
            ];
        }
        $_SESSION[self::SESSION_KEY] = [
            'mounts' => $mounts,
            'operations' => [],
            'plans' => [],
            'security' => [],
        ];
    }

    public static function ensureInitialized(string $repositoryRoot): void
    {
        if (!is_array($_SESSION[self::SESSION_KEY] ?? null)) {
            self::reset($repositoryRoot);
        }
    }

    public static function deployment(string $mount, stdClass $browserRelease): stdClass
    {
        $state = self::mountState($mount);
        $snapshot = self::cloneObject($state['session']);
        $advertisedRoutes = [
            'authoring/resolve-target',
            'authoring/start',
            'authoring/plan-save',
            'authoring/save-item',
        ];
        $registry = AuthoringOperationRegistry::all();
        $operations = array_map(
            static fn (string $route): string => $registry[$route]->capability,
            $advertisedRoutes,
        );
        $routing = AuthoringEndpointConfiguration::operationMap($state['routePrefix']);
        foreach (array_keys(get_object_vars($routing->endpoints)) as $route) {
            if (!in_array($route, $advertisedRoutes, true)) {
                unset($routing->endpoints->{$route});
            }
        }

        $configuration = (object) [
            'contractVersion' => '0.1-draft',
            'kind' => 'studio-deployment',
            'instanceId' => 'php-e2e-' . $mount,
            'mount' => '#studio-' . $mount,
            'release' => self::cloneObject($browserRelease),
            'launch' => (object) [
                'targetId' => $snapshot->target->id,
                'intent' => 'edit',
                'resourceContext' => self::cloneObject($snapshot->resourceContext),
                'start' => (object) ['kind' => 'existing'],
                'initialPresentation' => 'inline',
            ],
            'session' => (object) [
                'contractVersion' => $snapshot->contractVersion,
                'protocolVersion' => '0.1.0-draft.2',
                'sessionId' => $snapshot->sessionId,
                'sessionGeneration' => $snapshot->sessionGeneration,
                'mode' => 'content',
                'composite' => 'hybrid',
                'sessionState' => 'editable',
                'actor' => (object) [
                    'id' => 'actors/php-browser-editor',
                    'displayName' => 'PHP Browser Editor',
                ],
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
                'resourceContext' => self::cloneObject($snapshot->resourceContext),
                'permissions' => $operations,
                'artifacts' => (object) [
                    'model' => self::cloneObject($snapshot->state->coordinates->model),
                    'blueprint' => self::cloneObject($snapshot->state->coordinates->blueprint),
                    'entry' => self::cloneObject($snapshot->state->coordinates->entry),
                    'theme' => self::cloneObject($snapshot->state->blueprint->dependencyLock->theme),
                ],
                'blocks' => self::cloneValue($snapshot->state->blueprint->dependencyLock->blocks),
                'plugins' => [],
                'hostCapabilities' => (object) [
                    'contractVersion' => '0.1-draft',
                    'kind' => 'host-capabilities',
                    'host' => (object) [
                        'id' => 'studio.e2e/php-host',
                        'version' => '1.0.0',
                        'generation' => 'php-e2e-' . $mount . '-host-r1',
                    ],
                    'protocolVersions' => ['0.1.0-draft.2'],
                    'ports' => [
                        (object) [
                            'id' => 'studio.port/authoring',
                            'version' => '1.0.0',
                            'operations' => $operations,
                        ],
                    ],
                    'capabilities' => [],
                ],
                'limits' => (object) [
                    'maxNodes' => 5_000,
                    'maxDepth' => 32,
                    'maxSlotsPerNode' => 20,
                    'maxChildrenPerSlot' => 1_000,
                    'maxPropertyBytes' => 1_048_576,
                    'maxExtensionBytes' => 1_048_576,
                    'maxCommandBatch' => 100,
                    'maxHistoryEntries' => 1_000,
                    'maxRichTextBytes' => 1_048_576,
                    'maxRichTextDepth' => 32,
                    'maxPreviewRequestsPerMinute' => 600,
                    'maxPreviewBytes' => 10_485_760,
                    'maxMediaUploadBytes' => 1_073_741_824,
                    'maxMediaBatch' => 50,
                    'maxPluginCount' => 50,
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
            ],
            'transport' => (object) [
                'kind' => 'http',
                'routing' => $routing,
                'authentication' => (object) [
                    'kind' => 'same-origin-session',
                    'credentials' => 'same-origin',
                    'csrf' => (object) [
                        'headerName' => self::csrfHeaderName($mount),
                        'token' => $state['csrfToken'],
                    ],
                ],
                'requestTimeoutMilliseconds' => 10_000,
                'maximumResponseBytes' => $mount === 'oversized' ? 1_024 : 8_388_608,
            ],
        ];

        return $configuration;
    }

    public static function session(string $mount): stdClass
    {
        return self::cloneObject(self::mountState($mount)['session']);
    }

    public static function replaceSession(string $mount, stdClass $session): void
    {
        self::root()['mounts'][$mount]['session'] = self::cloneObject($session);
    }

    public static function cloneSubmittedEntry(stdClass $entry): stdClass
    {
        return self::cloneObject($entry);
    }

    public static function nextSaveRevision(string $mount): string
    {
        $root = &self::root();
        $root['mounts'][$mount]['saveSerial']++;
        return 'entry-' . $mount . '-r' . $root['mounts'][$mount]['saveSerial'];
    }

    public static function csrfToken(string $mount): string
    {
        return self::mountState($mount)['csrfToken'];
    }

    public static function csrfHeaderName(string $mount): string
    {
        return 'X-Studio-CSRF-' . ucfirst($mount);
    }

    public static function routePrefix(string $mount): string
    {
        return self::mountState($mount)['routePrefix'];
    }

    public static function recordSecurity(
        string $mount,
        TransportSecurityInput $input,
        bool $cookieAuthenticated,
    ): void {
        $expectedToken = self::csrfToken($mount);
        $suppliedToken = self::singleHeader($input->headers, self::csrfHeaderName($mount));
        self::root()['security'][] = [
            'mount' => $mount,
            'route' => $input->route,
            'resourceRoutePrefix' => self::routePrefix($mount),
            'cookieAuthenticated' => $cookieAuthenticated,
            'csrfMatched' => is_string($suppliedToken) && hash_equals($expectedToken, $suppliedToken),
            'originMatched' => self::singleHeader($input->headers, 'Origin') === QualificationServer::ORIGIN,
            'sameOriginFetch' => self::singleHeader($input->headers, 'Sec-Fetch-Site') === 'same-origin',
            'fetchDestination' => self::singleHeader($input->headers, 'Sec-Fetch-Dest'),
            'fetchMode' => self::singleHeader($input->headers, 'Sec-Fetch-Mode'),
        ];
    }

    public static function recordOperation(
        string $mount,
        string $route,
        stdClass $argument,
        AuthoringCallContext $context,
    ): void {
        self::root()['operations'][] = [
            'mount' => $mount,
            'route' => $route,
            'resourceContextKey' => $context->resourceContextKey(),
            'sessionGeneration' => $context->sessionGeneration(),
            'idempotencyKeyPresent' => $context->idempotencyKey() !== null,
            'argumentKind' => is_string($argument->kind ?? null) ? $argument->kind : null,
        ];
    }

    public static function storePlan(string $mount, stdClass $intent, stdClass $plan): void
    {
        self::root()['plans'][$mount] = [
            'intent' => self::cloneObject($intent),
            'plan' => self::cloneObject($plan),
        ];
    }

    /** @return array{intent: stdClass, plan: stdClass} */
    public static function plan(string $mount): array
    {
        $plan = self::root()['plans'][$mount] ?? null;
        if (
            !is_array($plan)
            || !($plan['intent'] ?? null) instanceof stdClass
            || !($plan['plan'] ?? null) instanceof stdClass
        ) {
            throw new HostFailure(
                'conflict',
                'studio.e2e/save-plan-missing',
                'The PHP host no longer recognizes this save plan.',
                false,
                null,
                self::session($mount)->state->entry->revision,
            );
        }
        return [
            'intent' => self::cloneObject($plan['intent']),
            'plan' => self::cloneObject($plan['plan']),
        ];
    }

    public static function exportAudit(): stdClass
    {
        $root = self::root();
        $mounts = [];
        foreach (self::MOUNTS as $mount) {
            $state = $root['mounts'][$mount];
            $mounts[$mount] = (object) [
                'instanceId' => 'php-e2e-' . $mount,
                'routePrefix' => $state['routePrefix'],
                'csrfHeaderName' => self::csrfHeaderName($mount),
                'sessionId' => $state['session']->sessionId,
                'sessionGeneration' => $state['session']->sessionGeneration,
                'resourceContextKey' => $state['session']->resourceContext->key,
                'entryRevision' => $state['session']->state->entry->revision,
                'entryValues' => self::cloneObject($state['session']->state->entry->values),
                'responseAttack' => self::responseAttack($mount),
            ];
        }
        return (object) [
            'mounts' => (object) $mounts,
            'operations' => array_map(static fn (array $value): stdClass => (object) $value, $root['operations']),
            'security' => array_map(static fn (array $value): stdClass => (object) $value, $root['security']),
        ];
    }

    private static function buildSession(string $repositoryRoot, string $mount): stdClass
    {
        $path = $repositoryRoot . '/schemas/examples/authoring-session.example.json';
        $json = file_get_contents($path);
        if (!is_string($json)) {
            throw new RuntimeException('The canonical authoring-session fixture is unavailable.');
        }
        $snapshot = json_decode($json, false, 128, JSON_THROW_ON_ERROR);
        if (!($snapshot instanceof stdClass)) {
            throw new RuntimeException('The canonical authoring-session fixture is invalid.');
        }

        $owner = (object) ['id' => 'studio.e2e/php-host', 'version' => '1.0.0'];
        $model = (object) [
            'id' => 'studio.e2e.models/' . $mount,
            'version' => '1.0.0',
            'revision' => 'model-' . $mount . '-r1',
        ];
        $blueprint = (object) [
            'id' => 'studio.e2e.blueprints/' . $mount,
            'version' => '1.0.0',
            'revision' => 'blueprint-' . $mount . '-r1',
        ];
        $entry = (object) [
            'id' => 'studio-e2e/' . $mount . '/entry',
            'revision' => 'entry-' . $mount . '-r7',
        ];
        $type = (object) [
            'id' => 'studio.e2e.types/' . $mount,
            'version' => '1.0.0',
            'revision' => 'type-' . $mount . '-r1',
        ];
        $resourceContext = (object) [
            'key' => 'contexts/php-e2e-' . $mount,
            'surface' => 'studio.e2e/content-editor',
            'revision' => 'context-' . $mount . '-r1',
            'scopes' => [(object) ['kind' => 'studio.scope/site', 'id' => 'sites/' . $mount]],
            'resource' => (object) [
                'type' => 'studio.e2e/content',
                'id' => $entry->id,
            ],
        ];

        $snapshot->sessionId = 'sessions/php-e2e-' . $mount;
        $snapshot->sessionGeneration = 'session-' . $mount . '-r1';
        $snapshot->contributionGeneration = 'contributions-' . $mount . '-r1';
        $snapshot->target->id = 'studio.e2e/' . $mount . '-content';
        $snapshot->target->owner = self::cloneObject($owner);
        $snapshot->target->label = (object) [
            'key' => 'studio.e2e/' . $mount . '-content',
            'defaultMessage' => ucfirst($mount) . ' PHP content',
        ];
        $snapshot->target->surface = $resourceContext->surface;
        $snapshot->target->resourceTypes = [$resourceContext->resource->type];
        $snapshot->target->saveOutcomes = ['save-item'];
        $snapshot->resourceContext = self::cloneObject($resourceContext);
        $snapshot->start = (object) ['kind' => 'existing'];
        $snapshot->presentation = (object) [
            'current' => 'inline',
            'returnContext' => (object) ['key' => 'returns/php-e2e-' . $mount],
        ];

        $snapshot->state->coordinates = (object) [
            'type' => self::cloneObject($type),
            'model' => self::cloneObject($model),
            'blueprint' => self::cloneObject($blueprint),
            'entry' => self::cloneObject($entry),
        ];
        $snapshot->state->model->id = $model->id;
        $snapshot->state->model->version = $model->version;
        $snapshot->state->model->revision = $model->revision;
        $snapshot->state->model->owner = self::cloneObject($owner);
        $snapshot->state->model->label = (object) [
            'key' => 'studio.e2e/' . $mount . '-model',
            'defaultMessage' => ucfirst($mount) . ' content',
        ];
        $snapshot->state->model->fields[0]->label = (object) [
            'key' => 'studio.e2e/name',
            'defaultMessage' => 'Name',
        ];

        $snapshot->state->blueprint->id = $blueprint->id;
        $snapshot->state->blueprint->version = $blueprint->version;
        $snapshot->state->blueprint->revision = $blueprint->revision;
        $snapshot->state->blueprint->owner = self::cloneObject($owner);
        $snapshot->state->blueprint->model = self::cloneObject($model);
        $snapshot->state->blueprint->roots = [
            (object) [
                'id' => 'node-' . $mount . '-content',
                'type' => 'studio.core/rich-text',
                'version' => '1.0.0',
                'properties' => (object) [],
                'bindings' => (object) [],
                'slots' => (object) [],
                'authoring' => (object) ['mode' => 'content'],
            ],
        ];
        $snapshot->state->blueprint->dependencyLock = (object) [
            'theme' => (object) [
                'id' => 'studio.e2e.themes/default',
                'version' => '1.0.0',
                'revision' => 'theme-default-r1',
            ],
            'blocks' => [
                (object) [
                    'type' => 'studio.core/rich-text',
                    'version' => '1.0.0',
                    'revision' => 'production-rich-text-r1',
                ],
            ],
        ];

        $snapshot->state->entry->id = $entry->id;
        $snapshot->state->entry->revision = $entry->revision;
        $snapshot->state->entry->model = self::cloneObject($model);
        $snapshot->state->entry->values = (object) ['name' => ucfirst($mount) . ' initial'];
        $snapshot->state->dirty = [];
        $snapshot->capabilities->saveOutcomes = ['save-item'];

        $snapshot->type->id = $type->id;
        $snapshot->type->version = $type->version;
        $snapshot->type->revision = $type->revision;
        $snapshot->type->label = (object) [
            'key' => 'studio.e2e/' . $mount . '-type',
            'defaultMessage' => ucfirst($mount) . ' page',
        ];
        $snapshot->type->model = self::cloneObject($model);
        $snapshot->type->blueprint = self::cloneObject($blueprint);

        return $snapshot;
    }

    /** @return array<string, mixed> */
    private static function &root(): array
    {
        $root = &$_SESSION[self::SESSION_KEY];
        if (!is_array($root)) {
            throw new RuntimeException('The PHP browser qualification session is unavailable.');
        }
        return $root;
    }

    /** @return array{csrfToken: string, routePrefix: string, saveSerial: int, session: stdClass} */
    private static function mountState(string $mount): array
    {
        $state = self::root()['mounts'][$mount] ?? null;
        if (!is_array($state) || !($state['session'] ?? null) instanceof stdClass) {
            throw new RuntimeException('Unknown PHP browser qualification mount.');
        }
        return $state;
    }

    /** @param array<string, string> $headers */
    private static function singleHeader(array $headers, string $expected): ?string
    {
        $value = null;
        foreach ($headers as $name => $candidate) {
            if (strcasecmp($name, $expected) !== 0) {
                continue;
            }
            if ($value !== null) {
                return null;
            }
            $value = $candidate;
        }
        return $value;
    }

    private static function cloneObject(stdClass $value): stdClass
    {
        $cloned = self::cloneValue($value);
        if (!($cloned instanceof stdClass)) {
            throw new RuntimeException('Expected an object clone.');
        }
        return $cloned;
    }

    private static function cloneValue(mixed $value): mixed
    {
        return json_decode(
            json_encode($value, JSON_THROW_ON_ERROR | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE),
            false,
            128,
            JSON_THROW_ON_ERROR,
        );
    }
}

final class QualificationApplication implements AuthoringApplicationService
{
    public function __construct(private readonly string $mount)
    {
    }

    public function resolveTarget(stdClass $request, AuthoringCallContext $context): mixed
    {
        $this->record('authoring/resolve-target', $request, $context);
        if ($this->mount === 'refused') {
            throw new HostFailure(
                'forbidden',
                'studio.e2e/resource-forbidden',
                'The PHP host refused this resource for authoring.',
            );
        }
        if ($this->mount === 'conflict') {
            throw new HostFailure(
                'conflict',
                'studio.e2e/resource-conflict',
                'The PHP host reported an authoritative conflict for this resource.',
                false,
                null,
                'entry-conflict-authoritative-r9',
            );
        }
        $session = QualificationState::session($this->mount);
        return (object) [
            'target' => $session->target,
            'resourceContext' => $session->resourceContext,
            'availableStarts' => ['existing'],
            'initialPresentation' => 'inline',
            'returnContext' => $session->presentation->returnContext,
        ];
    }

    public function listTypes(stdClass $query, AuthoringCallContext $context): mixed
    {
        $this->record('authoring/list-types', $query, $context);
        return (object) ['items' => []];
    }

    public function start(stdClass $request, AuthoringCallContext $context): mixed
    {
        $context->requireIdempotencyKey();
        $this->record('authoring/start', $request, $context);
        $session = QualificationState::session($this->mount);
        if (
            ($request->targetId ?? null) !== $session->target->id
            || ($request->source->kind ?? null) !== 'existing'
        ) {
            throw new HostFailure(
                'forbidden',
                'studio.e2e/start-forbidden',
                'The PHP host rejected the requested authoring start.',
            );
        }
        return $session;
    }

    public function planSave(stdClass $intent, AuthoringCallContext $context): mixed
    {
        $this->record('authoring/plan-save', $intent, $context);
        $session = QualificationState::session($this->mount);
        if (
            ($intent->kind ?? null) !== 'authoring-save-intent'
            || ($intent->sessionId ?? null) !== $session->sessionId
            || ($intent->draft->outcome ?? null) !== 'save-item'
            || $intent->expected != $session->state->coordinates
        ) {
            throw new HostFailure(
                'conflict',
                'studio.e2e/save-intent-stale',
                'The PHP host rejected a stale save intent.',
                false,
                null,
                $session->state->entry->revision,
            );
        }
        $plan = (object) [
            'contractVersion' => $session->contractVersion,
            'kind' => 'authoring-save-plan',
            'id' => 'save-plans/php-e2e-' . $this->mount,
            'revision' => 'save-plan-' . $this->mount . '-r1',
            'successorContext' => (object) [
                'key' => 'returns/php-e2e-' . $this->mount . '/accepted-entry',
            ],
            'sessionId' => $session->sessionId,
            'outcome' => 'save-item',
            'expected' => QualificationState::session($this->mount)->state->coordinates,
            'affectedArtifacts' => ['entry'],
            'consequences' => [
                (object) [
                    'code' => 'studio.e2e/confirm-save',
                    'message' => (object) [
                        'key' => 'studio.e2e/confirm-save',
                        'defaultMessage' => 'Confirm the PHP-authoritative item save.',
                    ],
                    'severity' => 'warning',
                ],
            ],
            'confirmationRequired' => true,
        ];
        QualificationState::storePlan($this->mount, $intent, $plan);
        return $plan;
    }

    public function saveItem(stdClass $request, AuthoringCallContext $context): mixed
    {
        $context->requireIdempotencyKey();
        $this->record('authoring/save-item', $request, $context);
        $stored = QualificationState::plan($this->mount);
        $session = QualificationState::session($this->mount);
        $plan = $stored['plan'];
        $planReference = (object) [
            'id' => $plan->id,
            'revision' => $plan->revision,
            'successorContext' => $plan->successorContext,
        ];
        if (
            ($request->kind ?? null) !== 'authoring-save-item-request'
            || ($request->plan ?? null) != $planReference
            || ($request->acceptedConsequences ?? null) !== [self::confirmationCode()]
            || ($request->draft->outcome ?? null) !== 'save-item'
            || ($request->draft->entry->id ?? null) !== $session->state->entry->id
            || $plan->expected != $session->state->coordinates
        ) {
            throw new HostFailure(
                'conflict',
                'studio.e2e/save-request-stale',
                'The PHP host rejected a stale or unconfirmed save request.',
                false,
                null,
                $session->state->entry->revision,
            );
        }

        $acceptedEntry = QualificationState::cloneSubmittedEntry($request->draft->entry);
        $acceptedEntry->revision = QualificationState::nextSaveRevision($this->mount);
        $session->state->entry = $acceptedEntry;
        $session->state->coordinates->entry = (object) [
            'id' => $acceptedEntry->id,
            'revision' => $acceptedEntry->revision,
        ];
        $session->state->dirty = [];
        $session->presentation->returnContext = $plan->successorContext;
        QualificationState::replaceSession($this->mount, $session);

        return (object) [
            'contractVersion' => $session->contractVersion,
            'kind' => 'authoring-save-result',
            'outcome' => 'save-item',
            'plan' => $planReference,
            'session' => $session,
        ];
    }

    public function saveNewTypeVersion(stdClass $request, AuthoringCallContext $context): mixed
    {
        $context->requireIdempotencyKey();
        $this->record('authoring/save-new-type-version', $request, $context);
        throw $this->unsupportedOutcome();
    }

    public function saveAsNewType(stdClass $request, AuthoringCallContext $context): mixed
    {
        $context->requireIdempotencyKey();
        $this->record('authoring/save-as-new-type', $request, $context);
        throw $this->unsupportedOutcome();
    }

    private function record(string $route, stdClass $argument, AuthoringCallContext $context): void
    {
        QualificationState::recordOperation($this->mount, $route, $argument, $context);
    }

    private function unsupportedOutcome(): HostFailure
    {
        return new HostFailure(
            'forbidden',
            'studio.e2e/outcome-forbidden',
            'This PHP qualification fixture authorizes save item only.',
        );
    }

    private static function confirmationCode(): string
    {
        return 'studio.e2e/confirm-save';
    }
}

final class QualificationServer
{
    public const ORIGIN = 'http://127.0.0.1:4174';

    public static function sessionCookieIsAuthenticated(): bool
    {
        $cookie = $_COOKIE[session_name()] ?? null;
        return is_string($cookie) && $cookie !== '' && hash_equals(session_id(), $cookie);
    }
}
