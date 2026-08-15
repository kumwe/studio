import { describe, expect, it } from 'vitest';
import type { OwnerReference } from '@kumwe/studio-protocol';
import {
  compareSemanticVersions,
  MigrationRunner,
  normalizeVersionRange,
  satisfiesVersionRange,
  type MigratableDocument,
  type MigrationDescriptor,
} from '../src/index.js';

const owner: OwnerReference = { id: 'studio.test/migrations', version: '1.0.0' };

function renameTextMigration(overrides: Partial<MigrationDescriptor> = {}): MigrationDescriptor {
  return {
    artifactKinds: ['blueprint'],
    description: 'Rename the text property to body.',
    id: 'studio.migration/rename-text',
    lossClassification: 'lossless',
    migrate: (document) => {
      const properties = (document.properties ?? {}) as Record<string, unknown>;
      const { text, ...rest } = properties;
      return {
        ...document,
        properties: text === undefined ? rest : { ...rest, body: text },
        version: '2.0.0',
      } as MigratableDocument;
    },
    owner,
    sourceVersions: '>=1.0.0 <2.0.0',
    targetVersion: '2.0.0',
    ...overrides,
  };
}

function document(version = '1.2.0'): MigratableDocument {
  return {
    kind: 'blueprint',
    properties: { text: 'Hello' },
    version,
  };
}

describe('semantic version support', () => {
  it('orders versions by SemVer precedence including prerelease rules', () => {
    expect(compareSemanticVersions('1.0.0', '1.0.0')).toBe(0);
    expect(compareSemanticVersions('1.0.0-alpha', '1.0.0')).toBe(-1);
    expect(compareSemanticVersions('1.0.0-alpha.1', '1.0.0-alpha.beta')).toBe(-1);
    expect(compareSemanticVersions('1.0.0-beta.11', '1.0.0-rc.1')).toBe(-1);
    expect(compareSemanticVersions('2.0.0', '1.99.99')).toBe(1);
    expect(compareSemanticVersions('1.0.0+build.1', '1.0.0+build.2')).toBe(0);
  });

  it('expands caret and tilde shorthands with their conventional bounds', () => {
    expect(normalizeVersionRange('^1.2.3')).toBe('>=1.2.3 <2.0.0-0');
    expect(normalizeVersionRange('^0.2.3')).toBe('>=0.2.3 <0.3.0-0');
    expect(normalizeVersionRange('^0.0.3')).toBe('>=0.0.3 <0.0.4-0');
    expect(normalizeVersionRange('~1.2.3')).toBe('>=1.2.3 <1.3.0-0');
  });

  it('evaluates the supported range grammar and rejects the rest', () => {
    expect(satisfiesVersionRange('1.5.0', '>=1.0.0 <2.0.0')).toBe(true);
    expect(satisfiesVersionRange('2.0.0', '>=1.0.0 <2.0.0')).toBe(false);
    expect(satisfiesVersionRange('1.2.5', '~1.2.3')).toBe(true);
    expect(satisfiesVersionRange('1.3.0', '~1.2.3')).toBe(false);
    expect(satisfiesVersionRange('1.9.9', '^1.2.3')).toBe(true);
    expect(satisfiesVersionRange('2.0.0', '^1.2.3')).toBe(false);
    expect(satisfiesVersionRange('1.0.0', '1.0.0')).toBe(true);
    expect(() => satisfiesVersionRange('1.0.0', '>=1 <2')).toThrow(TypeError);
    expect(() => satisfiesVersionRange('1.0.0', '1.x')).toThrow(TypeError);
    expect(() => satisfiesVersionRange('1.0.0', '>=1.0.0 || >=2.0.0')).toThrow(TypeError);
  });
});

describe('MigrationRunner', () => {
  it('applies a migration on a copy and never mutates the original', () => {
    const runner = new MigrationRunner();
    runner.register(renameTextMigration());
    const before = document();
    const pristine = structuredClone(before);

    const result = runner.apply(before, 'studio.migration/rename-text');
    expect(result.document.version).toBe('2.0.0');
    expect(result.document.properties).toEqual({ body: 'Hello' });
    expect(before).toStrictEqual(pristine);
  });

  it('plans only migrations whose kind and source range match', () => {
    const runner = new MigrationRunner();
    runner.register(renameTextMigration());
    runner.register(
      renameTextMigration({
        artifactKinds: ['entry'],
        id: 'studio.migration/entry-only',
      }),
    );
    expect(runner.plan(document()).map((entry) => entry.id)).toEqual([
      'studio.migration/rename-text',
    ]);
    expect(runner.plan(document('2.0.0'))).toEqual([]);
  });

  it('rejects reapplication once the document reached the target version', () => {
    const runner = new MigrationRunner();
    runner.register(renameTextMigration());
    const migrated = runner.apply(document(), 'studio.migration/rename-text').document;
    expect(() => runner.apply(migrated, 'studio.migration/rename-text')).toThrow(
      expect.objectContaining({ code: 'already-applied' }) as Error,
    );
  });

  it('requires explicit confirmation for lossy migrations', () => {
    const runner = new MigrationRunner();
    runner.register(renameTextMigration({ lossClassification: 'lossy' }));
    expect(() => runner.apply(document(), 'studio.migration/rename-text')).toThrow(
      expect.objectContaining({ code: 'confirmation-required' }) as Error,
    );
    expect(
      runner.apply(document(), 'studio.migration/rename-text', { confirmLossy: true }).document
        .version,
    ).toBe('2.0.0');
  });

  it('rejects results that change kind, miss the target version, or fail validation', () => {
    const runner = new MigrationRunner();
    runner.register(
      renameTextMigration({
        id: 'studio.migration/wrong-kind',
        migrate: (input) => ({ ...input, kind: 'entry', version: '2.0.0' }),
      }),
    );
    runner.register(
      renameTextMigration({
        id: 'studio.migration/wrong-version',
        migrate: (input) => ({ ...input, version: '3.0.0' }),
      }),
    );
    runner.register(renameTextMigration());

    expect(() => runner.apply(document(), 'studio.migration/wrong-kind')).toThrow(
      expect.objectContaining({ code: 'invalid-result' }) as Error,
    );
    expect(() => runner.apply(document(), 'studio.migration/wrong-version')).toThrow(
      expect.objectContaining({ code: 'invalid-result' }) as Error,
    );
    expect(() =>
      runner.apply(document(), 'studio.migration/rename-text', {
        validate: () => [
          {
            code: 'studio.test/broken',
            message: { key: 'studio.test/broken' },
            severity: 'error',
          },
        ],
      }),
    ).toThrow(expect.objectContaining({ code: 'invalid-result' }) as Error);
  });

  it('refuses duplicate registrations, unknown migrations, and self-including ranges', () => {
    const runner = new MigrationRunner();
    runner.register(renameTextMigration());
    expect(() => runner.register(renameTextMigration())).toThrow(
      expect.objectContaining({ code: 'duplicate-migration' }) as Error,
    );
    expect(() => runner.apply(document(), 'studio.migration/unknown')).toThrow(
      expect.objectContaining({ code: 'unknown-migration' }) as Error,
    );
    expect(() =>
      runner.register(
        renameTextMigration({
          id: 'studio.migration/self-including',
          sourceVersions: '>=1.0.0 <3.0.0',
        }),
      ),
    ).toThrow(expect.objectContaining({ code: 'invalid-result' }) as Error);
  });

  it('rejects migrations for other artifact kinds', () => {
    const runner = new MigrationRunner();
    runner.register(renameTextMigration());
    const entry = { ...document(), kind: 'entry' };
    expect(() => runner.apply(entry, 'studio.migration/rename-text')).toThrow(
      expect.objectContaining({ code: 'not-applicable' }) as Error,
    );
  });
});
