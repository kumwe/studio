import { KumweStudioElement } from './kumwe-studio.js';
import { KumweStudioContextualElement } from './contextual-authoring.js';

export {
  createStudioStandaloneSetup,
  type StudioStandaloneExtensions,
  type StudioStandaloneSetup,
} from './bootstrap.js';

export {
  autoMountStudio,
  mountStudio,
  mountStudioFromConfigElement,
  parseStudioDeploymentConfiguration,
  resolveStudioDeploymentRuntime,
  type StudioAutoMountFailure,
  type StudioAutoMountFailurePhase,
  type StudioAutoMountOptions,
  type StudioAutoMountReport,
  type StudioDeploymentRuntimeHandle,
  type StudioDeploymentRuntimeResolver,
  type StudioHostedRuntimeOptionsFactory,
  type StudioMountHandle,
  type StudioMountOptions,
} from './browser-mount.js';

export {
  AUTHORING_HTTP_OPERATIONS,
  AUTHORING_HTTP_OPERATIONS_BY_ROUTE,
  AUTHORING_HTTP_SCHEMA_ID,
  createBrowserHttpHostAdapter,
  createHttpHostAdapter,
  HTTP_HOST_OPERATION_ROUTES,
  type AuthoringHttpOperationContract,
  type AuthoringHttpOperationRegistry,
  type AuthoringHttpRoute,
  type BrowserConfiguredHttpHostAdapterOptions,
  type BrowserHttpHostAdapterOptions,
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
  type HttpSchemaValidator,
  type HttpTimeoutHandle,
} from './http.js';

export {
  clearStudioHostedErrorSurface,
  createBrowserSessionIdentifierFactories,
  mountStudioHosted,
  type StudioBrowserCryptography,
  type StudioHostedAdmittedContributions,
  type StudioHostedHostErrorDetail,
  type StudioHostedRuntimeHandle,
  type StudioHostedRuntimeOptions,
  type StudioHostedSaveCompleteDetail,
  type StudioHostedSaveConfirmationHandler,
  type StudioHostedSaveConfirmationDetail,
  type StudioHostedSaveConfirmationRequest,
} from './hosted-runtime.js';

export {
  parseScopedCss,
  serializeScopedCss,
  STUDIO_AUTHORING_CONTROL_IDS,
  StudioAuthoringControlRegistry,
  type StudioAuthoringControlChange,
  type StudioAuthoringControlHandle,
  type StudioAuthoringControlId,
  type StudioAuthoringControlIdMap,
  type StudioAuthoringControlOptions,
  type StudioAuthoringControlServices,
  type StudioCodeFieldAdapter,
  type StudioCodeFieldHandle,
  type StudioCodeFieldOptions,
  type StudioExtensionAuthoringControl,
  type StudioSourcePreviewAdapter,
  type StudioSourcePreviewValue,
} from './authoring-controls.js';
export type { StudioMediaAuthoringServices } from './media-authoring-control.js';
export type {
  StudioHostedMediaGrantChunk,
  StudioHostedMediaGrantTransfer,
} from './hosted-media-upload.js';
export {
  isStudioResourceReference,
  mountStudioResourceBindingControl,
  type StudioResourceBindingChange,
  type StudioResourceBindingControlHandle,
  type StudioResourceBindingControlOptions,
  type StudioResourceSearchService,
  type StudioResourceTypeOption,
} from './resource-authoring-control.js';

export function defineKumweStudio(tagName = 'kumwe-studio'): void {
  if (customElements.get(tagName) === undefined) {
    customElements.define(tagName, KumweStudioElement);
  }
}

/** Register the canonical resource-bound shell and its internal Blueprint canvas. */
export function defineKumweStudioContextual(tagName = 'kumwe-studio-contextual'): void {
  defineKumweStudio();
  if (customElements.get(tagName) === undefined) {
    customElements.define(tagName, KumweStudioContextualElement);
  }
}

export {
  createStudioAuthoringSaveIntent,
  KumweStudioContextualElement,
  STUDIO_CONTEXTUAL_MODES,
  STUDIO_CONTEXTUAL_PRESENTATIONS,
  STUDIO_CONTEXTUAL_SAVE_OUTCOMES,
  type StudioContextualAdmittedContributions,
  type StudioContextualChangeDetail,
  type StudioContextualDirtyState,
  type StudioContextualModeChangeDetail,
  type StudioContextualPresentationChangeDetail,
  type StudioContextualSaveRequestDetail,
  type StudioContextualStateVersions,
} from './contextual-authoring.js';

export {
  STUDIO_CONTEXTUAL_RETURN_REQUEST_EVENT,
  type StudioContextualReturnRequestDetail,
} from './hosted-return.js';

export {
  createStudioStandaloneProject,
  createStudioStandaloneRuntime,
  defineKumweStudioStandalone,
  KumweStudioStandaloneElement,
  mountStudioStandalone,
  parseStudioStandaloneProject,
  serializeStudioStandaloneProject,
  serializeStudioStandaloneSaveIntent,
  type StudioStandaloneDownload,
  type StudioStandaloneDownloadHandler,
  type StudioStandaloneRuntimeHandle,
  type StudioStandaloneRuntimeOptions,
} from './standalone-runtime.js';

export {
  KumweStudioElement,
  type StudioDirtyChangedDetail,
  type StudioDocumentChangeDetail,
  type StudioInsertRequestDetail,
  type StudioScopedStyleChangeDetail,
  type StudioViewportChangeDetail,
} from './kumwe-studio.js';
export {
  type StudioPreviewBinding,
  type StudioPreviewDraftIdentity,
  type StudioPreviewGeometry,
  type StudioPreviewStageOptions,
  type StudioPreviewState,
} from './preview-surface.js';
export {
  messageText,
  studioMessageCatalog,
  studioMessages,
  type StudioMessage,
  type StudioMessageCatalog,
  type StudioMessageCatalogEntry,
  type StudioMessageKey,
  type StudioMessageOverrides,
} from './messages.js';

declare global {
  interface HTMLElementTagNameMap {
    'kumwe-studio': KumweStudioElement;
  }
}
