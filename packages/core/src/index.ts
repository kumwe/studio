export { applyCommand, StudioCommandError, type StudioCommandErrorCode } from './commands.js';
export { StudioHistory } from './history.js';
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
