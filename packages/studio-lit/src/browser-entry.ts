/**
 * Host-neutral entry point for the prebuilt Studio browser distribution.
 *
 * This module deliberately contains no session, actor, target, endpoint, or
 * persistence configuration. A host imports it as ordinary ESM, registers the
 * elements or invokes the explicit mount API. Standalone mode stays local;
 * hosted mode uses only the supplied canonical transport and session.
 */
export * from './index.js';

export {
  activateStudioPlugin,
  ContributionRuntime,
  createCoreProductionBlockDefinitions,
  createCoreProductionPatterns,
  defineStudioPlugin,
  openContextualStudioSession,
  type OpenContextualStudioSessionOptions,
  type StudioContextualHostSessionHandle,
  type StudioContextualSession,
} from '@kumwe/studio-core';

export {
  STUDIO_CONTRACT_VERSION,
  STUDIO_WIRE_PROTOCOL_VERSION,
  type AuthoringSessionSnapshot,
  type AuthoringStartRequest,
  type AuthoringTargetDeclaration,
  type AuthoringTargetResolveRequest,
  type BlockDefinition,
  type ExperimentalShellConfiguration,
  type FieldAdapterContribution,
  type HostAdapter,
  type HostRequestContext,
  type OwnerReference,
  type PatternDocument,
  type PluginContributionDeclaration,
  type PluginContributionKind,
  type PluginManifest,
  type QualifiedName,
  type StudioDeploymentConfiguration,
  type StudioHostedDeploymentConfiguration,
  type StudioStandaloneDeploymentConfiguration,
} from '@kumwe/studio-protocol';

import {
  defineKumweStudio,
  defineKumweStudioContextual,
  defineKumweStudioStandalone,
} from './index.js';

/** Register all public Studio custom elements exactly once. */
export function defineStudioBrowserElements(): void {
  defineKumweStudio();
  defineKumweStudioContextual();
  defineKumweStudioStandalone();
}
