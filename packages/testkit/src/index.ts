import {
  BlockRegistry,
  compileStudioPropertySchema,
  projectBlueprintFieldBindings,
  StudioSchemaProfileError,
  validateBlueprint,
  type StudioSchemaProfileErrorCode,
} from '@kumwe/studio-core';
import {
  STUDIO_CONTRACT_VERSION,
  STUDIO_WIRE_PROTOCOL_VERSION,
  type BlockDefinition,
  type BlockSlotDefinition,
  type BlockType,
  type BlueprintDocument,
  type BlueprintBlockLock,
  type BlueprintNode,
  type ContentFieldKind,
  type ContentModelDocument,
  type DiagnosticLocation,
  type FieldDefinition,
  type JsonSchema,
  type StudioConfiguration,
  type StudioDiagnostic,
} from '@kumwe/studio-protocol';

export {
  createHostRequestContextFixture,
  createTestbedHost,
  TestbedHostError,
  type HostRequestContextFixtureOptions,
  type TestbedAuthoringOperation,
  type TestbedAuthoringOptions,
  type TestbedAuthoringPlanFixture,
  type TestbedAuthoringSaveFixture,
  type TestbedAuthoringSaveRequest,
  type TestbedAuthoringStartFixture,
  type TestbedAuthoringTargetFixture,
  type TestbedAuthoringTypeFixture,
  type TestbedControls,
  type TestbedHost,
  type TestbedHostOptions,
  type TestbedPortName,
  type TestbedRateLimitPolicy,
} from './host-testbed.js';

export {
  createHttpHostAdapter,
  HTTP_HOST_OPERATION_ROUTES,
  type ConfiguredHttpHostAdapterOptions,
  type HttpAuthenticationConfiguration,
  type HttpAuthenticationRequest,
  type HttpAuthenticationResolver,
  type HttpBearerTokenAuthentication,
  type HttpFetchLike,
  type HttpHeaderTokenAuthentication,
  type HttpHostAdapterOptions,
  type HttpHostOperationEndpoints,
  type HttpHostOperationRoute,
  type HttpHostRoutingConfiguration,
  type HttpHostTransportConfiguration,
  type HttpRequestInit,
  type HttpResponseLike,
  type HttpSameOriginSessionAuthentication,
  type HttpTimeoutHandle,
} from './http-host-adapter.js';

export {
  AUTHORING_HTTP_OPERATIONS,
  AUTHORING_HTTP_OPERATIONS_BY_ROUTE,
  AUTHORING_HTTP_SCHEMA_ID,
  type AuthoringHttpOperationContract,
  type AuthoringHttpRoute,
  type HttpSchemaValidator,
} from './http-authoring-contract.js';

export {
  createAuthoringHttpResponder,
  type AuthoringHttpResponderOptions,
  type HttpResponderRequest,
  type HttpResponderResponse,
  type HttpTransportSecurityDecision,
  type HttpTransportSecurityInput,
  type HttpTransportSecurityVerifier,
} from './http-host-responder.js';

export {
  runAuthoringWebVector,
  type AuthoringWebAction,
  type AuthoringWebCommandObservation,
  type AuthoringWebConformanceAdapter,
  type AuthoringWebConformanceSession,
  type AuthoringWebGiven,
  type AuthoringWebLane,
  type AuthoringWebLaneResult,
  type AuthoringWebObservation,
  type AuthoringWebRegion,
  type AuthoringWebVector,
  type AuthoringWebVectorResult,
} from './web-conformance.js';

export {
  runContextualAuthoringStrideVector,
  type ContextualAuthoringCommandAssertion,
  type ContextualAuthoringConformanceAdapter,
  type ContextualAuthoringConformanceSession,
  type ContextualAuthoringLaunchAssertion,
  type ContextualAuthoringSaveAssertion,
  type ContextualAuthoringSaveRequest,
  type ContextualAuthoringStrideResult,
  type ContextualAuthoringStrideVector,
} from './contextual-conformance.js';

export interface BlueprintFixtureOptions {
  blockLocks?: BlueprintBlockLock[];
  id?: string;
  revision?: string;
  roots?: BlueprintNode[];
}

export interface TestBlockOptions {
  label?: string;
  propertySchema?: JsonSchema;
  slots?: BlockSlotDefinition[];
  type: BlockType;
  version?: string;
}

export interface StudioConfigurationFixtureOptions {
  composite?: 'hybrid' | 'single';
  mode?: 'blueprint' | 'content' | 'model';
  sessionState?: 'editable' | 'read-only';
}

export interface SchemaProfileVectorInstance {
  value: unknown;
  valid: boolean;
}

/** Portable input consumed by `studio.profile/binding-projection-v1`. */
export interface BindingProjectionVectorInput {
  blockDefinitions: readonly BlockDefinition[];
  blueprint: BlueprintDocument;
  model: ContentModelDocument;
}

export interface BindingProjectionVectorCandidateResult {
  cardinality: FieldDefinition['cardinality'];
  control?: string;
  fieldPath: string[];
  itemKind?: Exclude<ContentFieldKind, 'collection'>;
  kind: ContentFieldKind;
}

export interface BindingProjectionVectorPortResult {
  bindingSourceKind?: string;
  boundFieldPath?: string[];
  candidates: BindingProjectionVectorCandidateResult[];
  multiple?: boolean;
  port: string;
  required?: boolean;
  status: 'invalid' | 'non-field-source' | 'resolved' | 'unbound';
  valueType?: string;
}

export interface BindingProjectionVectorRunResult {
  diagnostics: {
    code: string;
    location?: DiagnosticLocation;
    severity: StudioDiagnostic['severity'];
  }[];
  model: BlueprintDocument['model'];
  nodes: { nodeId: string; ports: BindingProjectionVectorPortResult[] }[];
}

/**
 * Replays a binding vector without consulting its expected projection. The
 * normalized result intentionally excludes localized labels and prose so a
 * non-TypeScript host compares stable coordinates, controls, outcomes, and
 * diagnostic locations rather than an English rendering.
 */
export function runBindingProjectionVector(
  vector: BindingProjectionVectorInput,
): BindingProjectionVectorRunResult {
  const projection = projectBlueprintFieldBindings(
    vector.blueprint,
    vector.model,
    vector.blockDefinitions,
  );
  return cloneValue({
    diagnostics: projection.diagnostics.map((entry) => ({
      code: entry.code,
      ...(entry.location === undefined ? {} : { location: entry.location }),
      severity: entry.severity,
    })),
    model: projection.model,
    nodes: projection.nodes.map((node) => ({
      nodeId: node.nodeId,
      ports: node.ports.map((port) => ({
        ...(port.binding === undefined ? {} : { bindingSourceKind: port.binding.source.kind }),
        ...(port.boundFieldPath === undefined ? {} : { boundFieldPath: [...port.boundFieldPath] }),
        candidates: port.candidates.map((candidate) => ({
          cardinality: candidate.cardinality,
          ...(candidate.control === undefined ? {} : { control: candidate.control }),
          fieldPath: [...candidate.fieldPath],
          ...(candidate.itemKind === undefined ? {} : { itemKind: candidate.itemKind }),
          kind: candidate.kind,
        })),
        ...(port.multiple === undefined ? {} : { multiple: port.multiple }),
        port: port.port,
        ...(port.required === undefined ? {} : { required: port.required }),
        status: port.status,
        ...(port.valueType === undefined ? {} : { valueType: port.valueType }),
      })),
    })),
  });
}

export interface SchemaProfileVectorInput {
  expect: { outcome: 'accepted' | 'rejected' };
  schema: unknown;
}

export interface SchemaProfileVectorInstanceResult {
  diagnostic?: { instancePath: string; keyword: string };
  value: unknown;
  valid: boolean;
}

export type SchemaProfileVectorRunResult =
  | {
      instances: SchemaProfileVectorInstanceResult[];
      outcome: 'accepted';
    }
  | {
      code: StudioSchemaProfileErrorCode;
      outcome: 'rejected';
      schemaPath: string;
    };

/**
 * Replay a portable `studio.profile/schema-property` vector against the
 * reference implementation. Only each case's input `value` is read from the
 * accepted expectation; expected verdicts and diagnostics are not consulted.
 * Callers compare this independently produced outcome with the published
 * `expect` member.
 */
export function runSchemaProfileVector(
  vector: SchemaProfileVectorInput & { expect: { instances?: SchemaProfileVectorInstance[] } },
): SchemaProfileVectorRunResult {
  try {
    const validator = compileStudioPropertySchema(vector.schema);
    const instances = (vector.expect.instances ?? []).map((entry) => {
      const valid = validator.validate(entry.value);
      const first = validator.errors?.[0];
      return {
        ...(first === undefined
          ? {}
          : { diagnostic: { instancePath: first.instancePath, keyword: first.keyword } }),
        valid,
        value: entry.value,
      };
    });
    return { instances, outcome: 'accepted' };
  } catch (error) {
    if (error instanceof StudioSchemaProfileError) {
      return {
        code: error.code,
        outcome: 'rejected',
        schemaPath: error.schemaPath,
      };
    }
    throw error;
  }
}

export function createBlueprintFixture(options: BlueprintFixtureOptions = {}): BlueprintDocument {
  return {
    contractVersion: STUDIO_CONTRACT_VERSION,
    dependencyLock: {
      blocks: cloneValue(options.blockLocks ?? []),
      theme: { id: 'studio.test/theme', revision: 'theme-r1', version: '1.0.0' },
    },
    id: options.id ?? 'test.blueprint',
    kind: 'blueprint',
    label: { defaultMessage: 'Test Blueprint', key: 'studio.test/blueprint' },
    model: { id: 'studio.test/model', revision: 'model-r1', version: '1.0.0' },
    owner: { id: 'studio.test/testkit', version: '0.1.0-alpha.0' },
    revision: options.revision ?? 'blueprint-r1',
    roots: cloneValue(options.roots ?? []),
    status: 'draft',
    version: '1.0.0',
  };
}

export function defineTestBlock(options: TestBlockOptions): BlockDefinition {
  const label = options.label ?? 'Test block';
  return {
    accessibility: {
      accessibleName: 'not-applicable',
      category: 'structural',
      keyboard: { defaultMessage: 'Use outline commands.', key: 'studio.test/block-keyboard' },
      outputChecks: ['studio.check/test-block'],
      reducedMotion: 'not-applicable',
    },
    category: 'studio.category/test',
    contractVersion: STUDIO_CONTRACT_VERSION,
    editingModes: ['blueprint', 'content'],
    kind: 'block-definition',
    label: { defaultMessage: label, key: 'studio.test/block-label' },
    owner: { id: 'studio.test/testkit', version: '0.1.0-alpha.0' },
    ports: [],
    propertySchema: cloneValue(
      options.propertySchema ?? { additionalProperties: false, type: 'object' },
    ),
    rendererRequirements: [
      { capability: 'studio.renderer/test', surface: 'preview', versions: '^0.1.0' },
    ],
    revision: 'block-r1',
    slots: cloneValue(options.slots ?? []),
    themeControls: [],
    type: options.type,
    version: options.version ?? '1.0.0',
  };
}

export function createStudioConfigurationFixture(
  options: StudioConfigurationFixtureOptions = {},
): StudioConfiguration {
  return {
    actor: { displayName: 'Test Author', id: 'users/test-author' },
    artifacts: {},
    blocks: [],
    composite: options.composite ?? 'single',
    contractVersion: STUDIO_CONTRACT_VERSION,
    displayPreferences: {
      calendar: 'gregory',
      hourCycle: 'h23',
      measurementSystem: 'metric',
      numberingSystem: 'latn',
    },
    features: {
      clipboardMediaUpload: false,
      collaboration: false,
      customInspectors: false,
      executablePlugins: false,
      externalMediaImport: false,
      offlineRecovery: false,
    },
    hostCapabilities: {
      capabilities: [],
      contractVersion: STUDIO_CONTRACT_VERSION,
      host: { generation: 'host-r1', id: 'studio.test/host', version: '1.0.0' },
      kind: 'host-capabilities',
      ports: [],
      protocolVersions: [STUDIO_WIRE_PROTOCOL_VERSION],
    },
    limits: {
      maxChildrenPerSlot: 1_000,
      maxCommandBatch: 100,
      maxContributionsPerPlugin: 500,
      maxDepth: 32,
      maxExtensionBytes: 1_048_576,
      maxHistoryEntries: 100,
      maxLocaleBytes: 1_048_576,
      maxMediaBatch: 50,
      maxMediaUploadBytes: 1_073_741_824,
      maxNodes: 5_000,
      maxPluginCount: 20,
      maxPreviewBytes: 10_485_760,
      maxPreviewRequestsPerMinute: 120,
      maxPropertyBytes: 1_048_576,
      maxRichTextBytes: 1_048_576,
      maxRichTextDepth: 32,
      maxSlotsPerNode: 20,
    },
    locale: {
      direction: 'ltr',
      fallbacks: [],
      requested: 'en',
      resolved: 'en',
      timeZone: 'UTC',
    },
    mode: options.mode ?? 'blueprint',
    permissions: [],
    plugins: [],
    protocolVersion: STUDIO_WIRE_PROTOCOL_VERSION,
    preview: { allowApproximateRenderer: false, enabled: false, sameOriginRequired: true },
    sessionGeneration: 'session-r1',
    sessionId: 'session-test',
    sessionState: options.sessionState ?? 'editable',
    resourceContext: {
      key: 'contexts/test',
      scopes: [],
      surface: 'studio.test/fixture',
    },
  };
}

export function assertBlueprintConforms(
  blueprint: BlueprintDocument,
  definitions: readonly BlockDefinition[],
): void {
  const result = validateBlueprint(blueprint, new BlockRegistry(definitions));
  if (!result.valid) {
    throw new StudioConformanceError(result.diagnostics);
  }
}

export class StudioConformanceError extends Error {
  public readonly diagnostics: StudioDiagnostic[];

  public constructor(diagnostics: StudioDiagnostic[]) {
    super(
      diagnostics
        .map((entry) => `${entry.code}: ${entry.message.defaultMessage ?? entry.message.key}`)
        .join('\n'),
    );
    this.name = 'StudioConformanceError';
    this.diagnostics = cloneValue(diagnostics);
  }
}

function cloneValue<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}
