import type { QualifiedName } from '@kumwe/studio-protocol';

export const AUTHORING_HTTP_SCHEMA_ID =
  'https://schemas.kumwe.org/studio/v1/authoring-http.schema.json' as const;

export type AuthoringHttpRoute =
  | 'authoring/list-types'
  | 'authoring/plan-save'
  | 'authoring/resolve-target'
  | 'authoring/save-as-new-type'
  | 'authoring/save-item'
  | 'authoring/save-new-type-version'
  | 'authoring/start';

export interface AuthoringHttpOperationContract {
  capability: QualifiedName;
  mutating: boolean;
  requestSchema: string;
  responseSchema: string;
  route: AuthoringHttpRoute;
}

export interface AuthoringHttpOperationRegistry {
  listTypes: AuthoringHttpOperationContract;
  planSave: AuthoringHttpOperationContract;
  resolveTarget: AuthoringHttpOperationContract;
  saveAsNewType: AuthoringHttpOperationContract;
  saveItem: AuthoringHttpOperationContract;
  saveNewTypeVersion: AuthoringHttpOperationContract;
  start: AuthoringHttpOperationContract;
}

/** Validates one value against an exact canonical schema reference. */
export type HttpSchemaValidator = (schemaReference: string, value: unknown) => boolean;

function operation(
  route: AuthoringHttpRoute,
  capability: QualifiedName,
  definition: string,
  mutating: boolean,
): AuthoringHttpOperationContract {
  return Object.freeze({
    capability,
    mutating,
    requestSchema: `${AUTHORING_HTTP_SCHEMA_ID}#/$defs/${definition}Request`,
    responseSchema: `${AUTHORING_HTTP_SCHEMA_ID}#/$defs/${definition}Result`,
    route,
  });
}

/**
 * Exact public route/capability/schema binding for contextual authoring.
 * The JSON Schema remains the language-neutral source of serialized shape;
 * this table prevents the TypeScript reference transport from drifting from it.
 */
export const AUTHORING_HTTP_OPERATIONS: Readonly<AuthoringHttpOperationRegistry> = Object.freeze({
  listTypes: operation(
    'authoring/list-types',
    'studio.operation/authoring.list-types',
    'listTypes',
    false,
  ),
  planSave: operation(
    'authoring/plan-save',
    'studio.operation/authoring.plan-save',
    'planSave',
    false,
  ),
  resolveTarget: operation(
    'authoring/resolve-target',
    'studio.operation/authoring.resolve-target',
    'resolveTarget',
    false,
  ),
  saveAsNewType: operation(
    'authoring/save-as-new-type',
    'studio.operation/authoring.save-as-new-type',
    'saveAsNewType',
    true,
  ),
  saveItem: operation(
    'authoring/save-item',
    'studio.operation/authoring.save-item',
    'saveItem',
    true,
  ),
  saveNewTypeVersion: operation(
    'authoring/save-new-type-version',
    'studio.operation/authoring.save-new-type-version',
    'saveNewTypeVersion',
    true,
  ),
  start: operation('authoring/start', 'studio.operation/authoring.start', 'start', true),
});

export const AUTHORING_HTTP_OPERATIONS_BY_ROUTE: ReadonlyMap<
  AuthoringHttpRoute,
  AuthoringHttpOperationContract
> = new Map(Object.values(AUTHORING_HTTP_OPERATIONS).map((entry) => [entry.route, entry] as const));
