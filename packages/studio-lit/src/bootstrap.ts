import {
  createCoreProductionBlockDefinitions,
  createCoreProductionPatterns,
} from '@kumwe/studio-core';
import type {
  BlockDefinition,
  ExperimentalShellConfiguration,
  PatternDocument,
  StudioConfiguration,
} from '@kumwe/studio-protocol';

export interface StudioStandaloneExtensions {
  blockDefinitions?: readonly BlockDefinition[];
  patterns?: readonly PatternDocument[];
}

export interface StudioStandaloneSetup {
  configuration: ExperimentalShellConfiguration;
  patterns: PatternDocument[];
}

/**
 * Build the supported standalone setup. First-party definitions and patterns
 * always lead; a host appends only its own negotiated contributions.
 */
export function createStudioStandaloneSetup(
  session: StudioConfiguration,
  extensions: StudioStandaloneExtensions = {},
): StudioStandaloneSetup {
  const blockDefinitions = mergeDefinitions(
    createCoreProductionBlockDefinitions(),
    extensions.blockDefinitions ?? [],
  );
  const patterns = mergePatterns(createCoreProductionPatterns(), extensions.patterns ?? []);
  return {
    configuration: { blockDefinitions, session },
    patterns,
  };
}

function mergeDefinitions(
  firstParty: readonly BlockDefinition[],
  extensions: readonly BlockDefinition[],
): BlockDefinition[] {
  const result = firstParty.map((definition) => structuredClone(definition));
  const keys = new Set(result.map((definition) => `${definition.type}@${definition.version}`));
  for (const definition of extensions) {
    const key = `${definition.type}@${definition.version}`;
    if (keys.has(key)) throw new TypeError(`Studio block definition ${key} is already registered.`);
    keys.add(key);
    result.push(structuredClone(definition));
  }
  return result;
}

function mergePatterns(
  firstParty: readonly PatternDocument[],
  extensions: readonly PatternDocument[],
): PatternDocument[] {
  const result = firstParty.map((pattern) => structuredClone(pattern));
  const keys = new Set(result.map((pattern) => `${pattern.id}@${pattern.version}`));
  for (const pattern of extensions) {
    const key = `${pattern.id}@${pattern.version}`;
    if (keys.has(key)) throw new TypeError(`Studio pattern ${key} is already registered.`);
    keys.add(key);
    result.push(structuredClone(pattern));
  }
  return result;
}
