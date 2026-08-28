import {
  hostOperationsSchema,
  protocolSchemas,
  studioDeploymentSchema,
  type JsonValue,
  type StudioDeploymentConfiguration,
  type StudioDeploymentOperationRoute,
  type StudioHostedDeploymentConfiguration,
} from '@kumwe/studio-protocol';
import { canonicalStringify } from './canonical.js';
import { isStudioTokenLifetimeValid } from './authentication-lifetime.js';
import {
  compileProfileSchema,
  type CompiledSchemaValidator,
  type SchemaValidationError,
} from './profile-validator.js';

const deploymentValidator: CompiledSchemaValidator = compileProfileSchema(studioDeploymentSchema, {
  schemas: protocolSchemas.filter((schema) => schema.$id !== studioDeploymentSchema.$id),
});

const operationCapabilityPrefix = 'studio.operation/';
const supportedOperationRoutes = readSupportedOperationRoutes();

/**
 * Full CSP-safe validation for the canonical deployment document. Validation
 * includes every referenced session and contribution schema plus the
 * cross-document hosted invariants that JSON Schema cannot express.
 */
export function validateStudioDeploymentConfiguration(
  value: unknown,
  currentTimeMilliseconds: number = Date.now(),
): value is StudioDeploymentConfiguration {
  if (!deploymentValidator.validate(value)) {
    return false;
  }
  const configuration = value as StudioDeploymentConfiguration;
  if (!isHosted(configuration)) {
    return true;
  }
  const authentication = configuration.transport.authentication;
  if (
    authentication.kind !== 'same-origin-session' &&
    !isStudioTokenLifetimeValid(authentication, currentTimeMilliseconds)
  ) {
    return false;
  }
  if (
    canonicalStringify(configuration.launch.resourceContext as unknown as JsonValue) !==
    canonicalStringify(configuration.session.resourceContext as unknown as JsonValue)
  ) {
    return false;
  }
  const advertisedRoutes = advertisedOperationRoutes(configuration);
  if (advertisedRoutes === undefined) {
    return false;
  }
  if (
    !advertisedRoutes.has('authoring/resolve-target') ||
    !advertisedRoutes.has('authoring/start')
  ) {
    return false;
  }
  if (configuration.transport.routing.kind === 'single-endpoint') {
    return true;
  }
  const configuredRoutes = new Set(
    Object.keys(configuration.transport.routing.endpoints) as StudioDeploymentOperationRoute[],
  );
  return setsEqual(configuredRoutes, advertisedRoutes);
}

/** Throws a value-free, bounded initialization error when validation fails. */
export function assertStudioDeploymentConfiguration(
  value: unknown,
  currentTimeMilliseconds: number = Date.now(),
): asserts value is StudioDeploymentConfiguration {
  if (validateStudioDeploymentConfiguration(value, currentTimeMilliseconds)) {
    return;
  }
  const details = schemaFailureSummary(deploymentValidator.errors);
  throw new TypeError(
    details === ''
      ? 'Studio deployment configuration violates a hosted deployment invariant.'
      : `Studio deployment configuration is invalid: ${details}`,
  );
}

function isHosted(
  value: StudioDeploymentConfiguration,
): value is StudioHostedDeploymentConfiguration {
  return value.transport?.kind === 'http';
}

function advertisedOperationRoutes(
  configuration: StudioHostedDeploymentConfiguration,
): ReadonlySet<StudioDeploymentOperationRoute> | undefined {
  const routes = new Set<StudioDeploymentOperationRoute>();
  for (const port of configuration.session.hostCapabilities.ports) {
    for (const operation of port.operations) {
      const route = routeFromCapability(operation);
      if (operation.startsWith(operationCapabilityPrefix) && route === undefined) {
        return undefined;
      }
      if (route !== undefined) {
        routes.add(route);
      }
    }
  }
  return routes;
}

function routeFromCapability(value: string): StudioDeploymentOperationRoute | undefined {
  if (!value.startsWith(operationCapabilityPrefix)) {
    return undefined;
  }
  const operation = value.slice(operationCapabilityPrefix.length);
  const separator = operation.indexOf('.');
  if (separator <= 0 || separator === operation.length - 1) {
    return undefined;
  }
  const route = `${operation.slice(0, separator)}/${operation.slice(separator + 1)}`;
  return supportedOperationRoutes.has(route)
    ? (route as StudioDeploymentOperationRoute)
    : undefined;
}

function readSupportedOperationRoutes(): ReadonlySet<string> {
  const definitions = hostOperationsSchema.$defs;
  if (!isJsonRecord(definitions)) {
    throw new TypeError('Canonical host operation routes are unavailable.');
  }
  const routeDefinition = definitions.operationRoute;
  if (!isJsonRecord(routeDefinition) || !Array.isArray(routeDefinition.enum)) {
    throw new TypeError('Canonical host operation routes are unavailable.');
  }
  const routes = routeDefinition.enum;
  if (!routes.every((route): route is string => typeof route === 'string')) {
    throw new TypeError('Canonical host operation routes are invalid.');
  }
  return new Set(routes);
}

function isJsonRecord(value: JsonValue | undefined): value is Record<string, JsonValue> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function setsEqual<TValue>(left: ReadonlySet<TValue>, right: ReadonlySet<TValue>): boolean {
  return left.size === right.size && [...left].every((value) => right.has(value));
}

function schemaFailureSummary(errors: readonly SchemaValidationError[] | null): string {
  if (errors === null || errors.length === 0) {
    return '';
  }
  return errors
    .slice(0, 3)
    .map((error) => `${error.instancePath || '/'} ${error.message}`)
    .join('; ');
}
