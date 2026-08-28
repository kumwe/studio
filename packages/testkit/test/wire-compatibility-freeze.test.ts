import { describe, expect, it } from 'vitest';
import {
  authoringSaveSchema,
  authoringSessionSchema,
  authoringTargetSchema,
  hostOperationsSchema,
  protocolSchemas,
  reusableContentTypeSchema,
  type JsonSchema,
  type JsonValue,
} from '@kumwe/studio-protocol';

const SCHEMA_EPOCH = 'https://schemas.kumwe.org/studio/v1/';

const AUTHORING_OPERATION_CAPABILITIES = [
  'studio.operation/authoring.list-types',
  'studio.operation/authoring.plan-save',
  'studio.operation/authoring.resolve-target',
  'studio.operation/authoring.save-as-new-type',
  'studio.operation/authoring.save-item',
  'studio.operation/authoring.save-new-type-version',
  'studio.operation/authoring.start',
] as const;

const AUTHORING_OPERATION_ROUTES = [
  'authoring/list-types',
  'authoring/plan-save',
  'authoring/resolve-target',
  'authoring/save-as-new-type',
  'authoring/save-item',
  'authoring/save-new-type-version',
  'authoring/start',
] as const;

describe('Kumwe App wire compatibility freeze', () => {
  it('keeps every canonical schema in the published /v1/ epoch', () => {
    expect(protocolSchemas.length).toBeGreaterThan(0);
    for (const schema of protocolSchemas) {
      expect(schema.$id).toMatch(new RegExp(`^${escapeRegularExpression(SCHEMA_EPOCH)}`));
    }
  });

  it('keeps the seven authoring operation capabilities and routes byte-exact', () => {
    const definitions = definitionsOf(hostOperationsSchema);
    expect(
      stringEnum(definitions.operationCapability).filter((value) =>
        value.startsWith('studio.operation/authoring.'),
      ),
    ).toEqual(AUTHORING_OPERATION_CAPABILITIES);
    expect(
      stringEnum(definitions.operationRoute).filter((value) => value.startsWith('authoring/')),
    ).toEqual(AUTHORING_OPERATION_ROUTES);
    expect(Object.keys(definitions)).toEqual(
      expect.arrayContaining([
        'operationCapability',
        'operationRoute',
        'portCapability',
        'portName',
      ]),
    );
  });

  it.each([
    [
      authoringTargetSchema,
      [
        'presentationState',
        'saveOutcome',
        'startKind',
        'eligibility',
        'capabilityRequirement',
        'contributionDependency',
        'declaration',
        'resolveRequest',
        'resolution',
      ],
    ],
    [
      authoringSessionSchema,
      [
        'startSource',
        'startRequest',
        'artifactCoordinates',
        'artifactState',
        'capabilities',
        'presentation',
        'snapshot',
      ],
    ],
    [
      authoringSaveSchema,
      [
        'artifactKind',
        'saveItemDraft',
        'saveNewTypeVersionDraft',
        'saveAsNewTypeDraft',
        'saveDraft',
        'saveIntent',
        'planReference',
        'savePlan',
        'acceptedConsequences',
        'saveItemRequest',
        'saveNewTypeVersionRequest',
        'saveAsNewTypeRequest',
        'saveResult',
      ],
    ],
    [
      reusableContentTypeSchema,
      ['reference', 'authoringPolicy', 'definition', 'summary', 'listQuery', 'listPage'],
    ],
  ] as const)(
    'preserves every App-pinned named definition in its schema',
    (schema, requiredDefinitions) => {
      const definitions = definitionsOf(schema);
      expect(Object.keys(definitions)).toEqual(
        expect.arrayContaining(Array.from(requiredDefinitions)),
      );
    },
  );
});

function definitionsOf(schema: JsonSchema): Record<string, JsonValue> {
  const definitions = schema.$defs;
  if (definitions === undefined || !isJsonRecord(definitions)) {
    throw new TypeError('Expected a schema with named definitions.');
  }
  return definitions;
}

function stringEnum(value: JsonValue | undefined): readonly string[] {
  if (!isJsonRecord(value) || !Array.isArray(value.enum)) {
    throw new TypeError('Expected a string enum definition.');
  }
  if (!value.enum.every((member): member is string => typeof member === 'string')) {
    throw new TypeError('Expected every enum member to be a string.');
  }
  return value.enum;
}

function isJsonRecord(value: JsonValue | undefined): value is Record<string, JsonValue> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function escapeRegularExpression(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
}
