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
  negotiateCapabilities,
  type CapabilityNegotiationOptions,
  type CapabilityNegotiationResult,
} from './negotiation.js';
export { StudioSession, type StudioSessionOptions } from './session.js';
export {
  BlockRegistry,
  type BlockRegistrationOptions,
  type ResolvedBlockRegistration,
} from './registry.js';
export { assertStudioPropertySchema } from './schema-profile.js';
export {
  validateBlueprint,
  type BlueprintValidationOptions,
  type BlueprintValidationResult,
} from './validation.js';
