import type {
  AuthoringSaveAsNewTypeRequest,
  AuthoringSaveIntent,
  AuthoringSaveItemRequest,
  AuthoringSaveNewTypeVersionRequest,
  AuthoringSavePlan,
  AuthoringSaveResult,
  AuthoringSessionSnapshot,
  AuthoringStartRequest,
  AuthoringTargetResolution,
  AuthoringTargetResolveRequest,
  AuthoringTypeListPage,
  AuthoringTypeListQuery,
  EntryDocument,
  QualifiedName,
  StudioCommand,
} from '@kumwe/studio-protocol';

export interface ContextualAuthoringLaunchAssertion {
  expect: AuthoringSessionSnapshot;
  /** Entry value sets that this launch must not have copied. */
  forbiddenEntryValues?: EntryDocument['values'][];
  name: string;
  request: AuthoringStartRequest;
}

export interface ContextualAuthoringCommandAssertion {
  commands: StudioCommand[];
  expect: AuthoringSessionSnapshot;
  startName: string;
}

export type ContextualAuthoringSaveRequest =
  AuthoringSaveAsNewTypeRequest | AuthoringSaveItemRequest | AuthoringSaveNewTypeVersionRequest;

export interface ContextualAuthoringSaveAssertion {
  /** Exact coordinated state immediately before the save intent is planned. */
  before: AuthoringSessionSnapshot;
  expectPlan: AuthoringSavePlan;
  expectResult: AuthoringSaveResult;
  intent: AuthoringSaveIntent;
  request: ContextualAuthoringSaveRequest;
}

/**
 * Pure-data first-stride vector. It intentionally remains narrower than the
 * complete `authoring-web` profile: presentation continuity, contribution
 * lifecycle, browser accessibility, and real-host qualification remain open.
 */
export interface ContextualAuthoringStrideVector {
  authoring?: ContextualAuthoringCommandAssertion;
  contractVersion: string;
  description: string;
  id: QualifiedName;
  kind: 'contextual-authoring-stride-vector';
  launches: ContextualAuthoringLaunchAssertion[];
  requirements: string[];
  saves: ContextualAuthoringSaveAssertion[];
  target: {
    expect: AuthoringTargetResolution;
    request: AuthoringTargetResolveRequest;
  };
  types: {
    expect: AuthoringTypeListPage;
    query: AuthoringTypeListQuery;
  };
}

export interface ContextualAuthoringConformanceSession {
  dispatch(command: Readonly<StudioCommand>): Promise<void> | void;
  observe(): Promise<AuthoringSessionSnapshot> | AuthoringSessionSnapshot;
}

/**
 * Selector- and framework-neutral adapter. A browser claimant maps these
 * semantic calls onto its real shell; a core or host claimant maps them onto
 * the public session/port APIs. Neither mapping leaks selectors into vectors.
 */
export interface ContextualAuthoringConformanceAdapter {
  listTypes(query: Readonly<AuthoringTypeListQuery>): Promise<AuthoringTypeListPage>;
  open(
    snapshot: Readonly<AuthoringSessionSnapshot>,
  ): ContextualAuthoringConformanceSession | Promise<ContextualAuthoringConformanceSession>;
  planSave(intent: Readonly<AuthoringSaveIntent>): Promise<AuthoringSavePlan>;
  resolveTarget(
    request: Readonly<AuthoringTargetResolveRequest>,
  ): Promise<AuthoringTargetResolution>;
  saveAsNewType(request: Readonly<AuthoringSaveAsNewTypeRequest>): Promise<AuthoringSaveResult>;
  saveItem(request: Readonly<AuthoringSaveItemRequest>): Promise<AuthoringSaveResult>;
  saveNewTypeVersion(
    request: Readonly<AuthoringSaveNewTypeVersionRequest>,
  ): Promise<AuthoringSaveResult>;
  start(request: Readonly<AuthoringStartRequest>): Promise<AuthoringSessionSnapshot>;
}

export interface ContextualAuthoringStrideResult {
  /** This first increment is executable but is not the complete profile. */
  completeProfile: false;
  mismatches: string[];
  passed: boolean;
  profile: 'studio.profile/authoring-web';
  vectorId: QualifiedName;
}

/**
 * Replays target resolution, exact launches, coordinated typed commands, and
 * all three host-authoritative save boundaries without consulting DOM/CSS
 * selectors. The runner compares exact canonical observations and enforces
 * cross-document invariants that a structurally valid individual document
 * cannot express by itself.
 */
export async function runContextualAuthoringStrideVector(
  vector: Readonly<ContextualAuthoringStrideVector>,
  adapter: Readonly<ContextualAuthoringConformanceAdapter>,
): Promise<ContextualAuthoringStrideResult> {
  const pristine = stableJson(vector);
  const mismatches: string[] = [];

  const target = cloneJson(await adapter.resolveTarget(cloneJson(vector.target.request)));
  compareExact(mismatches, 'target resolution', target, vector.target.expect);

  const types = cloneJson(await adapter.listTypes(cloneJson(vector.types.query)));
  compareExact(mismatches, 'reusable content type page', types, vector.types.expect);
  for (const [index, summary] of types.items.entries()) {
    if (hasOwnMember(summary, 'values') || hasOwnMember(summary, 'entry')) {
      mismatches.push(`reusable content type summary ${index} contains Entry values`);
    }
  }

  const launches = new Map<string, AuthoringSessionSnapshot>();
  for (const [index, launch] of vector.launches.entries()) {
    const path = `launches[${index}] (${launch.name})`;
    const snapshot = cloneJson(await adapter.start(cloneJson(launch.request)));
    compareExact(mismatches, path, snapshot, launch.expect);
    assertLaunchInvariants(mismatches, path, launch, snapshot);
    if (launches.has(launch.name)) {
      mismatches.push(`${path} duplicates a launch name`);
    }
    launches.set(launch.name, snapshot);
  }

  if (vector.authoring !== undefined) {
    const initial = launches.get(vector.authoring.startName);
    if (initial === undefined) {
      mismatches.push(`authoring references unknown launch ${vector.authoring.startName}`);
    } else {
      const session = await adapter.open(cloneJson(initial));
      for (const [index, command] of vector.authoring.commands.entries()) {
        assertCommandTarget(mismatches, `authoring.commands[${index}]`, initial, command);
        await session.dispatch(cloneJson(command));
      }
      const observed = cloneJson(await session.observe());
      compareExact(mismatches, 'coordinated authoring state', observed, vector.authoring.expect);
      assertSnapshotCoordinates(mismatches, 'coordinated authoring state', observed);
    }
  }

  for (const [index, save] of vector.saves.entries()) {
    const path = `saves[${index}] (${save.intent.draft.outcome})`;
    if (save.before.sessionId !== save.intent.sessionId) {
      mismatches.push(`${path}.before belongs to another session`);
    }
    const plan = cloneJson(await adapter.planSave(cloneJson(save.intent)));
    compareExact(mismatches, `${path}.plan`, plan, save.expectPlan);
    assertSaveBoundary(mismatches, path, save.before, save.intent, plan, save.request);
    const result = cloneJson(await commitSave(adapter, cloneJson(save.request)));
    compareExact(mismatches, `${path}.result`, result, save.expectResult);
    if (result.outcome !== save.intent.draft.outcome) {
      mismatches.push(`${path}.result outcome differs from the planned intent`);
    }
    assertSnapshotCoordinates(mismatches, `${path}.result.session`, result.session);
    assertSaveResultBoundary(mismatches, path, save.before, save.intent, result);
  }

  if (stableJson(vector) !== pristine) {
    mismatches.push('adapter mutated the contextual authoring vector');
  }

  return {
    completeProfile: false,
    mismatches,
    passed: mismatches.length === 0,
    profile: 'studio.profile/authoring-web',
    vectorId: vector.id,
  };
}

function assertLaunchInvariants(
  mismatches: string[],
  path: string,
  launch: Readonly<ContextualAuthoringLaunchAssertion>,
  snapshot: Readonly<AuthoringSessionSnapshot>,
): void {
  if (snapshot.target.id !== launch.request.targetId) {
    mismatches.push(`${path} resolved another target`);
  }
  compareExact(
    mismatches,
    `${path}.resourceContext`,
    snapshot.resourceContext,
    launch.request.resourceContext,
  );
  compareExact(mismatches, `${path}.start`, snapshot.start, launch.request.source);
  assertSnapshotCoordinates(mismatches, path, snapshot);

  if (launch.request.source.kind === 'blank') {
    if (snapshot.type !== undefined || snapshot.state.coordinates.type !== undefined) {
      mismatches.push(`${path} blank start unexpectedly resolves a reusable type`);
    }
  } else if (launch.request.source.kind === 'from-type') {
    compareExact(
      mismatches,
      `${path}.type reference`,
      snapshot.state.coordinates.type,
      launch.request.source.type,
    );
    if (snapshot.type === undefined) {
      mismatches.push(`${path} did not return the selected reusable type definition`);
    } else {
      compareExact(
        mismatches,
        `${path}.type definition reference`,
        referenceOfType(snapshot.type),
        launch.request.source.type,
      );
      if (hasOwnMember(snapshot.type, 'values') || hasOwnMember(snapshot.type, 'entry')) {
        mismatches.push(`${path} reusable type contains Entry values`);
      }
    }
  }

  for (const [index, forbidden] of (launch.forbiddenEntryValues ?? []).entries()) {
    if (stableJson(snapshot.state.entry.values) === stableJson(forbidden)) {
      mismatches.push(`${path} copied forbidden Entry values set ${index}`);
    }
  }
}

function assertSnapshotCoordinates(
  mismatches: string[],
  path: string,
  snapshot: Readonly<AuthoringSessionSnapshot>,
): void {
  const { coordinates } = snapshot.state;
  compareExact(mismatches, `${path}.model coordinate`, coordinates.model, {
    id: snapshot.state.model.id,
    revision: snapshot.state.model.revision,
    version: snapshot.state.model.version,
  });
  compareExact(mismatches, `${path}.blueprint coordinate`, coordinates.blueprint, {
    id: snapshot.state.blueprint.id,
    revision: snapshot.state.blueprint.revision,
    version: snapshot.state.blueprint.version,
  });
  compareExact(mismatches, `${path}.entry coordinate`, coordinates.entry, {
    id: snapshot.state.entry.id,
    revision: snapshot.state.entry.revision,
  });
  compareExact(
    mismatches,
    `${path}.blueprint model lock`,
    snapshot.state.blueprint.model,
    coordinates.model,
  );
  compareExact(
    mismatches,
    `${path}.entry model lock`,
    snapshot.state.entry.model,
    coordinates.model,
  );
  if (snapshot.type === undefined) {
    if (coordinates.type !== undefined) {
      mismatches.push(`${path} has type coordinates without a type definition`);
    }
  } else {
    compareExact(
      mismatches,
      `${path}.type coordinate`,
      coordinates.type,
      referenceOfType(snapshot.type),
    );
    compareExact(mismatches, `${path}.type model lock`, snapshot.type.model, coordinates.model);
    if (snapshot.type.authoringPolicy.itemComposition === 'denied') {
      compareExact(
        mismatches,
        `${path}.type blueprint lock`,
        snapshot.type.blueprint,
        coordinates.blueprint,
      );
    }
    if (hasOwnMember(snapshot.type, 'values') || hasOwnMember(snapshot.type, 'entry')) {
      mismatches.push(`${path} reusable type contains Entry values`);
    }
  }
}

function assertCommandTarget(
  mismatches: string[],
  path: string,
  snapshot: Readonly<AuthoringSessionSnapshot>,
  command: Readonly<StudioCommand>,
): void {
  const expectedArtifactId =
    command.type === 'studio.command/add-model-field'
      ? snapshot.state.model.id
      : command.type === 'studio.command/set-field-value'
        ? snapshot.state.entry.id
        : snapshot.state.blueprint.id;
  if (command.artifactId !== expectedArtifactId) {
    mismatches.push(`${path} targets the wrong separately governed artifact`);
  }
  if (command.sessionGeneration !== snapshot.sessionGeneration) {
    mismatches.push(`${path} carries another session generation`);
  }
}

function assertSaveBoundary(
  mismatches: string[],
  path: string,
  before: Readonly<AuthoringSessionSnapshot>,
  intent: Readonly<AuthoringSaveIntent>,
  plan: Readonly<AuthoringSavePlan>,
  request: Readonly<ContextualAuthoringSaveRequest>,
): void {
  const outcome = intent.draft.outcome;
  if (plan.outcome !== outcome || request.draft.outcome !== outcome) {
    mismatches.push(`${path} crosses save-outcome boundaries`);
  }
  if (plan.sessionId !== intent.sessionId) {
    mismatches.push(`${path}.plan belongs to another session`);
  }
  compareExact(mismatches, `${path}.plan expected coordinates`, plan.expected, intent.expected);
  compareExact(mismatches, `${path}.request plan`, request.plan, {
    id: plan.id,
    revision: plan.revision,
  });
  compareExact(mismatches, `${path}.request draft`, request.draft, intent.draft);

  if (outcome === 'save-item') {
    if (request.kind !== 'authoring-save-item-request') {
      mismatches.push(`${path} did not use the save-item host operation`);
    }
    if (!plan.affectedArtifacts.includes('entry')) {
      mismatches.push(`${path}.plan does not affect the Entry`);
    }
    if (
      plan.affectedArtifacts.some(
        (artifact) => artifact === 'model' || artifact === 'reusable-content-type',
      )
    ) {
      mismatches.push(`${path}.plan would mutate the reusable type during item save`);
    }
    if (intent.draft.itemBlueprint === undefined) {
      if (plan.affectedArtifacts.includes('blueprint')) {
        mismatches.push(`${path}.plan affects a Blueprint without an item-local draft`);
      }
    } else {
      if (before.type?.authoringPolicy.itemComposition !== 'overrides') {
        mismatches.push(`${path} carries item-local composition without override authority`);
      }
      if (!plan.affectedArtifacts.includes('blueprint')) {
        mismatches.push(`${path}.plan omits the item-local Blueprint`);
      }
    }
  } else {
    const expectedKind =
      outcome === 'save-new-type-version'
        ? 'authoring-save-new-type-version-request'
        : 'authoring-save-as-new-type-request';
    if (request.kind !== expectedKind) {
      mismatches.push(`${path} did not use its distinct type-save host operation`);
    }
    if (plan.affectedArtifacts.includes('entry')) {
      mismatches.push(`${path}.plan leaks the Entry into a reusable-type save`);
    }
    for (const required of ['model', 'blueprint', 'reusable-content-type'] as const) {
      if (!plan.affectedArtifacts.includes(required)) {
        mismatches.push(`${path}.plan omits affected ${required}`);
      }
    }
    if (!plan.confirmationRequired) {
      mismatches.push(`${path}.plan does not require consequence confirmation`);
    }
    if (
      hasOwnMember(intent.draft, 'entry') ||
      hasOwnMember(request.draft, 'entry') ||
      hasOwnMember(intent.draft, 'values') ||
      hasOwnMember(request.draft, 'values')
    ) {
      mismatches.push(`${path} carries an Entry artifact into a reusable-type operation`);
    }
  }
}

function assertSaveResultBoundary(
  mismatches: string[],
  path: string,
  before: Readonly<AuthoringSessionSnapshot>,
  intent: Readonly<AuthoringSaveIntent>,
  result: Readonly<AuthoringSaveResult>,
): void {
  if (result.session.sessionId !== intent.sessionId) {
    mismatches.push(`${path}.result belongs to another session`);
  }

  if (intent.draft.outcome === 'save-item') {
    compareExact(mismatches, `${path}.result reusable type`, result.session.type, before.type);
    compareExact(
      mismatches,
      `${path}.result reusable type coordinate`,
      result.session.state.coordinates.type,
      before.state.coordinates.type,
    );
    return;
  }

  compareExact(
    mismatches,
    `${path}.result Entry values`,
    result.session.state.entry.values,
    before.state.entry.values,
  );
  compareExact(
    mismatches,
    `${path}.result Entry dirty state`,
    result.session.state.dirty.includes('entry'),
    before.state.dirty.includes('entry'),
  );
  if (
    result.session.type !== undefined &&
    (hasOwnMember(result.session.type, 'entry') || hasOwnMember(result.session.type, 'values'))
  ) {
    mismatches.push(`${path}.result reusable type contains an Entry artifact`);
  }
}

async function commitSave(
  adapter: Readonly<ContextualAuthoringConformanceAdapter>,
  request: ContextualAuthoringSaveRequest,
): Promise<AuthoringSaveResult> {
  switch (request.kind) {
    case 'authoring-save-item-request':
      return adapter.saveItem(request);
    case 'authoring-save-new-type-version-request':
      return adapter.saveNewTypeVersion(request);
    case 'authoring-save-as-new-type-request':
      return adapter.saveAsNewType(request);
  }
}

function referenceOfType(type: { id: string; revision: string; version: string }): {
  id: string;
  revision: string;
  version: string;
} {
  return { id: type.id, revision: type.revision, version: type.version };
}

function hasOwnMember(value: unknown, member: string): boolean {
  return value !== null && typeof value === 'object' && Object.hasOwn(value, member);
}

function compareExact(
  mismatches: string[],
  path: string,
  actual: unknown,
  expected: unknown,
): void {
  if (stableJson(actual) !== stableJson(expected)) {
    mismatches.push(`${path} differs from the vector expectation`);
  }
}

function cloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function stableJson(value: unknown): string {
  return JSON.stringify(sortJson(value)) ?? 'undefined';
}

function sortJson(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((member) => sortJson(member));
  }
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
        .map(([key, member]) => [key, sortJson(member)]),
    );
  }
  return value;
}
