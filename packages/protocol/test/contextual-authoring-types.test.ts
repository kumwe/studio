import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  STUDIO_CONTRACT_VERSION,
  type AuthoringArtifactCoordinates,
  type AuthoringSaveAsNewTypeRequest,
  type AuthoringSaveItemRequest,
  type AuthoringSaveNewTypeVersionRequest,
  type AuthoringStartRequest,
  type AuthoringTargetDeclaration,
  type HostAdapter,
  type ReusableContentTypeDefinition,
} from '../src/index.js';

const resourceContext = {
  key: 'contexts/product-42',
  resource: { id: 'products/42', type: 'org.example.catalog/product' as const },
  scopes: [{ id: 'tenants/north', kind: 'org.example/tenant' as const }],
  surface: 'org.example.catalog/product-editor' as const,
};

describe('contextual authoring protocol', () => {
  it('keeps target discovery bounded and explicitly resource-bound', () => {
    const target: AuthoringTargetDeclaration = {
      contractVersion: STUDIO_CONTRACT_VERSION,
      contributionDependencies: [],
      eligibility: ['create', 'edit'],
      id: 'org.example.catalog/product-content',
      kind: 'authoring-target',
      label: { key: 'org.example.catalog/product-content' },
      modes: ['model', 'blueprint', 'content'],
      owner: { id: 'org.example/catalog', version: '1.0.0' },
      presentationStates: ['inline', 'fullscreen'],
      requiredCapabilities: [],
      resourceTypes: ['org.example.catalog/product'],
      saveOutcomes: ['save-item', 'save-new-type-version', 'save-as-new-type'],
      startKinds: ['blank', 'from-type', 'existing'],
      surface: 'org.example.catalog/product-editor',
    };
    const start: AuthoringStartRequest = {
      resourceContext,
      source: { kind: 'existing' },
      targetId: target.id,
    };

    expect(start.resourceContext.resource?.id).toBe('products/42');
    expect(target.saveOutcomes).toHaveLength(3);
  });

  it('keeps reusable types separate from Entry values and coordinates all three artifacts', () => {
    const reusableTypeReference = {
      id: 'types/product',
      revision: 'type-r1',
      version: '1.0.0',
    };
    const coordinates: AuthoringArtifactCoordinates = {
      blueprint: { id: 'blueprints/product', revision: 'blueprint-r1', version: '1.0.0' },
      entry: { id: 'products/42', revision: 'entry-r7' },
      model: { id: 'models/product', revision: 'model-r1', version: '1.0.0' },
      type: reusableTypeReference,
    };
    const type: ReusableContentTypeDefinition = {
      authoringPolicy: { itemComposition: 'overrides', modes: ['blueprint', 'content'] },
      blueprint: coordinates.blueprint,
      contractVersion: STUDIO_CONTRACT_VERSION,
      id: reusableTypeReference.id,
      kind: 'reusable-content-type',
      label: { key: 'org.example.catalog/product-type' },
      model: coordinates.model,
      revision: reusableTypeReference.revision,
      status: 'published',
      version: reusableTypeReference.version,
    };

    expect(type).not.toHaveProperty('values');
    expect(coordinates.entry.revision).toBe('entry-r7');
  });

  it('publishes three distinct save request discriminators on the authoring port', () => {
    const plan = {
      id: 'plans/save-1',
      revision: 'plan-r1',
      successorContext: { key: 'returns/products/42-r8' },
    };
    const requests = [
      {
        acceptedConsequences: [],
        contractVersion: STUDIO_CONTRACT_VERSION,
        draft: { entry: {} as never, outcome: 'save-item' },
        kind: 'authoring-save-item-request',
        plan,
      } satisfies AuthoringSaveItemRequest,
      {
        acceptedConsequences: [],
        contractVersion: STUDIO_CONTRACT_VERSION,
        draft: { blueprint: {} as never, model: {} as never, outcome: 'save-new-type-version' },
        kind: 'authoring-save-new-type-version-request',
        plan,
      } satisfies AuthoringSaveNewTypeVersionRequest,
      {
        acceptedConsequences: [],
        contractVersion: STUDIO_CONTRACT_VERSION,
        draft: {
          authoringPolicy: { itemComposition: 'denied', modes: ['content'] },
          blueprint: {} as never,
          label: { key: 'org.example.catalog/new-type' },
          model: {} as never,
          outcome: 'save-as-new-type',
        },
        kind: 'authoring-save-as-new-type-request',
        plan,
      } satisfies AuthoringSaveAsNewTypeRequest,
    ];

    expect(requests.map(({ draft }) => draft.outcome)).toEqual([
      'save-item',
      'save-new-type-version',
      'save-as-new-type',
    ]);

    const adapter: Pick<HostAdapter, 'authoring'> = {};
    expect(adapter.authoring).toBeUndefined();
  });

  it('binds every contextual operation to the closed host registry', async () => {
    const registry = JSON.parse(
      await readFile(join(process.cwd(), 'schemas/examples/host-operations.example.json'), 'utf8'),
    ) as { operations: { capability: string; port: string }[] };
    const authoringOperations = registry.operations
      .filter(({ port }) => port === 'authoring')
      .map(({ capability }) => capability)
      .sort();

    expect(authoringOperations).toEqual([
      'studio.operation/authoring.list-types',
      'studio.operation/authoring.plan-save',
      'studio.operation/authoring.resolve-target',
      'studio.operation/authoring.save-as-new-type',
      'studio.operation/authoring.save-item',
      'studio.operation/authoring.save-new-type-version',
      'studio.operation/authoring.start',
    ]);
  });
});
