import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  runAuthoringWebVector,
  type AuthoringWebAction,
  type AuthoringWebGiven,
  type AuthoringWebObservation,
  type AuthoringWebRegion,
  type AuthoringWebVector,
} from '../src/index.js';

const vector = JSON.parse(
  await readFile(
    join(
      process.cwd(),
      'packages/testkit/conformance/authoring-web/non-drag-move-equivalence.json',
    ),
    'utf8',
  ),
) as AuthoringWebVector;

describe('authoring-web conformance runner', () => {
  it('replays independent pointer, keyboard, and structural-control lanes', async () => {
    const result = await runAuthoringWebVector(vector, {
      open(given) {
        return createMoveSession(given);
      },
    });

    expect(result.passed).toBe(true);
    expect(result.completeProfile).toBe(false);
    expect(result.mismatches).toEqual([]);
    expect(result.requirements).toEqual(vector.requirements);
    expect(result.lanes.map((lane) => [lane.name, lane.surface, lane.passed])).toEqual([
      ['keyboard-move-down', 'keyboard', true],
      ['explicit-move-control', 'structural-control', true],
      ['pointer-drag-enhancement', 'pointer', true],
    ]);
    expect(result.lanes.every((lane) => lane.mismatches.length === 0)).toBe(true);
  });

  it('returns stable field-level mismatches without turning a failure into a claim', async () => {
    const result = await runAuthoringWebVector(vector, {
      open(given) {
        const observation = emptyObservation(given);
        return { observe: () => observation, perform: () => undefined };
      },
    });

    expect(result.passed).toBe(false);
    expect(result.lanes[0]?.mismatches).toContain('document differs from the vector expectation');
    expect(result.lanes[0]?.mismatches).toContain('dirty differs from the vector expectation');
  });

  it('refuses interaction-equivalence vectors that omit a required surface', async () => {
    const incomplete: AuthoringWebVector = {
      ...structuredClone(vector),
      lanes: vector.lanes.filter(({ surface }) => surface !== 'pointer'),
    };
    const result = await runAuthoringWebVector(incomplete, {
      open(given) {
        return createMoveSession(given);
      },
    });

    expect(result.passed).toBe(false);
    expect(result.mismatches).toEqual(['missing pointer interaction lane']);
    expect(result.lanes.every(({ passed }) => passed)).toBe(true);
    expect(result.completeProfile).toBe(false);
  });

  it.each([
    ['right-to-left', { direction: 'rtl' as const }],
    ['400 percent zoom reflow', { viewport: { height: 256, width: 320, zoomPercent: 400 } }],
    ['reduced motion', { reducedMotion: true }],
  ])('keeps all three semantic lanes equivalent under %s', async (_label, override) => {
    const accessible: AuthoringWebVector = {
      ...structuredClone(vector),
      given: { ...structuredClone(vector.given), ...override },
    };
    const opened: AuthoringWebGiven[] = [];
    const result = await runAuthoringWebVector(accessible, {
      open(given) {
        opened.push(structuredClone(given));
        return createMoveSession(given);
      },
    });

    expect(result.passed).toBe(true);
    expect(opened).toHaveLength(3);
    expect(
      opened.every((given) => JSON.stringify(given) === JSON.stringify(accessible.given)),
    ).toBe(true);
  });
});

function createMoveSession(given: Readonly<AuthoringWebGiven>): {
  observe(): AuthoringWebObservation;
  perform(action: Readonly<AuthoringWebAction>): void;
} {
  const observation = emptyObservation(given);
  let focusedNode = given.selection;

  const move = (): void => {
    if (focusedNode === null) return;
    const index = observation.document.roots.findIndex((node) => node.id === focusedNode);
    const node = observation.document.roots[index];
    if (node === undefined || index >= observation.document.roots.length - 1) return;
    observation.document.roots.splice(index, 1);
    observation.document.roots.splice(index + 1, 0, node);
    observation.announcements = [{ key: 'studio.authoring/node-moved', politeness: 'polite' }];
    observation.commands = [
      {
        payload: { destination: { position: index + 1 }, nodeId: node.id },
        type: 'studio.command/move-node',
      },
    ];
    observation.dirty = true;
    observation.focus = { nodeId: node.id, region: 'outline' };
    observation.selection = node.id;
  };

  return {
    observe: () => structuredClone(observation),
    perform(action) {
      switch (action.kind) {
        case 'focus-node':
          focusedNode = action.nodeId;
          observation.focus = { nodeId: action.nodeId, region: action.region };
          observation.selection = action.nodeId;
          break;
        case 'key':
          if (action.key === 'ArrowDown' && action.modifiers.includes('Alt')) move();
          break;
        case 'activate-command':
          if (action.type === 'studio.command/move-node') move();
          break;
        case 'drag-node':
          focusedNode = action.nodeId;
          move();
          break;
        case 'edit-property':
          break;
      }
    },
  };
}

function emptyObservation(given: Readonly<AuthoringWebGiven>): AuthoringWebObservation {
  const region: AuthoringWebRegion = given.selection === null ? 'canvas' : 'outline';
  return {
    announcements: [],
    commands: [],
    dirty: false,
    document: structuredClone(given.document),
    focus: given.selection === null ? { region } : { nodeId: given.selection, region },
    selection: given.selection,
  };
}
