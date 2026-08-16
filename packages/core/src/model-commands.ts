import type { AddModelFieldCommand, ContentModelDocument } from '@kumwe/studio-protocol';
import { cloneContractValue } from './clone.js';
import { StudioCommandError } from './commands.js';

export function applyModelCommand(
  model: ContentModelDocument,
  command: AddModelFieldCommand,
): ContentModelDocument {
  if (command.artifactId !== model.id) {
    throw new StudioCommandError(
      'node-not-found',
      `Command targets ${command.artifactId}, not content model ${model.id}.`,
    );
  }
  if (model.status !== 'draft') {
    throw new StudioCommandError(
      'artifact-not-draft',
      `Content model ${model.id} is ${model.status}; fields are added through a new draft.`,
    );
  }
  if (model.fields.some((field) => field.id === command.payload.field.id)) {
    throw new StudioCommandError(
      'duplicate-field',
      `Field ${command.payload.field.id} already exists on ${model.id}.`,
    );
  }
  const position = command.payload.position ?? model.fields.length;
  if (!Number.isInteger(position) || position < 0 || position > model.fields.length) {
    throw new StudioCommandError(
      'invalid-index',
      `Field position ${position} is outside the model's field list.`,
    );
  }

  const next = cloneContractValue(model);
  next.fields.splice(position, 0, cloneContractValue(command.payload.field));
  return next;
}
