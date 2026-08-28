export {
  canonicalStringify,
  canonicalUtf8Bytes,
  type CanonicalSerializationOptions,
} from './canonical.js';
export {
  projectBlueprintFieldBindings,
  type BlueprintFieldBindingProjection,
  type FieldBindingCandidate,
  type FieldBindingPortProjection,
  type FieldBindingProjectionStatus,
  type NodeFieldBindingProjection,
} from './binding-projection.js';
export {
  isAuthoringSaveIntent,
  isAuthoringSessionSnapshot,
  openContextualStudioSession,
  preflightContextualStudioSession,
  type OpenContextualStudioSessionOptions,
  type PreflightContextualStudioSessionOptions,
  type StudioContextualArtifactStateVersions,
  type StudioContextualDirtyArtifacts,
  type StudioContextualHostSessionHandle,
  type StudioContextualPreflightHandle,
  type StudioContextualSaveIntentOptions,
  type StudioContextualSession,
  type StudioContextualTypeCatalog,
} from './contextual-session.js';
export {
  assertStudioDeploymentConfiguration,
  validateStudioDeploymentConfiguration,
} from './deployment-validation.js';
export {
  assertStudioTokenLifetime,
  isAuthenticationLifetimeFailure,
  isStudioTokenLifetimeValid,
  STUDIO_TOKEN_MAXIMUM_LIFETIME_MILLISECONDS,
  type StudioTokenLifetime,
} from './authentication-lifetime.js';
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
  type AuthoringTargetRuntimeOptions,
  type ResolvedAuthoringTarget,
  type StudioCompositionContribution,
  type StudioCompositionContributionKind,
  type StudioLifecycleContribution,
  type StudioLifecycleContributionKind,
  type UnresolvedNodeReport,
} from './contributions.js';
export {
  activateStudioPlugin,
  defineStudioPlugin,
  unresolvedDeclaredContributions,
  type StudioPluginDefinition,
} from './extension-sdk.js';
export { applyEntryCommand } from './entry-commands.js';
export { StudioHistory } from './history.js';
export {
  CORE_LAYOUT_BLOCK_TYPES,
  CORE_LAYOUT_THEME_CONTROLS,
  CoreLayoutError,
  coreLayoutInitialProperties,
  createCoreLayoutBlockDefinitions,
  isCoreLayoutBlockType,
  resolveCoreLayoutIntent,
  type CoreLayoutAlignment,
  type CoreLayoutBlockDefinitionOptions,
  type CoreLayoutBlockType,
  type CoreLayoutCollapse,
  type CoreLayoutDirection,
  type CoreLayoutErrorCode,
  type CoreLayoutIntent,
  type CoreLayoutPropertyResolution,
  type CoreLayoutSpacing,
  type CoreLayoutVisibility,
} from './layout.js';
export {
  CORE_PRODUCTION_BLOCK_TYPES,
  CORE_PRODUCTION_CONTROL_IDS,
  CORE_PRODUCTION_PATTERN_IDS,
  coreProductionInitialProperties,
  createCoreProductionBlockDefinitions,
  createCoreProductionPatterns,
  isCoreProductionBlockType,
  type CoreProductionBlockTypeMap,
  type CoreProductionControlIdMap,
  type CoreProductionBlockType,
} from './production.js';
export {
  parseStudioChartSpec,
  parseStudioDrawingDocument,
  parseStudioMoneyValue,
  parseStudioPresentationIntent,
  parseStudioTableDocument,
} from './production-values.js';
export {
  openStudioSession,
  STUDIO_RESOURCE_SEARCH_LIMITS,
  StudioHostSessionError,
  type OpenStudioSessionOptions,
  type StudioHostSessionErrorCode,
  type StudioHostSessionHandle,
  type StudioHostSessionIdentifierFactories,
  type StudioHostSessionModels,
  type StudioHostSessionRecovery,
  type StudioHostSessionResources,
} from './host-session.js';
export {
  AUTHORING_HTTP_OPERATIONS,
  AUTHORING_HTTP_OPERATIONS_BY_ROUTE,
  AUTHORING_HTTP_SCHEMA_ID,
  type AuthoringHttpOperationContract,
  type AuthoringHttpOperationRegistry,
  type AuthoringHttpRoute,
  type HttpSchemaValidator,
} from './http-authoring-contract.js';
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
export { applyModelCommand } from './model-commands.js';
export {
  permittedCommandTypes,
  resolveSessionMode,
  STUDIO_SESSION_MODES,
  type StudioCommandType,
} from './modes.js';
export { RECIPE_MARKER_PROPERTY, recipeSelectionOperations } from './recipes.js';
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
  assertBlueprintWithinSessionPolicy,
  assertEntryWithinSessionPolicy,
  assertModelWithinSessionPolicy,
  STUDIO_PROTOCOL_MAXIMUM_COMMAND_POLICY_LIMITS,
  type StudioCommandPolicyLimits,
  type StudioSessionPolicyOptions,
} from './session-policy.js';
export { parseJsonRejectingDuplicateMembers } from './strict-json.js';
export {
  BlockRegistry,
  type BlockRegistrationOptions,
  type ResolvedBlockRegistration,
} from './registry.js';
export {
  assertStudioPropertySchema,
  compileStudioPropertySchema,
  STUDIO_SCHEMA_PROFILE_ERROR_CODES,
  STUDIO_SCHEMA_PROFILE_LIMITS,
  StudioSchemaProfileError,
  type StudioPropertySchemaValidator,
  type StudioSchemaProfileErrorCode,
} from './schema-profile.js';
export {
  STUDIO_DEFAULT_URL_POLICY,
  validateExternalUrl,
  type ExternalUrlPolicy,
  type ExternalUrlRejectionReason,
  type ExternalUrlValidationResult,
} from './url-policy.js';
export {
  validateBlueprint,
  type BlueprintValidationOptions,
  type BlueprintValidationResult,
} from './validation.js';
