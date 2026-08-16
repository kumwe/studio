import type {
  BlueprintBatchOperation,
  BlueprintNode,
  LocalName,
  ThemeDocument,
} from '@kumwe/studio-protocol';
import { cloneContractValue } from './clone.js';

/**
 * The reserved node property that records which theme recipe an author
 * selected. Recipe selection is canonically an atomic batch of set-property
 * operations, so it inherits batch atomicity and verified inverses from the
 * command contract instead of introducing a new command type.
 */
export const RECIPE_MARKER_PROPERTY = 'studio.recipe';

/**
 * Expand a theme recipe selection into the deterministic batch operations
 * that apply it to one node: every design value of the recipe, in sorted
 * member order, followed by the reserved recipe marker property.
 */
export function recipeSelectionOperations(
  node: Readonly<BlueprintNode>,
  theme: Readonly<ThemeDocument>,
  recipeId: LocalName,
): BlueprintBatchOperation[] {
  const recipe = theme.recipes.find((candidate) => candidate.id === recipeId);
  if (recipe === undefined) {
    throw new Error(`Theme ${theme.id} does not declare a recipe ${recipeId}.`);
  }
  if (recipe.blockType !== node.type) {
    throw new Error(
      `Recipe ${recipeId} targets ${recipe.blockType} blocks, not ${node.type} node ${node.id}.`,
    );
  }

  const operations: BlueprintBatchOperation[] = Object.entries(recipe.designValues)
    .sort(([left], [right]) => (left < right ? -1 : 1))
    .map(([property, value]) => ({
      payload: { nodeId: node.id, property, value: cloneContractValue(value) },
      type: 'studio.command/set-property' as const,
    }));
  operations.push({
    payload: { nodeId: node.id, property: RECIPE_MARKER_PROPERTY, value: recipeId },
    type: 'studio.command/set-property',
  });
  return operations;
}
