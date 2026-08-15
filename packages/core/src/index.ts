export {
  canonicalStringify,
  canonicalUtf8Bytes,
  type CanonicalSerializationOptions,
} from './canonical.js';
export {
  applyCommand,
  invertCommand,
  StudioCommandError,
  type InverseCommandOptions,
  type StudioCommandErrorCode,
} from './commands.js';
export {
  ContributionRuntime,
  RegistryGeneration,
  StudioContributionError,
  type ExtensionContributions,
  type ExtensionInventory,
  type GenerationOptions,
  type UnresolvedNodeReport,
} from './contributions.js';
export { applyEntryCommand } from './entry-commands.js';
export { StudioHistory } from './history.js';
export {
  MigrationRunner,
  StudioMigrationError,
  type MigratableArtifactKind,
  type MigratableDocument,
  type MigrationApplyOptions,
  type MigrationApplyResult,
  type MigrationDescriptor,
} from './migrations.js';
export {
  negotiateCapabilities,
  type CapabilityNegotiationOptions,
  type CapabilityNegotiationResult,
} from './negotiation.js';
export {
  compareSemanticVersions,
  normalizeVersionRange,
  parseSemanticVersion,
  satisfiesVersionRange,
  type ParsedSemanticVersion,
} from './semver.js';
export { StudioSession, type StudioSessionOptions } from './session.js';
export {
  BlockRegistry,
  type BlockRegistrationOptions,
  type ResolvedBlockRegistration,
} from './registry.js';
export { assertStudioPropertySchema, STUDIO_SCHEMA_PROFILE_LIMITS } from './schema-profile.js';
export {
  validateBlueprint,
  type BlueprintValidationOptions,
  type BlueprintValidationResult,
} from './validation.js';
