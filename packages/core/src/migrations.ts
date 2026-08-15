import type {
  JsonValue,
  OwnerReference,
  QualifiedName,
  SemanticVersion,
  StudioDiagnostic,
} from '@kumwe/studio-protocol';
import { cloneContractValue } from './clone.js';
import { normalizeVersionRange, parseSemanticVersion, satisfiesVersionRange } from './semver.js';

export type MigratableArtifactKind =
  'block-definition' | 'blueprint' | 'content-model' | 'entry' | 'theme';

export interface MigratableDocument {
  kind: string;
  version: SemanticVersion;
  [member: string]: JsonValue | undefined;
}

export interface MigrationDescriptor {
  artifactKinds: readonly MigratableArtifactKind[];
  description: string;
  id: QualifiedName;
  lossClassification: 'lossless' | 'lossy';
  migrate(document: MigratableDocument): MigratableDocument;
  owner: OwnerReference;
  sourceVersions: string;
  targetVersion: SemanticVersion;
}

export interface MigrationApplyOptions {
  confirmLossy?: boolean;
  validate?(document: MigratableDocument): StudioDiagnostic[];
}

export interface MigrationApplyResult {
  diagnostics: StudioDiagnostic[];
  document: MigratableDocument;
  migrationId: QualifiedName;
}

export class StudioMigrationError extends Error {
  public readonly code:
    | 'already-applied'
    | 'confirmation-required'
    | 'duplicate-migration'
    | 'invalid-result'
    | 'not-applicable'
    | 'unknown-migration';
  public readonly diagnostics: StudioDiagnostic[];

  public constructor(
    code: StudioMigrationError['code'],
    message: string,
    diagnostics: StudioDiagnostic[] = [],
  ) {
    super(message);
    this.name = 'StudioMigrationError';
    this.code = code;
    this.diagnostics = diagnostics;
  }
}

/**
 * The deterministic migration runner the versioning contract defines.
 * Migration operates on a copy, validates the complete result before
 * acceptance, never mutates or replaces the original revision, refuses
 * lossy transformations without explicit confirmation, and rejects
 * reapplication once a document has left a migration's source range.
 */
export class MigrationRunner {
  readonly #migrations = new Map<QualifiedName, MigrationDescriptor>();

  public register(migration: MigrationDescriptor): void {
    if (this.#migrations.has(migration.id)) {
      throw new StudioMigrationError(
        'duplicate-migration',
        `Migration ${migration.id} is already registered.`,
      );
    }
    if (migration.artifactKinds.length === 0) {
      throw new StudioMigrationError(
        'not-applicable',
        `Migration ${migration.id} declares no artifact kinds.`,
      );
    }
    normalizeVersionRange(migration.sourceVersions);
    parseSemanticVersion(migration.targetVersion);
    if (satisfiesVersionRange(migration.targetVersion, migration.sourceVersions)) {
      throw new StudioMigrationError(
        'invalid-result',
        `Migration ${migration.id} targets a version inside its own source range, so reapplication could never be rejected.`,
      );
    }
    this.#migrations.set(migration.id, migration);
  }

  public migrations(): MigrationDescriptor[] {
    return [...this.#migrations.values()];
  }

  /** Ordered migrations whose source range and artifact kind match the document. */
  public plan(document: Readonly<MigratableDocument>): MigrationDescriptor[] {
    return this.migrations()
      .filter(
        (migration) =>
          migration.artifactKinds.includes(document.kind as MigratableArtifactKind) &&
          satisfiesVersionRange(document.version, migration.sourceVersions),
      )
      .sort((left, right) => (left.id < right.id ? -1 : 1));
  }

  public apply(
    document: Readonly<MigratableDocument>,
    migrationId: QualifiedName,
    options: Readonly<MigrationApplyOptions> = {},
  ): MigrationApplyResult {
    const migration = this.#migrations.get(migrationId);
    if (migration === undefined) {
      throw new StudioMigrationError(
        'unknown-migration',
        `Migration ${migrationId} is not registered.`,
      );
    }
    if (!migration.artifactKinds.includes(document.kind as MigratableArtifactKind)) {
      throw new StudioMigrationError(
        'not-applicable',
        `Migration ${migrationId} does not cover ${document.kind} artifacts.`,
      );
    }
    if (!satisfiesVersionRange(document.version, migration.sourceVersions)) {
      const code =
        document.version === migration.targetVersion ? 'already-applied' : 'not-applicable';
      throw new StudioMigrationError(
        code,
        `Document version ${document.version} is outside the source range of ${migrationId}.`,
      );
    }
    if (migration.lossClassification === 'lossy' && options.confirmLossy !== true) {
      throw new StudioMigrationError(
        'confirmation-required',
        `Migration ${migrationId} is lossy and requires explicit confirmation.`,
      );
    }

    const migrated = migration.migrate(cloneContractValue(document));
    const diagnostics: StudioDiagnostic[] = [];
    if (migrated.kind !== document.kind) {
      throw new StudioMigrationError(
        'invalid-result',
        `Migration ${migrationId} changed the artifact kind from ${document.kind} to ${migrated.kind}.`,
      );
    }
    if (migrated.version !== migration.targetVersion) {
      throw new StudioMigrationError(
        'invalid-result',
        `Migration ${migrationId} produced version ${migrated.version}, not the declared target ${migration.targetVersion}.`,
      );
    }
    if (options.validate !== undefined) {
      const validationDiagnostics = options.validate(migrated);
      diagnostics.push(...validationDiagnostics);
      if (
        validationDiagnostics.some(
          (entry) => entry.severity === 'blocking' || entry.severity === 'error',
        )
      ) {
        throw new StudioMigrationError(
          'invalid-result',
          `Migration ${migrationId} produced an invalid document.`,
          validationDiagnostics,
        );
      }
    }

    return {
      diagnostics,
      document: migrated,
      migrationId,
    };
  }
}
