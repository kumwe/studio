import {
  assertStudioDeploymentConfiguration,
  parseJsonRejectingDuplicateMembers,
} from '@kumwe/studio-core';
import {
  STUDIO_RELEASE_IDENTITY,
  type StudioDeploymentConfiguration,
  type StudioDeploymentRelease,
  type StudioHostedDeploymentConfiguration,
} from '@kumwe/studio-protocol';
import { mountStudioHosted, type StudioHostedRuntimeOptions } from './hosted-runtime.js';
import { mountStudioStandalone } from './standalone-runtime.js';

const CONFIGURATION_ATTRIBUTE = 'data-kumwe-studio';
const CONFIGURATION_MIME_TYPE = 'application/json';
const MAX_CONFIGURATION_BYTES = 2_097_152;
const MAX_CONFIGURATION_DEPTH = 16;

type MaybePromise<T> = Promise<T> | T;

/** The browser runtime mounted inside one host-owned target. */
export interface StudioDeploymentRuntimeHandle {
  readonly element: HTMLElement;
  dispose(): MaybePromise<void>;
}

/**
 * Resolve one canonical deployment into a runtime. The DOM bootstrap owns the
 * target and lifecycle; standalone/HTTP composition remains behind this seam.
 */
export type StudioDeploymentRuntimeResolver = (
  target: HTMLElement,
  configuration: StudioDeploymentConfiguration | undefined,
  hostedOptions?: StudioHostedRuntimeOptions,
) => MaybePromise<StudioDeploymentRuntimeHandle>;

/**
 * Shipped deployment composition. An omitted/standalone transport creates a
 * local blank project; configured hosted transports are never downgraded.
 */
export const resolveStudioDeploymentRuntime: StudioDeploymentRuntimeResolver = (
  target,
  configuration,
  hostedOptions,
) => {
  return isHostedConfiguration(configuration)
    ? mountStudioHosted(target, configuration, hostedOptions)
    : mountStudioStandalone(target, {
        ...(configuration?.locale === undefined ? {} : { locale: configuration.locale }),
      });
};

/** Allocate live browser services independently for one configured mount. */
export type StudioHostedRuntimeOptionsFactory = (
  target: HTMLElement,
  configuration: StudioHostedDeploymentConfiguration,
) => StudioHostedRuntimeOptions;

export interface StudioMountOptions {
  /**
   * Trusted browser-only seams; routes, static auth, and authority remain in deployment JSON.
   * Use a factory when auto-mounting stateful preview/upload services so no instance shares them.
   */
  readonly hosted?: StudioHostedRuntimeOptions | StudioHostedRuntimeOptionsFactory;
  /** Selector scope. Defaults to the target's document or the global document. */
  readonly root?: ParentNode;
  /** Advanced composition/test seam; normal browser use relies on the shipped resolver. */
  readonly runtimeResolver?: StudioDeploymentRuntimeResolver;
}

export interface StudioAutoMountOptions extends StudioMountOptions {
  /** Discovery scope. Defaults to the global document. */
  readonly root?: ParentNode;
}

/** The point at which one independently discovered deployment failed. */
export type StudioAutoMountFailurePhase = 'configuration' | 'runtime';

/**
 * A failure associated with exactly one opted-in mount target. Diagnostics
 * retain safe correlation fields, never the deployment document or its
 * authentication material.
 */
export interface StudioAutoMountFailure {
  readonly configurationElementId: string | undefined;
  readonly error: unknown;
  /** Safe correlation only; the deployment document and authentication material are never echoed. */
  readonly instanceId: string | undefined;
  readonly phase: StudioAutoMountFailurePhase;
  readonly target: HTMLElement;
}

/**
 * Result of one explicit discovery pass. Successful handles and failures are
 * reported independently in DOM order. Disposing the report cleans every
 * successful mount without touching mounts owned by another discovery pass.
 */
export interface StudioAutoMountReport {
  readonly discoveredTargetCount: number;
  readonly failures: readonly StudioAutoMountFailure[];
  readonly handles: readonly StudioMountHandle[];
  dispose(): Promise<void>;
}

export interface StudioMountHandle {
  readonly disposed: boolean;
  readonly element: HTMLElement;
  readonly instanceId: string | undefined;
  readonly target: HTMLElement;
  dispose(): Promise<void>;
}

const activeMounts = new WeakMap<HTMLElement, StudioMountHandleImplementation>();
const pendingMounts = new WeakSet<HTMLElement>();

/** Mount by canonical configuration, or open local Studio in an explicit target. */
export function mountStudio(
  targetOrConfiguration: HTMLElement | StudioDeploymentConfiguration | string,
  options?: StudioMountOptions,
): Promise<StudioMountHandle>;

/**
 * Mount into an explicitly supplied element/selector. The canonical
 * configuration selector, when supplied, must resolve to that same target.
 */
export function mountStudio(
  target: HTMLElement | string,
  configuration: StudioDeploymentConfiguration,
  options?: StudioMountOptions,
): Promise<StudioMountHandle>;

export async function mountStudio(
  targetOrConfiguration: HTMLElement | StudioDeploymentConfiguration | string,
  configurationOrOptions?: StudioDeploymentConfiguration | StudioMountOptions,
  explicitOptions: StudioMountOptions = {},
): Promise<StudioMountHandle> {
  const normalized = normalizeMountArguments(
    targetOrConfiguration,
    configurationOrOptions,
    explicitOptions,
    arguments.length >= 3,
  );
  const configuration =
    normalized.configuration === undefined
      ? undefined
      : cloneAndAssertConfiguration(normalized.configuration);
  const root = normalized.options.root ?? defaultRoot(normalized.target);
  if (normalized.target === undefined && configuration === undefined) {
    throw new TypeError('Configuration-only Studio mounting requires configuration.mount.');
  }
  const canonicalTarget =
    configuration === undefined
      ? undefined
      : resolveUniqueTarget(configuration.mount, root, 'configuration.mount');
  const target =
    normalized.target === undefined
      ? requireTarget(canonicalTarget)
      : resolveSuppliedTarget(normalized.target, root);

  if (canonicalTarget !== undefined && target !== canonicalTarget) {
    throw new TypeError(
      `The supplied Studio mount target does not match configuration.mount (${configuration?.mount ?? ''}).`,
    );
  }
  if (activeMounts.has(target) || pendingMounts.has(target)) {
    throw new TypeError('The Studio mount target already has an active or pending deployment.');
  }

  pendingMounts.add(target);
  try {
    const resolver = normalized.options.runtimeResolver ?? resolveStudioDeploymentRuntime;
    const runtimeConfiguration =
      configuration === undefined ? undefined : structuredClone(configuration);
    const hostedOptions = resolveHostedRuntimeOptions(
      normalized.options.hosted,
      target,
      runtimeConfiguration,
    );
    const runtime = await resolver(target, runtimeConfiguration, hostedOptions);
    assertRuntimeHandle(runtime, target);
    const handle = new StudioMountHandleImplementation(target, runtime, configuration?.instanceId);
    activeMounts.set(target, handle);
    return handle;
  } finally {
    pendingMounts.delete(target);
  }
}

function resolveHostedRuntimeOptions(
  configured: StudioMountOptions['hosted'],
  target: HTMLElement,
  configuration: StudioDeploymentConfiguration | undefined,
): StudioHostedRuntimeOptions | undefined {
  if (configured === undefined || typeof configured !== 'function') return configured;
  if (!isHostedConfiguration(configuration)) return undefined;
  return configured(target, structuredClone(configuration));
}

/**
 * Parse an inert JSON data block and mount using its canonical selector.
 * This function never evaluates script text and never reads a script `src`.
 */
export async function mountStudioFromConfigElement(
  configurationElement: HTMLScriptElement | string,
  options: StudioMountOptions = {},
): Promise<StudioMountHandle> {
  const root = options.root ?? defaultDocument();
  const script = resolveConfigurationElement(configurationElement, root);
  const configuration = parseStudioDeploymentConfiguration(script);
  return mountStudio(configuration, { ...options, root });
}

/**
 * Explicitly discover `[data-kumwe-studio]` targets. The attribute value is
 * the ID of one inert `script[type="application/json"]` data block. Importing
 * Studio never invokes this helper automatically.
 */
export async function autoMountStudio(
  options: StudioAutoMountOptions = {},
): Promise<StudioAutoMountReport> {
  const root = options.root ?? defaultDocument();
  const targets = [...root.querySelectorAll<HTMLElement>(`[${CONFIGURATION_ATTRIBUTE}]`)];
  const configurationReferenceCounts = countConfigurationReferences(targets);
  const eligibleTargets = targets.filter(
    (target) => !activeMounts.has(target) && !pendingMounts.has(target),
  );
  const outcomes = await Promise.all(
    eligibleTargets.map(async (target) =>
      mountDiscoveredTarget(target, root, options, configurationReferenceCounts),
    ),
  );
  const handles: StudioMountHandle[] = [];
  const failures: StudioAutoMountFailure[] = [];
  for (const outcome of outcomes) {
    if ('handle' in outcome) handles.push(outcome.handle);
    else failures.push(outcome.failure);
  }
  return createAutoMountReport(eligibleTargets.length, handles, failures);
}

type StudioAutoMountOutcome =
  { readonly handle: StudioMountHandle } | { readonly failure: StudioAutoMountFailure };

async function mountDiscoveredTarget(
  target: HTMLElement,
  root: ParentNode,
  options: StudioAutoMountOptions,
  configurationReferenceCounts: ReadonlyMap<string, number>,
): Promise<StudioAutoMountOutcome> {
  const configurationElementId = target.getAttribute(CONFIGURATION_ATTRIBUTE)?.trim() ?? '';
  let configuration: StudioDeploymentConfiguration | undefined;
  try {
    if (
      configurationElementId.length > 0 &&
      configurationReferenceCounts.get(configurationElementId) !== 1
    ) {
      throw new TypeError(
        'Each Studio deployment configuration element must be associated with exactly one mount target.',
      );
    }
    configuration =
      configurationElementId.length === 0
        ? undefined
        : parseStudioDeploymentConfiguration(
            resolveConfigurationElement(configurationElementId, root),
          );
    if (configuration !== undefined) {
      const canonicalTarget = resolveUniqueTarget(
        configuration.mount,
        root,
        `${deploymentLabel(configuration)} mount`,
      );
      if (canonicalTarget !== target) {
        throw new TypeError(
          `${deploymentLabel(configuration)} does not select its declared data target.`,
        );
      }
    }
  } catch (error) {
    return {
      failure: Object.freeze({
        configurationElementId:
          configurationElementId.length === 0 ? undefined : configurationElementId,
        error,
        instanceId: configuration?.instanceId,
        phase: 'configuration',
        target,
      }),
    };
  }

  try {
    return {
      handle:
        configuration === undefined
          ? await mountStudio(target, { ...options, root })
          : await mountStudio(target, configuration, { ...options, root }),
    };
  } catch (error) {
    return {
      failure: Object.freeze({
        configurationElementId:
          configurationElementId.length === 0 ? undefined : configurationElementId,
        error,
        instanceId: configuration?.instanceId,
        phase: 'runtime',
        target,
      }),
    };
  }
}

function createAutoMountReport(
  discoveredTargetCount: number,
  handles: readonly StudioMountHandle[],
  failures: readonly StudioAutoMountFailure[],
): StudioAutoMountReport {
  const immutableHandles = Object.freeze([...handles]);
  const immutableFailures = Object.freeze([...failures]);
  let disposePromise: Promise<void> | undefined;
  const dispose = (): Promise<void> => {
    disposePromise ??= disposeAutoMountHandles(immutableHandles);
    return disposePromise;
  };
  return Object.freeze({
    discoveredTargetCount,
    dispose,
    failures: immutableFailures,
    handles: immutableHandles,
  });
}

async function disposeAutoMountHandles(handles: readonly StudioMountHandle[]): Promise<void> {
  const outcomes = await Promise.allSettled(handles.map(async (handle) => handle.dispose()));
  const errors = outcomes.flatMap((outcome) =>
    outcome.status === 'rejected' ? [outcome.reason as unknown] : [],
  );
  if (errors.length > 0) {
    throw new AggregateError(errors, 'One or more Studio deployments failed to dispose.');
  }
}

/** Parse one bounded, CSP-safe canonical deployment data block. */
export function parseStudioDeploymentConfiguration(
  script: HTMLScriptElement,
): StudioDeploymentConfiguration {
  if (script.type.trim().toLowerCase() !== CONFIGURATION_MIME_TYPE) {
    throw new TypeError(
      `Studio deployment configuration must use type="${CONFIGURATION_MIME_TYPE}".`,
    );
  }
  if (script.hasAttribute('src')) {
    throw new TypeError('Studio deployment configuration must be an inline inert JSON data block.');
  }
  const source = script.textContent ?? '';
  if (new TextEncoder().encode(source).byteLength > MAX_CONFIGURATION_BYTES) {
    throw new TypeError(
      `Studio deployment configuration exceeds ${String(MAX_CONFIGURATION_BYTES)} bytes.`,
    );
  }
  assertJsonSourceDepth(source, MAX_CONFIGURATION_DEPTH);

  let parsed: unknown;
  try {
    parsed = parseJsonRejectingDuplicateMembers(source);
  } catch {
    throw new TypeError('Studio deployment configuration is not valid JSON.');
  }
  assertMaximumDepth(parsed, MAX_CONFIGURATION_DEPTH);
  assertStudioDeploymentConfiguration(parsed);
  assertMatchingBrowserRelease(parsed.release);
  return structuredClone(parsed);
}

class StudioMountHandleImplementation implements StudioMountHandle {
  readonly #runtime: StudioDeploymentRuntimeHandle;
  #disposePromise: Promise<void> | undefined;
  public readonly instanceId: string | undefined;
  public readonly target: HTMLElement;

  public constructor(
    target: HTMLElement,
    runtime: StudioDeploymentRuntimeHandle,
    instanceId: string | undefined,
  ) {
    this.#runtime = runtime;
    this.instanceId = instanceId;
    this.target = target;
  }

  public get disposed(): boolean {
    return this.#disposePromise !== undefined;
  }

  public get element(): HTMLElement {
    return this.#runtime.element;
  }

  public dispose(): Promise<void> {
    this.#disposePromise ??= this.#dispose();
    return this.#disposePromise;
  }

  async #dispose(): Promise<void> {
    try {
      await this.#runtime.dispose();
    } finally {
      if (this.#runtime.element !== this.target && this.target.contains(this.#runtime.element)) {
        this.#runtime.element.remove();
      }
      if (activeMounts.get(this.target) === this) activeMounts.delete(this.target);
    }
  }
}

function normalizeMountArguments(
  targetOrConfiguration: HTMLElement | StudioDeploymentConfiguration | string,
  configurationOrOptions: StudioDeploymentConfiguration | StudioMountOptions | undefined,
  explicitOptions: StudioMountOptions,
  hasExplicitOptions: boolean,
): {
  configuration: StudioDeploymentConfiguration | undefined;
  options: StudioMountOptions;
  target: HTMLElement | string | undefined;
} {
  if (typeof targetOrConfiguration === 'string' || isHtmlElement(targetOrConfiguration)) {
    if (
      configurationOrOptions === undefined ||
      (isMountOptionsOnly(configurationOrOptions) && !hasExplicitOptions)
    ) {
      return {
        configuration: undefined,
        options: configurationOrOptions ?? {},
        target: targetOrConfiguration,
      };
    }
    return {
      configuration: configurationOrOptions as StudioDeploymentConfiguration,
      options: explicitOptions,
      target: targetOrConfiguration,
    };
  }
  return {
    configuration: targetOrConfiguration,
    options: (configurationOrOptions as StudioMountOptions | undefined) ?? {},
    target: undefined,
  };
}

function cloneAndAssertConfiguration(
  configuration: StudioDeploymentConfiguration,
): StudioDeploymentConfiguration {
  const clone: unknown = structuredClone(configuration);
  let serialized: string | undefined;
  try {
    serialized = JSON.stringify(clone);
  } catch {
    throw new TypeError('Studio deployment configuration must be bounded JSON data.');
  }
  if (
    serialized === undefined ||
    new TextEncoder().encode(serialized).byteLength > MAX_CONFIGURATION_BYTES
  ) {
    throw new TypeError(
      `Studio deployment configuration exceeds ${String(MAX_CONFIGURATION_BYTES)} bytes.`,
    );
  }
  assertMaximumDepth(clone, MAX_CONFIGURATION_DEPTH);
  assertStudioDeploymentConfiguration(clone);
  assertMatchingBrowserRelease(clone.release);
  return clone;
}

function assertMatchingBrowserRelease(release: StudioDeploymentRelease): void {
  if (
    release.version !== STUDIO_RELEASE_IDENTITY.version ||
    release.corpusManifestDigest !== STUDIO_RELEASE_IDENTITY.corpusManifestDigest
  ) {
    throw new TypeError(
      'Studio deployment release does not match the loaded Studio browser asset manifest.',
    );
  }
}

function assertMaximumDepth(value: unknown, maximumDepth: number): void {
  const pending: { depth: number; value: unknown }[] = [{ depth: 1, value }];
  while (pending.length > 0) {
    const current = pending.pop();
    if (current === undefined) break;
    if (current.depth > maximumDepth) {
      throw new TypeError(
        `Studio deployment configuration exceeds JSON depth ${String(maximumDepth)}.`,
      );
    }
    if (Array.isArray(current.value)) {
      for (const child of current.value) {
        if (isContainer(child)) pending.push({ depth: current.depth + 1, value: child });
      }
    } else if (isRecord(current.value)) {
      for (const child of Object.values(current.value)) {
        if (isContainer(child)) pending.push({ depth: current.depth + 1, value: child });
      }
    }
  }
}

function assertJsonSourceDepth(source: string, maximumDepth: number): void {
  let depth = 0;
  let escaped = false;
  let inString = false;
  for (const character of source) {
    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (character === '\\') {
        escaped = true;
      } else if (character === '"') {
        inString = false;
      }
      continue;
    }
    if (character === '"') {
      inString = true;
    } else if (character === '{' || character === '[') {
      depth += 1;
      if (depth > maximumDepth) {
        throw new TypeError(
          `Studio deployment configuration exceeds JSON depth ${String(maximumDepth)}.`,
        );
      }
    } else if (character === '}' || character === ']') {
      depth -= 1;
    }
  }
}

function resolveSuppliedTarget(target: HTMLElement | string, root: ParentNode): HTMLElement {
  return typeof target === 'string'
    ? resolveUniqueTarget(target, root, 'supplied Studio mount selector')
    : target;
}

function resolveUniqueTarget(selector: string, root: ParentNode, label: string): HTMLElement {
  let matches: NodeListOf<Element>;
  try {
    matches = root.querySelectorAll(selector);
  } catch {
    throw new TypeError(`${label} is not a valid selector.`);
  }
  if (matches.length !== 1 || !isHtmlElement(matches[0])) {
    throw new TypeError(`${label} must resolve to exactly one HTML element.`);
  }
  return matches[0];
}

function resolveConfigurationElement(
  elementOrId: HTMLScriptElement | string,
  root: ParentNode,
): HTMLScriptElement {
  if (typeof elementOrId !== 'string') {
    if (!isScriptElement(elementOrId)) {
      throw new TypeError('Studio deployment configuration must be a script element.');
    }
    return elementOrId;
  }
  const id = elementOrId.trim();
  if (id.length === 0) {
    throw new TypeError('Studio deployment configuration script ID cannot be empty.');
  }
  const matches = [...root.querySelectorAll('[id]')].filter((candidate) => candidate.id === id);
  if (matches.length !== 1 || !isScriptElement(matches[0])) {
    throw new TypeError(
      `Studio deployment configuration ID ${id} must identify exactly one script element.`,
    );
  }
  return matches[0];
}

function countConfigurationReferences(
  targets: readonly HTMLElement[],
): ReadonlyMap<string, number> {
  const counts = new Map<string, number>();
  for (const target of targets) {
    const id = target.getAttribute(CONFIGURATION_ATTRIBUTE)?.trim() ?? '';
    if (id.length > 0) counts.set(id, (counts.get(id) ?? 0) + 1);
  }
  return counts;
}

function assertRuntimeHandle(runtime: StudioDeploymentRuntimeHandle, target: HTMLElement): void {
  if (
    !isRecord(runtime) ||
    !isHtmlElement(runtime.element) ||
    typeof runtime.dispose !== 'function' ||
    (runtime.element !== target && !target.contains(runtime.element))
  ) {
    throw new TypeError('Studio deployment runtime returned an invalid mount handle.');
  }
}

function defaultRoot(target: HTMLElement | string | undefined): ParentNode {
  return isHtmlElement(target) ? target.ownerDocument : defaultDocument();
}

function defaultDocument(): Document {
  if (typeof document === 'undefined') {
    throw new TypeError('Studio browser mounting requires a document or an explicit root.');
  }
  return document;
}

function deploymentLabel(configuration: StudioDeploymentConfiguration): string {
  return configuration.instanceId === undefined
    ? 'Studio deployment'
    : `Studio deployment ${configuration.instanceId}`;
}

function isHostedConfiguration(
  configuration: StudioDeploymentConfiguration | undefined,
): configuration is StudioHostedDeploymentConfiguration {
  return configuration?.transport?.kind === 'http';
}

function isMountOptionsOnly(value: unknown): value is StudioMountOptions {
  return (
    isRecord(value) &&
    Object.keys(value).every(
      (key) => key === 'hosted' || key === 'root' || key === 'runtimeResolver',
    )
  );
}

function requireTarget(target: HTMLElement | undefined): HTMLElement {
  if (target === undefined) {
    throw new TypeError('Studio deployment does not identify a mount target.');
  }
  return target;
}

function isContainer(value: unknown): value is Record<string, unknown> | unknown[] {
  return Array.isArray(value) || isRecord(value);
}

function isHtmlElement(value: unknown): value is HTMLElement {
  return (
    isRecord(value) &&
    value.nodeType === 1 &&
    typeof value.querySelectorAll === 'function' &&
    typeof value.matches === 'function'
  );
}

function isScriptElement(value: unknown): value is HTMLScriptElement {
  return isHtmlElement(value) && value.tagName.toLowerCase() === 'script';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
