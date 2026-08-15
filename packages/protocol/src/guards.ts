import {
  STUDIO_CONTRACT_VERSION,
  STUDIO_WIRE_PROTOCOL_VERSION,
  type HostPortError,
  type PreviewMessage,
} from './types.js';

const qualifiedName = /^[a-z][a-z0-9]*(?:[.-][a-z0-9]+)*\/[a-z][a-z0-9]*(?:[.-][a-z0-9]+)*$/u;
const localName = /^[a-z][a-z0-9]*(?:[._-][a-z0-9]+)*$/u;

const hostErrorCategories = new Set([
  'cancelled',
  'conflict',
  'forbidden',
  'incompatible',
  'internal',
  'invalid-request',
  'limit-exceeded',
  'not-found',
  'rate-limited',
  'unauthenticated',
  'unavailable',
  'validation-failed',
]);

export function isHostPortError(value: unknown): value is HostPortError {
  return (
    isRecord(value) &&
    hasExactKeys(
      value,
      ['contractVersion', 'kind', 'category', 'message', 'retryable'],
      ['correlationId', 'diagnostics', 'retryAfterMilliseconds', 'revision'],
    ) &&
    value.contractVersion === STUDIO_CONTRACT_VERSION &&
    value.kind === 'host-error' &&
    typeof value.category === 'string' &&
    hostErrorCategories.has(value.category) &&
    isMessageReference(value.message) &&
    typeof value.retryable === 'boolean' &&
    (value.correlationId === undefined || isStableId(value.correlationId)) &&
    (value.revision === undefined || isRevision(value.revision)) &&
    (value.retryAfterMilliseconds === undefined ||
      (isNonNegativeInteger(value.retryAfterMilliseconds) &&
        value.retryAfterMilliseconds <= 86_400_000)) &&
    (value.diagnostics === undefined || isArrayOf(value.diagnostics, isDiagnostic, 1_000))
  );
}

export function isPreviewMessage(value: unknown): value is PreviewMessage {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, [
      'contractVersion',
      'kind',
      'channelId',
      'sessionGeneration',
      'sequence',
      'type',
      'payload',
    ]) ||
    value.contractVersion !== STUDIO_CONTRACT_VERSION ||
    value.kind !== 'preview-message' ||
    !isStableId(value.channelId) ||
    !isRevision(value.sessionGeneration) ||
    !isNonNegativeInteger(value.sequence) ||
    typeof value.type !== 'string' ||
    !isRecord(value.payload)
  ) {
    return false;
  }

  switch (value.type) {
    case 'studio.preview/ready':
      return isReadyPayload(value.payload);
    case 'studio.preview/render':
      return isRenderPayload(value.payload);
    case 'studio.preview/rendered':
      return isRenderedPayload(value.payload);
    case 'studio.preview/select':
      return isSelectPayload(value.payload);
    case 'studio.preview/error':
      return isErrorPayload(value.payload);
    case 'studio.preview/reload':
    case 'studio.preview/teardown':
      return isReasonPayload(value.payload);
    default:
      return false;
  }
}

function isReasonPayload(value: Record<string, unknown>): boolean {
  return hasExactKeys(value, ['reason']) && isQualifiedName(value.reason);
}

function isReadyPayload(value: Record<string, unknown>): boolean {
  return (
    hasExactKeys(value, ['protocolVersion', 'renderer', 'viewports']) &&
    value.protocolVersion === STUDIO_WIRE_PROTOCOL_VERSION &&
    isQualifiedName(value.renderer) &&
    isStringArray(value.viewports, isLocalName, 20)
  );
}

function isRenderPayload(value: Record<string, unknown>): boolean {
  return (
    hasExactKeys(value, ['artifactId', 'draftDigest', 'viewport'], ['draftRevision']) &&
    isStableId(value.artifactId) &&
    typeof value.draftDigest === 'string' &&
    /^[a-f0-9]{64}$/u.test(value.draftDigest) &&
    isLocalName(value.viewport) &&
    (value.draftRevision === undefined || isRevision(value.draftRevision))
  );
}

function isRenderedPayload(value: Record<string, unknown>): boolean {
  return (
    hasExactKeys(value, ['draftDigest', 'markers', 'diagnostics']) &&
    typeof value.draftDigest === 'string' &&
    /^[a-f0-9]{64}$/u.test(value.draftDigest) &&
    isStringArray(value.markers, isStableId, 100_000) &&
    isArrayOf(value.diagnostics, isDiagnostic, 10_000)
  );
}

function isSelectPayload(value: Record<string, unknown>): boolean {
  return (
    hasExactKeys(value, ['nodeId'], ['reveal']) &&
    isStableId(value.nodeId) &&
    (value.reveal === undefined || typeof value.reveal === 'boolean')
  );
}

function isErrorPayload(value: Record<string, unknown>): boolean {
  return (
    hasExactKeys(value, ['code', 'message', 'retryable'], ['correlationId']) &&
    isQualifiedName(value.code) &&
    isMessageReference(value.message) &&
    typeof value.retryable === 'boolean' &&
    (value.correlationId === undefined || isStableId(value.correlationId))
  );
}

function isDiagnostic(value: unknown): boolean {
  if (
    !isRecord(value) ||
    !hasExactKeys(
      value,
      ['code', 'severity', 'message'],
      ['location', 'parameters', 'remediations'],
    ) ||
    !isQualifiedName(value.code) ||
    typeof value.severity !== 'string' ||
    !['information', 'warning', 'error', 'blocking'].includes(value.severity) ||
    !isMessageReference(value.message)
  ) {
    return false;
  }
  if (value.location !== undefined && !isDiagnosticLocation(value.location)) {
    return false;
  }
  if (
    value.parameters !== undefined &&
    (!isRecord(value.parameters) ||
      Object.keys(value.parameters).length > 20 ||
      !Object.keys(value.parameters).every((key) => isSafeJsonMemberName(key)) ||
      !Object.values(value.parameters).every(
        (entry) =>
          entry === null ||
          typeof entry === 'boolean' ||
          typeof entry === 'string' ||
          (typeof entry === 'number' && Number.isFinite(entry)),
      ))
  ) {
    return false;
  }
  return value.remediations === undefined || isStringArray(value.remediations, isQualifiedName, 10);
}

function isDiagnosticLocation(value: unknown): boolean {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, [], ['artifactId', 'nodeId', 'fieldPath', 'jsonPointer'])
  ) {
    return false;
  }
  return (
    (value.artifactId === undefined || isStableId(value.artifactId)) &&
    (value.nodeId === undefined || isStableId(value.nodeId)) &&
    (value.fieldPath === undefined || isStringArray(value.fieldPath, isLocalName, 32)) &&
    (value.jsonPointer === undefined ||
      (typeof value.jsonPointer === 'string' && value.jsonPointer.length <= 1_000))
  );
}

function isMessageReference(value: unknown): boolean {
  return (
    isRecord(value) &&
    hasExactKeys(value, ['key'], ['defaultMessage']) &&
    isQualifiedName(value.key) &&
    (value.defaultMessage === undefined ||
      (typeof value.defaultMessage === 'string' &&
        value.defaultMessage.length > 0 &&
        value.defaultMessage.length <= 500))
  );
}

function hasExactKeys(
  value: Record<string, unknown>,
  required: readonly string[],
  optional: readonly string[] = [],
): boolean {
  const allowed = new Set([...required, ...optional]);
  return (
    required.every((key) => Object.hasOwn(value, key)) &&
    Object.keys(value).every((key) => allowed.has(key))
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false;
  }
  const prototype = Object.getPrototypeOf(value) as unknown;
  return prototype === Object.prototype || prototype === null;
}

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

function isQualifiedName(value: unknown): value is `${string}/${string}` {
  return typeof value === 'string' && value.length <= 160 && qualifiedName.test(value);
}

function isLocalName(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length <= 100 &&
    !isForbiddenObjectMemberName(value) &&
    localName.test(value)
  );
}

function isStableId(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length <= 240 &&
    !isForbiddenObjectMemberName(value) &&
    /^[A-Za-z0-9][A-Za-z0-9._:/-]*$/u.test(value)
  );
}

function isRevision(value: unknown): value is string {
  return typeof value === 'string' && value.length >= 1 && value.length <= 200;
}

function isStringArray(
  value: unknown,
  predicate: (entry: unknown) => boolean,
  maximumItems: number,
): value is string[] {
  return isArrayOf(value, predicate, maximumItems);
}

function isArrayOf(
  value: unknown,
  predicate: (entry: unknown) => boolean,
  maximumItems: number,
): value is unknown[] {
  if (!Array.isArray(value) || value.length > maximumItems || !isDenseArray(value)) {
    return false;
  }
  for (const entry of value) {
    if (!predicate(entry)) {
      return false;
    }
  }
  return true;
}

function isDenseArray(value: unknown[]): boolean {
  if (
    Object.getPrototypeOf(value) !== Array.prototype ||
    Object.getOwnPropertySymbols(value).length
  ) {
    return false;
  }
  const names = Object.getOwnPropertyNames(value);
  return (
    names.length === value.length + 1 &&
    names[value.length] === 'length' &&
    names.slice(0, -1).every((name, index) => name === String(index))
  );
}

function isSafeJsonMemberName(value: string): boolean {
  if (value.length === 0 || value.length > 200 || isForbiddenObjectMemberName(value)) {
    return false;
  }
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code <= 0x1f || code === 0x7f) {
      return false;
    }
  }
  return true;
}

function isForbiddenObjectMemberName(value: string): boolean {
  return value === '__proto__' || value === 'prototype' || value === 'constructor';
}
