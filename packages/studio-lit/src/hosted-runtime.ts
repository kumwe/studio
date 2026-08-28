import {
  ContributionRuntime,
  assertStudioDeploymentConfiguration,
  createCoreProductionBlockDefinitions,
  createCoreProductionPatterns,
  preflightContextualStudioSession,
  type ExtensionContributions,
  type StudioContextualHostSessionHandle,
  type StudioContextualPreflightHandle,
  type StudioHostSessionIdentifierFactories,
} from '@kumwe/studio-core';
import {
  STUDIO_CONTRACT_VERSION,
  isHostPortFailure,
  type AuthoringSaveIntent,
  type AuthoringSavePlan,
  type AuthoringSaveResult,
  type AuthoringTargetResolveRequest,
  type DesignVocabulary,
  type HostPortError,
  type OwnerReference,
  type QualifiedName,
  type StudioDeploymentContributionPayload,
  type StudioHostedDeploymentConfiguration,
} from '@kumwe/studio-protocol';
import { StudioAuthoringControlRegistry } from './authoring-controls.js';
import {
  createBrowserHttpHostAdapter,
  type BrowserConfiguredHttpHostAdapterOptions,
} from './browser-http-host-adapter.js';
import {
  KumweStudioContextualElement,
  type StudioContextualAdmittedContributions,
  type StudioContextualSaveRequestDetail,
} from './contextual-authoring.js';
import { resolveStudioHostedPolicyCatalog } from './hosted-policy.js';
import type { StudioHostedMediaGrantTransfer } from './hosted-media-upload.js';
import {
  assertHostedCapabilityRoutes,
  coordinateHostedIdentifiers,
  createHostedBrowserServices,
} from './hosted-services.js';
import { startHostedCreateSession } from './hosted-start.js';
import { KumweStudioElement } from './kumwe-studio.js';

const HOST_ERROR_EVENT = 'studio-host-error';
const SAVE_CONFIRMATION_EVENT = 'studio-contextual-save-confirmation-required';
const SAVE_COMPLETE_EVENT = 'studio-contextual-save-complete';

export interface StudioBrowserCryptography {
  randomUUID(): `${string}-${string}-${string}-${string}-${string}`;
}

export interface StudioHostedRuntimeOptions {
  /** Browser transport/test seams; routing and static authentication still come only from JSON. */
  readonly adapter?: BrowserConfiguredHttpHostAdapterOptions;
  /**
   * Precompiled executable controls. The runtime scopes this registry to the
   * field-adapter declarations admitted by the resolved target.
   */
  readonly authoringControlRegistry?: StudioAuthoringControlRegistry;
  /**
   * Transfers bytes only to the short-lived grant returned by the configured
   * media adapter. Authorization, completion, and abortion cannot be replaced.
   */
  readonly mediaGrantTransfer?: StudioHostedMediaGrantTransfer;
  /**
   * Optional precompiled host confirmation UI. JSON configuration can never
   * supply this executable seam. When omitted, Studio renders its accessible
   * built-in consequence confirmation surface.
   */
  readonly saveConfirmationHandler?: StudioHostedSaveConfirmationHandler;
  /** Advanced deterministic test seam; normal browsers use cryptographic UUIDs. */
  readonly identifiers?: StudioHostSessionIdentifierFactories;
}

export interface StudioHostedSaveConfirmationRequest {
  readonly intent: AuthoringSaveIntent;
  readonly plan: AuthoringSavePlan;
}

/** `false` cancels; a consequence-code list confirms through the canonical host port. */
export type StudioHostedSaveConfirmationHandler = (
  request: StudioHostedSaveConfirmationRequest,
) => Promise<false | readonly QualifiedName[]> | false | readonly QualifiedName[];

/** The exact six declarative contribution families admitted by the resolved target. */
export type StudioHostedAdmittedContributions = StudioContextualAdmittedContributions;

export interface StudioHostedSaveConfirmationDetail {
  readonly intent: AuthoringSaveIntent;
  readonly plan: AuthoringSavePlan;
  cancel(): void;
  confirm(acceptedConsequences: readonly QualifiedName[]): Promise<AuthoringSaveResult>;
}

export interface StudioHostedSaveCompleteDetail {
  readonly result: AuthoringSaveResult;
}

export interface StudioHostedHostErrorDetail {
  readonly error: HostPortError;
  readonly operation: 'open' | 'plan-save' | 'save';
}

export interface StudioHostedRuntimeHandle {
  readonly admittedContributions: StudioHostedAdmittedContributions;
  readonly element: KumweStudioContextualElement;
  readonly pendingSaveConfirmation: AuthoringSavePlan | undefined;
  cancelPendingSave(): void;
  confirmPendingSave(acceptedConsequences: readonly QualifiedName[]): Promise<AuthoringSaveResult>;
  dispose(): void;
}

/**
 * Mount one configured, PHP/host-authoritative browser session. Configured
 * failures are surfaced and propagated; this function never changes routes,
 * invents authority, or falls back to the standalone profile.
 */
export async function mountStudioHosted(
  target: HTMLElement,
  configuration: StudioHostedDeploymentConfiguration,
  options: StudioHostedRuntimeOptions = {},
): Promise<StudioHostedRuntimeHandle> {
  clearStudioHostedErrorSurface(target);
  defineHostedStudioElements();
  const element = document.createElement('kumwe-studio-contextual');
  if (!(element instanceof KumweStudioContextualElement)) {
    throw new TypeError('The registered contextual Studio element has an incompatible class.');
  }
  const errorSurface = createHostErrorSurface();
  target.append(errorSurface);
  let hostSession: StudioContextualHostSessionHandle | undefined;
  let preflight: StudioContextualPreflightHandle | undefined;
  let confirmationSurface: HTMLElement | undefined;
  try {
    assertHostedDeployment(configuration);
    assertHostedCapabilityRoutes(configuration);
    const identifiers = coordinateHostedIdentifiers(
      options.identifiers ?? createBrowserSessionIdentifierFactories(),
    );
    const adapter = createBrowserHttpHostAdapter(configuration.transport, options.adapter);
    const targetRequest = createTargetRequest(configuration);
    preflight = await preflightContextualStudioSession(adapter, {
      configuration: configuration.session,
      identifiers,
      target: targetRequest,
    });
    hostSession =
      configuration.launch.intent === 'edit'
        ? await preflight.start({
            presentation: configuration.launch.initialPresentation,
            resourceContext: structuredClone(configuration.launch.resourceContext),
            source: structuredClone(configuration.launch.start),
            targetId: configuration.launch.targetId,
          })
        : await startHostedCreateSession(
            target,
            preflight,
            configuration.launch.start,
            configuration.launch.initialPresentation,
          );

    const admitted = resolveAdmittedContributions(configuration, hostSession, targetRequest);
    const services = createHostedBrowserServices(
      adapter,
      configuration,
      hostSession.resolution,
      identifiers,
      {
        ...(options.adapter?.currentTimeMilliseconds === undefined
          ? {}
          : { currentTimeMilliseconds: options.adapter.currentTimeMilliseconds }),
        ...(options.mediaGrantTransfer === undefined
          ? {}
          : { mediaGrantTransfer: options.mediaGrantTransfer }),
      },
    );
    element.admittedContributions = cloneAdmittedContributions(admitted);
    let authoringControlRegistry =
      options.authoringControlRegistry ?? new StudioAuthoringControlRegistry();
    if (services.media !== undefined) {
      authoringControlRegistry = authoringControlRegistry.withMediaServices(services.media);
    }
    element.authoringControlRegistry = authoringControlRegistry.forAdmittedExtensionControls(
      admitted.fieldAdapters
        .filter(
          (entry) =>
            entry.requiredCapability === undefined ||
            configuration.session.hostCapabilities.capabilities.some(
              (capability) => capability.id === entry.requiredCapability,
            ),
        )
        .map((entry) => entry.control),
    );
    element.configuration = {
      blockDefinitions: structuredClone([...admitted.blockDefinitions]),
      session: structuredClone(configuration.session),
    };
    element.contextualSession = hostSession.session;
    const admittedDesignControls = mergeAdmittedDesignControls(admitted.designVocabularies);
    element.designControls =
      admittedDesignControls.length === 0 ? undefined : admittedDesignControls;
    element.patterns = structuredClone([...admitted.patterns]);
    element.resourceSearchService = services.resourceSearchService;
    element.session = hostSession.session.snapshot;

    const runtime = new HostedRuntimeHandle(
      target,
      element,
      errorSurface,
      hostSession,
      admitted,
      options.saveConfirmationHandler,
    );
    element.addEventListener('studio-contextual-save-request', runtime.onSaveRequest);
    confirmationSurface = runtime.confirmationSurface;
    target.append(element, confirmationSurface, errorSurface);
    await element.updateComplete;
    return runtime;
  } catch (error) {
    surfaceHostError(target, errorSurface, error, 'open');
    errorSurface.dataset.studioHostErrorState = 'orphaned';
    hostSession?.dispose();
    preflight?.dispose();
    confirmationSurface?.remove();
    element.remove();
    throw error;
  }
}

function defineHostedStudioElements(): void {
  if (customElements.get('kumwe-studio') === undefined) {
    customElements.define('kumwe-studio', KumweStudioElement);
  }
  if (customElements.get('kumwe-studio-contextual') === undefined) {
    customElements.define('kumwe-studio-contextual', KumweStudioContextualElement);
  }
}

/** Remove a retained failed-open alert before a host intentionally retries or navigates away. */
export function clearStudioHostedErrorSurface(target: HTMLElement): void {
  for (const child of [...target.children]) {
    if (
      child instanceof HTMLElement &&
      child.dataset.studioHostError === 'true' &&
      child.dataset.studioHostErrorState === 'orphaned'
    ) {
      child.remove();
    }
  }
}

/** Allocate browser request and idempotency identifiers without clocks or weak randomness. */
export function createBrowserSessionIdentifierFactories(
  cryptography: StudioBrowserCryptography = requireBrowserCryptography(),
): StudioHostSessionIdentifierFactories {
  if (typeof cryptography.randomUUID !== 'function') {
    throw new TypeError('Studio hosted mode requires cryptographically secure browser UUIDs.');
  }
  return Object.freeze({
    idempotencyKey: () => `studio-idempotency/${cryptography.randomUUID()}`,
    requestId: () => `studio-request/${cryptography.randomUUID()}`,
  });
}

class HostedRuntimeHandle implements StudioHostedRuntimeHandle {
  readonly #admittedContributions: StudioHostedAdmittedContributions;
  readonly #confirmationHandler: StudioHostedSaveConfirmationHandler | undefined;
  readonly #confirmationSurface: StudioHostedConfirmationSurface;
  readonly #errorSurface: HTMLElement;
  readonly #hostSession: StudioContextualHostSessionHandle;
  public readonly element: KumweStudioContextualElement;
  #disposed = false;
  #pending: PendingSave | undefined;
  #saveActive = false;

  public constructor(
    target: HTMLElement,
    element: KumweStudioContextualElement,
    errorSurface: HTMLElement,
    hostSession: StudioContextualHostSessionHandle,
    admittedContributions: StudioHostedAdmittedContributions,
    confirmationHandler: StudioHostedSaveConfirmationHandler | undefined,
  ) {
    this.element = element;
    this.#errorSurface = errorSurface;
    this.#hostSession = hostSession;
    this.#admittedContributions = cloneAdmittedContributions(admittedContributions);
    this.#confirmationHandler = confirmationHandler;
    this.#confirmationSurface = createSaveConfirmationSurface(target);
  }

  public readonly onSaveRequest = (event: Event): void => {
    if (!(event instanceof CustomEvent)) return;
    // This is Studio's owned persistence boundary. The internal intent event
    // must not reach legacy ancestors and trigger a second durable save.
    event.preventDefault();
    event.stopImmediatePropagation();
    const detail = event.detail as StudioContextualSaveRequestDetail;
    void this.#planAndMaybeSave(detail.intent).catch(() => undefined);
  };

  public get admittedContributions(): StudioHostedAdmittedContributions {
    return cloneAdmittedContributions(this.#admittedContributions);
  }

  public get confirmationSurface(): HTMLElement {
    return this.#confirmationSurface.element;
  }

  public get pendingSaveConfirmation(): AuthoringSavePlan | undefined {
    return this.#pending === undefined ? undefined : structuredClone(this.#pending.plan);
  }

  public cancelPendingSave(): void {
    this.#pending = undefined;
    this.#confirmationSurface.close();
  }

  public async confirmPendingSave(
    acceptedConsequences: readonly QualifiedName[],
  ): Promise<AuthoringSaveResult> {
    this.#assertActive();
    const pending = this.#pending;
    if (pending === undefined) {
      throw new TypeError('Studio has no save consequence plan awaiting confirmation.');
    }
    this.#pending = undefined;
    this.#confirmationSurface.close();
    return this.#commit(pending.intent, pending.plan, acceptedConsequences);
  }

  public dispose(): void {
    if (this.#disposed) return;
    this.#disposed = true;
    this.#pending = undefined;
    this.#confirmationSurface.dispose();
    this.element.removeEventListener('studio-contextual-save-request', this.onSaveRequest);
    this.#hostSession.dispose();
    this.element.remove();
    this.#errorSurface.remove();
  }

  async #planAndMaybeSave(intent: AuthoringSaveIntent): Promise<AuthoringSaveResult | undefined> {
    this.#assertActive();
    if (this.#saveActive || this.#pending !== undefined) {
      throw this.#surfaceLocalFailure(
        'plan-save',
        'Another Studio save is already active or awaiting confirmation.',
      );
    }
    this.#saveActive = true;
    clearHostErrorSurface(this.#errorSurface);
    let plan: AuthoringSavePlan;
    try {
      plan = (await this.#hostSession.planSave(intent)).value;
    } catch (error) {
      surfaceHostError(this.element, this.#errorSurface, error, 'plan-save');
      throw error;
    } finally {
      this.#saveActive = false;
    }
    if (plan.confirmationRequired) {
      const pending = {
        intent: structuredClone(intent),
        plan: structuredClone(plan),
      };
      this.#pending = pending;
      const detail: StudioHostedSaveConfirmationDetail = Object.freeze({
        cancel: () => this.cancelPendingSave(),
        confirm: (acceptedConsequences: readonly QualifiedName[]) =>
          this.confirmPendingSave(acceptedConsequences),
        intent: structuredClone(pending.intent),
        plan: structuredClone(pending.plan),
      });
      this.element.dispatchEvent(
        new CustomEvent<StudioHostedSaveConfirmationDetail>(SAVE_CONFIRMATION_EVENT, {
          bubbles: true,
          composed: true,
          detail,
        }),
      );
      if (this.#pending !== pending) return undefined;
      if (this.#confirmationHandler !== undefined) {
        let accepted: false | readonly QualifiedName[];
        try {
          accepted = await this.#confirmationHandler({
            intent: structuredClone(pending.intent),
            plan: structuredClone(pending.plan),
          });
        } catch (error) {
          this.cancelPendingSave();
          surfaceHostError(this.element, this.#errorSurface, error, 'plan-save');
          throw error;
        }
        if (this.#pending !== pending) return undefined;
        if (accepted === false) {
          this.cancelPendingSave();
          return undefined;
        }
        return this.confirmPendingSave(accepted);
      }
      this.#confirmationSurface.open(
        plan,
        () => {
          void this.confirmPendingSave(plan.consequences.map((entry) => entry.code)).catch(
            () => undefined,
          );
        },
        () => this.cancelPendingSave(),
      );
      return undefined;
    }
    return this.#commit(intent, plan, []);
  }

  async #commit(
    intent: AuthoringSaveIntent,
    plan: AuthoringSavePlan,
    acceptedConsequences: readonly QualifiedName[],
  ): Promise<AuthoringSaveResult> {
    this.#assertActive();
    if (this.#saveActive) {
      throw this.#surfaceLocalFailure('save', 'Another Studio save is already active.');
    }
    this.#saveActive = true;
    clearHostErrorSurface(this.#errorSurface);
    try {
      const saved = await this.#hostSession.save(intent, plan, acceptedConsequences);
      if (this.#disposed) return saved.value;
      this.element.contextualSession = this.#hostSession.session;
      this.element.session = this.#hostSession.session.snapshot;
      await this.element.updateComplete;
      this.element.dispatchEvent(
        new CustomEvent<StudioHostedSaveCompleteDetail>(SAVE_COMPLETE_EVENT, {
          bubbles: true,
          composed: true,
          detail: { result: structuredClone(saved.value) },
        }),
      );
      return saved.value;
    } catch (error) {
      surfaceHostError(this.element, this.#errorSurface, error, 'save');
      throw error;
    } finally {
      this.#saveActive = false;
    }
  }

  #assertActive(): void {
    if (this.#disposed) throw new TypeError('The Studio hosted runtime is disposed.');
  }

  #surfaceLocalFailure(operation: 'plan-save' | 'save', message: string): Error {
    const error = new Error(message);
    surfaceHostError(this.element, this.#errorSurface, error, operation);
    return error;
  }
}

interface PendingSave {
  readonly intent: AuthoringSaveIntent;
  readonly plan: AuthoringSavePlan;
}

interface StudioHostedConfirmationSurface {
  readonly element: HTMLElement;
  close(): void;
  dispose(): void;
  open(plan: AuthoringSavePlan, confirm: () => void, cancel: () => void): void;
}

let confirmationSurfaceSerial = 0;

function createSaveConfirmationSurface(target: HTMLElement): StudioHostedConfirmationSurface {
  confirmationSurfaceSerial += 1;
  const documentValue = target.ownerDocument;
  const identity = `studio-save-confirmation-${String(confirmationSurfaceSerial)}`;
  const surface = documentValue.createElement('section');
  const heading = documentValue.createElement('h2');
  const explanation = documentValue.createElement('p');
  const consequences = documentValue.createElement('ul');
  const actions = documentValue.createElement('div');
  const cancelButton = documentValue.createElement('button');
  const confirmButton = documentValue.createElement('button');
  let cancelAction: (() => void) | undefined;
  let confirmAction: (() => void) | undefined;
  let returnFocus: HTMLElement | undefined;

  surface.className = 'studio-save-confirmation';
  surface.dataset.studioSaveConfirmation = 'true';
  surface.hidden = true;
  surface.setAttribute('aria-describedby', `${identity}-description ${identity}-consequences`);
  surface.setAttribute('aria-labelledby', `${identity}-title`);
  surface.setAttribute('aria-modal', 'true');
  surface.setAttribute('role', 'alertdialog');
  surface.tabIndex = -1;
  heading.id = `${identity}-title`;
  heading.textContent = 'Confirm save';
  explanation.id = `${identity}-description`;
  explanation.textContent =
    'The configured server requires confirmation of these consequences before saving.';
  consequences.id = `${identity}-consequences`;
  actions.className = 'studio-save-confirmation-actions';
  cancelButton.type = 'button';
  cancelButton.dataset.studioSaveConfirmationAction = 'cancel';
  cancelButton.textContent = 'Cancel';
  confirmButton.type = 'button';
  confirmButton.dataset.studioSaveConfirmationAction = 'confirm';
  confirmButton.textContent = 'Confirm and save';
  actions.append(cancelButton, confirmButton);
  surface.append(heading, explanation, consequences, actions);

  const close = (): void => {
    if (surface.hidden) return;
    surface.hidden = true;
    surface.removeAttribute('aria-busy');
    cancelButton.disabled = false;
    confirmButton.disabled = false;
    cancelAction = undefined;
    confirmAction = undefined;
    const focusTarget = returnFocus;
    returnFocus = undefined;
    if (focusTarget?.isConnected === true) focusTarget.focus();
  };

  cancelButton.addEventListener('click', () => cancelAction?.());
  confirmButton.addEventListener('click', () => {
    if (confirmAction === undefined) return;
    surface.setAttribute('aria-busy', 'true');
    cancelButton.disabled = true;
    confirmButton.disabled = true;
    confirmAction();
  });
  surface.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      cancelAction?.();
      return;
    }
    if (event.key !== 'Tab') return;
    const first = cancelButton;
    const last = confirmButton;
    const active = getDeepActiveElement(documentValue);
    if (event.shiftKey && active === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && active === last) {
      event.preventDefault();
      first.focus();
    }
  });

  return {
    close,
    dispose(): void {
      close();
      surface.remove();
    },
    element: surface,
    open(plan, confirm, cancel): void {
      returnFocus = getDeepActiveElement(documentValue);
      cancelAction = cancel;
      confirmAction = confirm;
      consequences.replaceChildren(
        ...plan.consequences.map((consequence) => {
          const item = documentValue.createElement('li');
          item.dataset.studioSaveConsequence = consequence.code;
          item.textContent = consequence.message.defaultMessage ?? consequence.message.key;
          return item;
        }),
      );
      surface.hidden = false;
      // The least destructive action owns initial focus.
      cancelButton.focus();
    },
  };
}

function getDeepActiveElement(documentValue: Document): HTMLElement | undefined {
  let active: Element | null = documentValue.activeElement;
  while (active?.shadowRoot !== null && active?.shadowRoot !== undefined) {
    const nested = active.shadowRoot.activeElement;
    if (nested === null) break;
    active = nested;
  }
  return active instanceof HTMLElement ? active : undefined;
}

type AdmittedBrowserContributions = StudioHostedAdmittedContributions;

function cloneAdmittedContributions(
  contributions: StudioHostedAdmittedContributions,
): StudioHostedAdmittedContributions {
  return {
    blockDefinitions: structuredClone(contributions.blockDefinitions),
    designVocabularies: structuredClone(contributions.designVocabularies),
    fieldAdapters: structuredClone(contributions.fieldAdapters),
    inspectors: structuredClone(contributions.inspectors),
    migrations: structuredClone(contributions.migrations),
    patterns: structuredClone(contributions.patterns),
  };
}

function mergeAdmittedDesignControls(
  vocabularies: readonly DesignVocabulary[],
): DesignVocabulary['designControls'] {
  const controls: DesignVocabulary['designControls'] = [];
  const identities = new Set<string>();
  for (const vocabulary of vocabularies) {
    for (const control of vocabulary.designControls) {
      if (identities.has(control.id)) {
        throw new TypeError(
          `Admitted design vocabularies declare the ${control.id} control more than once.`,
        );
      }
      identities.add(control.id);
      controls.push(structuredClone(control));
    }
  }
  return controls;
}

function resolveAdmittedContributions(
  configuration: StudioHostedDeploymentConfiguration,
  hostSession: StudioContextualHostSessionHandle,
  targetRequest: AuthoringTargetResolveRequest,
): AdmittedBrowserContributions {
  const snapshot = hostSession.session.snapshot;
  const bundle = configuration.contributions;
  if (bundle !== undefined && bundle.generation !== snapshot.contributionGeneration) {
    throw new TypeError(
      'The deployment contribution generation does not match the authorized session.',
    );
  }

  const firstPartyBlocks = createCoreProductionBlockDefinitions();
  const firstPartyPatterns = createCoreProductionPatterns();
  const payloads: StudioDeploymentContributionPayload[] = [
    ...firstPartyBlocks,
    ...firstPartyPatterns,
    ...(bundle?.payloads ?? []),
  ].map((entry) => structuredClone(entry));
  const runtime = compileContributionRuntime(
    payloads,
    snapshot.target.owner,
    snapshot.target,
    snapshot.contributionGeneration,
  );
  const resolved = runtime.current.resolveAuthoringTarget(targetRequest, {
    capabilities: configuration.session.hostCapabilities.capabilities,
    mode: configuration.session.mode,
  });
  if (resolved?.target.id !== hostSession.resolution.target.id) {
    throw new TypeError(
      'The authorized target cannot be reproduced from its admitted contribution generation.',
    );
  }

  return resolveStudioHostedPolicyCatalog({
    builtInBlockDefinitions: firstPartyBlocks,
    resolvedContributions: resolved.contributions,
    session: configuration.session,
    snapshot,
  });
}

function compileContributionRuntime(
  payloads: readonly StudioDeploymentContributionPayload[],
  targetOwner: OwnerReference,
  target: StudioContextualHostSessionHandle['resolution']['target'],
  generation: string,
): ContributionRuntime {
  const byOwner = new Map<string, OwnedContributions>();
  for (const payload of payloads) {
    const owned = ownedContributions(byOwner, payload.owner);
    appendContribution(owned.contributions, payload);
  }
  ownedContributions(byOwner, targetOwner).contributions.authoringTargets.push(
    structuredClone(target),
  );

  const owners = [...byOwner.values()].sort((left, right) =>
    left.owner.id.localeCompare(right.owner.id),
  );
  const nextAssemblyGeneration = createAssemblyGenerationAllocator(generation);
  // This runtime is construction-local and is returned only after every owner
  // activates successfully. A later rejection therefore cannot expose an
  // earlier owner's partially assembled registry.
  const runtime = new ContributionRuntime({ generation: nextAssemblyGeneration() });
  owners.forEach((owned, index) => {
    runtime.activate(owned.owner, owned.contributions, {
      generation: index === owners.length - 1 ? generation : nextAssemblyGeneration(),
    });
  });
  return runtime;
}

function createAssemblyGenerationAllocator(finalGeneration: string): () => string {
  const reserved = new Set<string>([finalGeneration]);
  let serial = 0;
  return () => {
    let candidate: string;
    do {
      serial += 1;
      candidate = `studio-browser/contributions-assembly-${String(serial)}`;
    } while (reserved.has(candidate));
    reserved.add(candidate);
    return candidate;
  };
}

interface OwnedContributions {
  readonly contributions: Required<ExtensionContributions>;
  readonly owner: OwnerReference;
}

function ownedContributions(
  groups: Map<string, OwnedContributions>,
  owner: OwnerReference,
): OwnedContributions {
  const existing = groups.get(owner.id);
  if (existing !== undefined) {
    if (existing.owner.version !== owner.version) {
      throw new TypeError(
        `Contribution owner ${owner.id} appears with more than one active version.`,
      );
    }
    return existing;
  }
  const created: OwnedContributions = {
    contributions: {
      authoringTargets: [],
      blocks: [],
      designVocabularies: [],
      fieldAdapters: [],
      inspectors: [],
      migrations: [],
      patterns: [],
    },
    owner: structuredClone(owner),
  };
  groups.set(owner.id, created);
  return created;
}

function appendContribution(
  contributions: Required<ExtensionContributions>,
  payload: StudioDeploymentContributionPayload,
): void {
  switch (payload.kind) {
    case 'block-definition':
      contributions.blocks.push(structuredClone(payload));
      return;
    case 'design-vocabulary':
      contributions.designVocabularies.push(structuredClone(payload));
      return;
    case 'field-adapter':
      contributions.fieldAdapters.push(structuredClone(payload));
      return;
    case 'inspector':
      contributions.inspectors.push(structuredClone(payload));
      return;
    case 'migration':
      contributions.migrations.push(structuredClone(payload));
      return;
    case 'pattern':
      contributions.patterns.push(structuredClone(payload));
  }
}

function assertHostedDeployment(configuration: StudioHostedDeploymentConfiguration): void {
  assertStudioDeploymentConfiguration(configuration);
  if (configuration.transport.kind !== 'http') {
    throw new TypeError('Studio hosted mode requires an explicit HTTP transport.');
  }
  if (
    configuration.contractVersion !== undefined &&
    configuration.contractVersion !== configuration.session.contractVersion
  ) {
    throw new TypeError('Studio deployment and resolved session contract versions do not match.');
  }
}

function createTargetRequest(
  configuration: StudioHostedDeploymentConfiguration,
): AuthoringTargetResolveRequest {
  return {
    intent: configuration.launch.intent,
    requestedPresentation: configuration.launch.initialPresentation,
    resourceContext: structuredClone(configuration.launch.resourceContext),
    targetId: configuration.launch.targetId,
  };
}

function requireBrowserCryptography(): StudioBrowserCryptography {
  const cryptography = globalThis.crypto;
  if (cryptography === undefined || typeof cryptography.randomUUID !== 'function') {
    throw new TypeError('Studio hosted mode requires cryptographically secure browser UUIDs.');
  }
  return cryptography;
}

function createHostErrorSurface(): HTMLElement {
  const surface = document.createElement('p');
  surface.className = 'studio-host-error';
  surface.dataset.studioHostError = 'true';
  surface.dataset.studioHostErrorState = 'active';
  surface.hidden = true;
  surface.setAttribute('aria-live', 'assertive');
  surface.setAttribute('role', 'alert');
  return surface;
}

function clearHostErrorSurface(surface: HTMLElement): void {
  surface.hidden = true;
  surface.textContent = '';
}

function surfaceHostError(
  source: EventTarget,
  surface: HTMLElement,
  reason: unknown,
  operation: StudioHostedHostErrorDetail['operation'],
): void {
  const error = canonicalHostError(reason);
  surface.textContent = error.message.defaultMessage ?? error.message.key;
  surface.hidden = false;
  source.dispatchEvent(
    new CustomEvent<StudioHostedHostErrorDetail>(HOST_ERROR_EVENT, {
      bubbles: true,
      composed: true,
      detail: { error: structuredClone(error), operation },
    }),
  );
}

function canonicalHostError(reason: unknown): HostPortError {
  if (isHostPortFailure(reason)) return structuredClone(reason.error);
  return {
    category: 'internal',
    contractVersion: STUDIO_CONTRACT_VERSION,
    kind: 'host-error',
    message: {
      defaultMessage: 'Studio could not complete the configured browser operation.',
      key: 'studio.host/browser-runtime-failure',
    },
    retryable: false,
  };
}
