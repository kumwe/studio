import type {
  BlockDefinition,
  BlockPortDefinition,
  BlueprintDocument,
  BlueprintNode,
  ContentFieldKind,
  ContentModelDocument,
  FieldBinding,
  FieldDefinition,
  JsonPrimitive,
  LocalName,
  LockedArtifactReference,
  MessageReference,
  QualifiedName,
  StudioDiagnostic,
} from '@kumwe/studio-protocol';
import { cloneContractValue } from './clone.js';

/** The stable outcomes a binding port can expose to any authoring shell. */
export type FieldBindingProjectionStatus = 'invalid' | 'non-field-source' | 'resolved' | 'unbound';

/** One model field that can be bound to one exact block port. */
export interface FieldBindingCandidate {
  readonly cardinality: FieldDefinition['cardinality'];
  readonly control?: QualifiedName;
  readonly fieldPath: readonly LocalName[];
  readonly itemKind?: Exclude<ContentFieldKind, 'collection'>;
  readonly kind: ContentFieldKind;
  readonly label: MessageReference;
}

/** Deterministic projection of one declared or preserved node binding port. */
export interface FieldBindingPortProjection {
  readonly binding?: FieldBinding;
  readonly boundFieldPath?: readonly LocalName[];
  readonly candidates: readonly FieldBindingCandidate[];
  readonly multiple?: boolean;
  readonly port: LocalName;
  readonly required?: boolean;
  readonly status: FieldBindingProjectionStatus;
  readonly valueType?: string;
}

/** Deterministic projection of all binding affordances on one Blueprint node. */
export interface NodeFieldBindingProjection {
  readonly nodeId: string;
  readonly ports: readonly FieldBindingPortProjection[];
}

/**
 * Read-only, language-neutral view of a Blueprint's bindings against one exact
 * host-projected model revision.
 */
export interface BlueprintFieldBindingProjection {
  readonly diagnostics: readonly StudioDiagnostic[];
  readonly model: LockedArtifactReference;
  readonly nodes: readonly NodeFieldBindingProjection[];
}

interface IndexedField {
  field: FieldDefinition;
  fieldPath: LocalName[];
}

interface ProjectionContext {
  blueprintId: string;
  diagnostics: StudioDiagnostic[];
  fields: IndexedField[];
  modelCompatible: boolean;
  modelReference: LockedArtifactReference;
  definitions: ReadonlyMap<string, BlockDefinition>;
}

/**
 * Projects the active model into field-binding affordances and diagnostics.
 *
 * The function never changes a model, Blueprint, block definition, workflow,
 * translation, or permission value. It accepts only already-authorized model
 * projections and returns detached JSON-compatible snapshots. Field IDs, not
 * labels or storage names, are the only binding coordinates.
 */
export function projectBlueprintFieldBindings(
  blueprint: BlueprintDocument,
  model: ContentModelDocument,
  definitions: readonly BlockDefinition[],
): BlueprintFieldBindingProjection {
  const documentSnapshot = cloneContractValue(blueprint);
  const modelSnapshot = cloneContractValue(model);
  const definitionSnapshots = cloneContractValue(definitions);
  const diagnostics: StudioDiagnostic[] = [];
  const modelReference = cloneContractValue(documentSnapshot.model);
  const modelCompatible = appendModelCoordinateDiagnostics(
    documentSnapshot,
    modelSnapshot,
    diagnostics,
  );
  const indexedDefinitions = new Map<string, BlockDefinition>();
  for (const definition of definitionSnapshots) {
    indexedDefinitions.set(blockKey(definition.type, definition.version), definition);
  }
  const context: ProjectionContext = {
    blueprintId: documentSnapshot.id,
    definitions: indexedDefinitions,
    diagnostics,
    fields: modelCompatible ? flattenModelFields(modelSnapshot.fields) : [],
    modelCompatible,
    modelReference,
  };
  const nodes: NodeFieldBindingProjection[] = [];
  visitNodes(documentSnapshot.roots, (node) => {
    nodes.push(projectNode(node, context));
  });

  return cloneContractValue({ diagnostics, model: modelReference, nodes });
}

function appendModelCoordinateDiagnostics(
  blueprint: BlueprintDocument,
  model: ContentModelDocument,
  diagnostics: StudioDiagnostic[],
): boolean {
  let compatible = true;
  for (const mismatch of [
    {
      actual: model.id,
      code: 'studio.binding/model-id-mismatch' as QualifiedName,
      expected: blueprint.model.id,
      member: 'id',
    },
    {
      actual: model.version,
      code: 'studio.binding/model-version-mismatch' as QualifiedName,
      expected: blueprint.model.version,
      member: 'version',
    },
    {
      actual: model.revision,
      code: 'studio.binding/model-revision-mismatch' as QualifiedName,
      expected: blueprint.model.revision,
      member: 'revision',
    },
  ]) {
    if (mismatch.actual === mismatch.expected) {
      continue;
    }
    compatible = false;
    diagnostics.push(
      diagnostic(
        mismatch.code,
        `The projected model ${mismatch.member} {actual} does not match the Blueprint lock {expected}.`,
        'error',
        {
          actual: mismatch.actual,
          expected: mismatch.expected,
          member: mismatch.member,
        },
        { artifactId: blueprint.id },
      ),
    );
  }
  return compatible;
}

function projectNode(node: BlueprintNode, context: ProjectionContext): NodeFieldBindingProjection {
  const definition = context.definitions.get(blockKey(node.type, node.version));
  const declaredPorts = definition?.ports ?? [];
  const declaredIds = new Set(declaredPorts.map((port) => port.id));
  const preservedPortIds = Object.keys(node.bindings)
    .filter((port) => !declaredIds.has(port))
    .sort(compareCodeUnits);
  const ports = [
    ...declaredPorts.map((port) => projectPort(node, port, context)),
    ...preservedPortIds.map((port) => projectMissingPort(node, port, context)),
  ];
  return { nodeId: node.id, ports };
}

function projectPort(
  node: BlueprintNode,
  port: BlockPortDefinition,
  context: ProjectionContext,
): FieldBindingPortProjection {
  const candidates = context.modelCompatible
    ? context.fields
        .filter(
          (candidate) =>
            candidate.field.authoring?.hidden !== true && fieldMatchesPort(candidate.field, port),
        )
        .map(({ field, fieldPath }) => candidateProjection(field, fieldPath))
    : [];
  const binding = node.bindings[port.id];
  if (binding === undefined) {
    if (port.required) {
      context.diagnostics.push(
        diagnostic(
          'studio.binding/required-port-unbound',
          'Required block port {port} is not bound to a source.',
          'warning',
          { port: port.id },
          { artifactId: context.blueprintId, nodeId: node.id },
        ),
      );
    }
    return {
      candidates,
      multiple: port.multiple,
      port: port.id,
      required: port.required,
      status: 'unbound',
      valueType: port.valueType,
    };
  }
  if (binding.source.kind !== 'entry-field') {
    return {
      binding: cloneContractValue(binding),
      candidates,
      multiple: port.multiple,
      port: port.id,
      required: port.required,
      status: 'non-field-source',
      valueType: port.valueType,
    };
  }
  const fieldPath = [...binding.source.fieldPath];
  if (!context.modelCompatible) {
    return invalidProjection(port, binding, fieldPath, candidates);
  }
  const resolution = resolveFieldPath(context.fields, fieldPath);
  if (resolution === undefined) {
    context.diagnostics.push(
      diagnostic(
        'studio.binding/field-missing',
        'Binding port {port} addresses field path {fieldPath}, which the locked model no longer declares.',
        'error',
        { fieldPath: fieldPath.join('.'), port: port.id },
        { artifactId: context.blueprintId, fieldPath, nodeId: node.id },
      ),
    );
    return invalidProjection(port, binding, fieldPath, candidates);
  }
  if (fieldIsMultiple(resolution.field) !== port.multiple) {
    context.diagnostics.push(
      diagnostic(
        'studio.binding/field-cardinality-incompatible',
        'Binding port {port} and field {fieldPath} no longer have compatible cardinality.',
        'error',
        { fieldPath: fieldPath.join('.'), port: port.id },
        { artifactId: context.blueprintId, fieldPath, nodeId: node.id },
      ),
    );
    return invalidProjection(port, binding, fieldPath, candidates);
  }
  if (!fieldKindMatchesValueType(resolution.field, port.valueType)) {
    context.diagnostics.push(
      diagnostic(
        'studio.binding/field-kind-incompatible',
        'Binding port {port} expects {valueType}, but field {fieldPath} now projects as {fieldKind}.',
        'error',
        {
          fieldKind: effectiveFieldKind(resolution.field),
          fieldPath: fieldPath.join('.'),
          port: port.id,
          valueType: port.valueType,
        },
        { artifactId: context.blueprintId, fieldPath, nodeId: node.id },
      ),
    );
    return invalidProjection(port, binding, fieldPath, candidates);
  }
  return {
    binding: cloneContractValue(binding),
    boundFieldPath: fieldPath,
    candidates,
    multiple: port.multiple,
    port: port.id,
    required: port.required,
    status: 'resolved',
    valueType: port.valueType,
  };
}

function projectMissingPort(
  node: BlueprintNode,
  port: LocalName,
  context: ProjectionContext,
): FieldBindingPortProjection {
  const binding = node.bindings[port];
  if (binding === undefined) {
    return { candidates: [], port, status: 'invalid' };
  }
  context.diagnostics.push(
    diagnostic(
      'studio.binding/port-missing',
      'Binding port {port} is not declared by the locked block definition.',
      'error',
      { port },
      { artifactId: context.blueprintId, nodeId: node.id },
    ),
  );
  return {
    binding: cloneContractValue(binding),
    ...(binding.source.kind === 'entry-field'
      ? { boundFieldPath: [...binding.source.fieldPath] }
      : {}),
    candidates: [],
    port,
    status: 'invalid',
  };
}

function invalidProjection(
  port: BlockPortDefinition,
  binding: FieldBinding,
  fieldPath: readonly LocalName[],
  candidates: readonly FieldBindingCandidate[],
): FieldBindingPortProjection {
  return {
    binding: cloneContractValue(binding),
    boundFieldPath: [...fieldPath],
    candidates,
    multiple: port.multiple,
    port: port.id,
    required: port.required,
    status: 'invalid',
    valueType: port.valueType,
  };
}

function candidateProjection(
  field: FieldDefinition,
  fieldPath: readonly LocalName[],
): FieldBindingCandidate {
  return {
    cardinality: field.cardinality,
    ...(field.authoring?.control === undefined ? {} : { control: field.authoring.control }),
    fieldPath: [...fieldPath],
    ...(field.itemKind === undefined ? {} : { itemKind: field.itemKind }),
    kind: field.kind,
    label: cloneContractValue(field.label),
  };
}

function flattenModelFields(fields: readonly FieldDefinition[]): IndexedField[] {
  const flattened: IndexedField[] = [];
  const visit = (siblings: readonly FieldDefinition[], prefix: readonly LocalName[]): void => {
    const ordered = siblings
      .map((field, index) => ({ field, index }))
      .sort(
        (left, right) =>
          (left.field.authoring?.order ?? Number.MAX_SAFE_INTEGER) -
            (right.field.authoring?.order ?? Number.MAX_SAFE_INTEGER) || left.index - right.index,
      );
    for (const { field } of ordered) {
      const fieldPath = [...prefix, field.id];
      flattened.push({ field, fieldPath });
      if (field.kind === 'object' && field.cardinality === 'one' && field.fields !== undefined) {
        visit(field.fields, fieldPath);
      }
    }
  };
  visit(fields, []);
  return flattened;
}

function resolveFieldPath(
  fields: readonly IndexedField[],
  fieldPath: readonly LocalName[],
): IndexedField | undefined {
  return fields.find((candidate) => samePath(candidate.fieldPath, fieldPath));
}

function fieldMatchesPort(field: FieldDefinition, port: BlockPortDefinition): boolean {
  return (
    fieldIsMultiple(field) === port.multiple && fieldKindMatchesValueType(field, port.valueType)
  );
}

function fieldIsMultiple(field: FieldDefinition): boolean {
  return field.cardinality === 'many';
}

function fieldKindMatchesValueType(field: FieldDefinition, valueType: string): boolean {
  const kind = effectiveFieldKind(field);
  if (kind === valueType) {
    return true;
  }
  if (valueType === 'text') {
    return kind === 'string' || kind === 'enum';
  }
  if (valueType === 'number') {
    return kind === 'decimal' || kind === 'integer';
  }
  return false;
}

function effectiveFieldKind(field: FieldDefinition): string {
  return field.kind === 'collection' ? (field.itemKind ?? 'object') : field.kind;
}

function visitNodes(nodes: readonly BlueprintNode[], visit: (node: BlueprintNode) => void): void {
  for (const node of nodes) {
    visit(node);
    for (const slot of Object.keys(node.slots).sort(compareCodeUnits)) {
      visitNodes(node.slots[slot] ?? [], visit);
    }
  }
}

function diagnostic(
  code: QualifiedName,
  defaultMessage: string,
  severity: StudioDiagnostic['severity'],
  parameters?: Record<string, JsonPrimitive>,
  location?: StudioDiagnostic['location'],
): StudioDiagnostic {
  return {
    code,
    ...(location === undefined ? {} : { location }),
    message: { defaultMessage, key: code },
    ...(parameters === undefined ? {} : { parameters }),
    severity,
  };
}

function blockKey(type: string, version: string): string {
  return `${type}@${version}`;
}

function samePath(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function compareCodeUnits(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}
