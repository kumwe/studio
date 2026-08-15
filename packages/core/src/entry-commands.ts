import type {
  EntryDocument,
  JsonObject,
  JsonValue,
  SetFieldValueCommand,
} from '@kumwe/studio-protocol';
import { cloneContractValue } from './clone.js';
import { StudioCommandError } from './commands.js';

export function applyEntryCommand(
  entry: EntryDocument,
  command: SetFieldValueCommand,
): EntryDocument {
  if (command.artifactId !== entry.id) {
    throw new StudioCommandError(
      'node-not-found',
      `Command targets ${command.artifactId}, not entry ${entry.id}.`,
    );
  }
  if (
    command.payload.locale !== undefined &&
    entry.locale !== undefined &&
    command.payload.locale !== entry.locale
  ) {
    throw new StudioCommandError(
      'locale-mismatch',
      `Command targets locale ${command.payload.locale}, but the entry stores ${entry.locale}.`,
    );
  }

  const next = cloneContractValue(entry);
  const path = command.payload.fieldPath;
  let container: JsonObject = next.values;
  for (const [index, segment] of path.entries()) {
    if (index === path.length - 1) {
      setOwnMember(container, segment, cloneContractValue(command.payload.value));
      break;
    }
    const child = Object.hasOwn(container, segment) ? container[segment] : undefined;
    if (child === null || typeof child !== 'object' || Array.isArray(child)) {
      throw new StudioCommandError(
        'property-not-found',
        `Field path segment ${segment} does not resolve to an object value.`,
      );
    }
    container = child;
  }
  return next;
}

function setOwnMember(container: JsonObject, member: string, value: JsonValue): void {
  Object.defineProperty(container, member, {
    configurable: true,
    enumerable: true,
    value,
    writable: true,
  });
}
