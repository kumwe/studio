import type {
  BlueprintDocument,
  JsonObject,
  JsonValue,
  QualifiedName,
  StableId,
} from '@kumwe/studio-protocol';

export type AuthoringWebRegion =
  'canvas' | 'command-palette' | 'inspector' | 'outline' | 'palette' | 'preview' | 'viewport';

export type AuthoringWebAction =
  | { kind: 'focus-node'; nodeId: StableId; region: AuthoringWebRegion }
  | {
      key:
        | 'ArrowDown'
        | 'ArrowLeft'
        | 'ArrowRight'
        | 'ArrowUp'
        | 'Delete'
        | 'End'
        | 'Enter'
        | 'Escape'
        | 'Home'
        | 'Tab'
        | 'd'
        | 'y'
        | 'z';
      kind: 'key';
      modifiers: ('Alt' | 'Control' | 'Meta' | 'Shift')[];
      region: AuthoringWebRegion;
    }
  | {
      destination: { parentNodeId?: StableId; position: number; slot?: string };
      kind: 'drag-node';
      nodeId: StableId;
    }
  | {
      kind: 'activate-command';
      payload: JsonObject;
      region: AuthoringWebRegion;
      type: QualifiedName;
    }
  | {
      kind: 'edit-property';
      nodeId: StableId;
      property: string;
      value: JsonValue;
      viewport?: string;
    };

export interface AuthoringWebGiven {
  direction: 'ltr' | 'rtl';
  document: BlueprintDocument;
  locale: string;
  readOnly: boolean;
  reducedMotion: boolean;
  selection: StableId | null;
  viewport: { height: number; width: number; zoomPercent: number };
}

export interface AuthoringWebCommandObservation {
  payload: JsonObject;
  type: QualifiedName;
}

export interface AuthoringWebObservation {
  announcements: { key: QualifiedName; politeness: 'assertive' | 'polite' }[];
  commands: AuthoringWebCommandObservation[];
  dirty: boolean;
  document: BlueprintDocument;
  focus: { nodeId?: StableId; region: AuthoringWebRegion };
  selection: StableId | null;
}

export interface AuthoringWebLane {
  name: string;
  steps: AuthoringWebAction[];
  surface: 'keyboard' | 'pointer' | 'structural-control';
}

export interface AuthoringWebVector {
  contractVersion: string;
  description: string;
  expect: AuthoringWebObservation;
  given: AuthoringWebGiven;
  id: QualifiedName;
  kind: 'authoring-web-vector';
  lanes: AuthoringWebLane[];
  requirements: string[];
}

export interface AuthoringWebConformanceSession {
  dispose?(): Promise<void> | void;
  observe(): Promise<AuthoringWebObservation> | AuthoringWebObservation;
  perform(action: Readonly<AuthoringWebAction>): Promise<void> | void;
}

export interface AuthoringWebConformanceAdapter {
  open(
    given: Readonly<AuthoringWebGiven>,
    lane: Readonly<AuthoringWebLane>,
  ): Promise<AuthoringWebConformanceSession> | AuthoringWebConformanceSession;
}

export interface AuthoringWebLaneResult {
  mismatches: string[];
  name: string;
  observation: AuthoringWebObservation;
  passed: boolean;
  surface: AuthoringWebLane['surface'];
}

export interface AuthoringWebVectorResult {
  lanes: AuthoringWebLaneResult[];
  passed: boolean;
  profile: 'studio.profile/authoring-web';
  vectorId: QualifiedName;
}

/**
 * Replay every interaction lane from an independent copy of the same initial
 * state. The adapter owns browser automation; this runner owns fixture
 * isolation and deterministic observation comparison.
 */
export async function runAuthoringWebVector(
  vector: Readonly<AuthoringWebVector>,
  adapter: Readonly<AuthoringWebConformanceAdapter>,
): Promise<AuthoringWebVectorResult> {
  const pristine = stableJson(vector);
  const lanes: AuthoringWebLaneResult[] = [];

  for (const lane of vector.lanes) {
    const session = await adapter.open(cloneJson(vector.given), cloneJson(lane));
    let observation: AuthoringWebObservation;
    try {
      for (const action of lane.steps) {
        await session.perform(cloneJson(action));
      }
      observation = cloneJson(await session.observe());
    } finally {
      await session.dispose?.();
    }
    const mismatches = compareAuthoringObservation(observation, vector.expect);
    if (stableJson(vector) !== pristine) {
      mismatches.push('adapter mutated the conformance vector');
    }
    lanes.push({
      mismatches,
      name: lane.name,
      observation,
      passed: mismatches.length === 0,
      surface: lane.surface,
    });
  }

  return {
    lanes,
    passed: lanes.every((lane) => lane.passed),
    profile: 'studio.profile/authoring-web',
    vectorId: vector.id,
  };
}

function compareAuthoringObservation(
  actual: Readonly<AuthoringWebObservation>,
  expected: Readonly<AuthoringWebObservation>,
): string[] {
  const mismatches: string[] = [];
  compareExact(mismatches, 'announcements', actual.announcements, expected.announcements);
  compareExact(mismatches, 'commands', actual.commands, expected.commands);
  compareExact(mismatches, 'dirty', actual.dirty, expected.dirty);
  compareExact(mismatches, 'document', actual.document, expected.document);
  compareExact(mismatches, 'focus', actual.focus, expected.focus);
  compareExact(mismatches, 'selection', actual.selection, expected.selection);
  return mismatches;
}

function compareExact(
  mismatches: string[],
  field: string,
  actual: unknown,
  expected: unknown,
): void {
  if (stableJson(actual) !== stableJson(expected)) {
    mismatches.push(`${field} differs from the vector expectation`);
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
