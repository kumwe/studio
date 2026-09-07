import { describe, expect, it } from 'vitest';
import {
  assertBlueprintConforms,
  createBlueprintFixture,
  defineTestBlock,
  StudioConformanceError,
} from '../src/index.js';
import type { StudioDiagnostic } from '@kumwe/studio-protocol';

describe('Studio testkit', () => {
  it('exposes a typed refusal when a fixture names an unavailable block', () => {
    const blueprint = createBlueprintFixture({
      roots: [
        {
          authoring: { mode: 'content' },
          id: 'missing-1',
          type: 'example/missing',
          version: '1.0.0',
          properties: {},
          bindings: {},
          slots: {},
        },
      ],
    });
    try {
      assertBlueprintConforms(blueprint, []);
      throw new Error('An unavailable block must fail conformance.');
    } catch (error) {
      expect(error).toBeInstanceOf(StudioConformanceError);
      const failure = error as StudioConformanceError;
      expect(failure.name).toBe('StudioConformanceError');
      expect(failure.diagnostics).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            code: 'studio.validation/block-unavailable',
            severity: 'error',
          }),
        ]),
      );
      expect(failure.message).toContain('Block example/missing@1.0.0 is not registered.');
    }
  });

  it('preserves diagnostic order, fallback wording and source snapshot isolation', () => {
    const diagnostics: StudioDiagnostic[] = [
      {
        code: 'example/first',
        severity: 'error',
        message: { key: 'example/first', defaultMessage: 'First refusal' },
        parameters: { field: 'original' },
      },
      { code: 'example/second', severity: 'warning', message: { key: 'example/fallback' } },
    ];
    const failure = new StudioConformanceError(diagnostics);
    const expected = structuredClone(diagnostics);
    const first = diagnostics[0];
    if (first?.parameters === undefined) {
      throw new Error('The diagnostic fixture must declare its first parameter.');
    }
    first.message.defaultMessage = 'Changed after construction';
    first.parameters.field = 'changed';
    diagnostics.reverse();
    expect(failure.message).toBe('example/first: First refusal\nexample/second: example/fallback');
    expect(failure.diagnostics).toEqual(expected);
  });

  it('builds and validates a conforming canonical fixture', () => {
    const block = defineTestBlock({ label: 'Text', type: 'studio.core/text' });
    const blueprint = createBlueprintFixture({
      blockLocks: [{ revision: block.revision, type: block.type, version: block.version }],
      roots: [
        {
          authoring: { mode: 'content' },
          bindings: {},
          id: 'text-1',
          properties: {},
          slots: {},
          type: 'studio.core/text',
          version: '1.0.0',
        },
      ],
    });

    expect(() => assertBlueprintConforms(blueprint, [block])).not.toThrow();
  });
});
