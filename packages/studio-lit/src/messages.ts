/**
 * The single message catalog for every string the shell chrome renders.
 * Hosts localize the shell by supplying overrides keyed by these entries;
 * block-supplied strings travel as `MessageReference` values instead and are
 * resolved by the host outside this catalog.
 */
export interface StudioMessage {
  defaultMessage: string;
}

export type StudioMessageKey =
  | 'studio.shell/announce-binding-removed'
  | 'studio.shell/announce-binding-set'
  | 'studio.shell/announce-command-failed'
  | 'studio.shell/announce-conflict'
  | 'studio.shell/announce-deleted'
  | 'studio.shell/announce-drag-cancelled'
  | 'studio.shell/announce-dropped'
  | 'studio.shell/announce-duplicated'
  | 'studio.shell/announce-edit-cancelled'
  | 'studio.shell/announce-inserted'
  | 'studio.shell/announce-invalid-value'
  | 'studio.shell/announce-moved-down'
  | 'studio.shell/announce-moved-up'
  | 'studio.shell/announce-name-required'
  | 'studio.shell/announce-override-removed'
  | 'studio.shell/announce-override-set'
  | 'studio.shell/announce-property-set'
  | 'studio.shell/announce-property-unset'
  | 'studio.shell/announce-redid'
  | 'studio.shell/announce-selection-cleared'
  | 'studio.shell/announce-undid'
  | 'studio.shell/announce-viewport-changed'
  | 'studio.shell/block-actions'
  | 'studio.shell/breadcrumb-label'
  | 'studio.shell/canvas-empty'
  | 'studio.shell/canvas-label'
  | 'studio.shell/command-clear-selection'
  | 'studio.shell/command-insert'
  | 'studio.shell/command-palette-empty'
  | 'studio.shell/command-palette-hint'
  | 'studio.shell/command-palette-input-label'
  | 'studio.shell/command-palette-label'
  | 'studio.shell/command-palette-results-label'
  | 'studio.shell/command-palette-toggle'
  | 'studio.shell/delete'
  | 'studio.shell/diagnostics-empty'
  | 'studio.shell/diagnostics-heading'
  | 'studio.shell/drag-drop-position'
  | 'studio.shell/duplicate'
  | 'studio.shell/history-label'
  | 'studio.shell/inspector-add-override'
  | 'studio.shell/inspector-add-override-name-label'
  | 'studio.shell/inspector-add-override-value-label'
  | 'studio.shell/inspector-add-property'
  | 'studio.shell/inspector-add-property-name-label'
  | 'studio.shell/inspector-add-property-value-label'
  | 'studio.shell/inspector-binding-port-label'
  | 'studio.shell/inspector-binding-value-label'
  | 'studio.shell/inspector-bindings-empty'
  | 'studio.shell/inspector-bindings-heading'
  | 'studio.shell/inspector-empty'
  | 'studio.shell/inspector-heading'
  | 'studio.shell/inspector-hint'
  | 'studio.shell/inspector-identifier'
  | 'studio.shell/inspector-override-value-label'
  | 'studio.shell/inspector-overrides-empty'
  | 'studio.shell/inspector-overrides-heading'
  | 'studio.shell/inspector-properties'
  | 'studio.shell/inspector-properties-empty'
  | 'studio.shell/inspector-property-value-label'
  | 'studio.shell/inspector-read-only'
  | 'studio.shell/inspector-remove-binding'
  | 'studio.shell/inspector-remove-binding-label'
  | 'studio.shell/inspector-remove-override'
  | 'studio.shell/inspector-remove-override-label'
  | 'studio.shell/inspector-set-binding'
  | 'studio.shell/inspector-type'
  | 'studio.shell/inspector-unset'
  | 'studio.shell/inspector-unset-label'
  | 'studio.shell/move-down'
  | 'studio.shell/move-up'
  | 'studio.shell/outline-empty'
  | 'studio.shell/outline-heading'
  | 'studio.shell/outline-hint'
  | 'studio.shell/palette-heading'
  | 'studio.shell/palette-label'
  | 'studio.shell/redo'
  | 'studio.shell/save-state-saved'
  | 'studio.shell/save-state-unsaved'
  | 'studio.shell/severity-blocking'
  | 'studio.shell/severity-error'
  | 'studio.shell/severity-information'
  | 'studio.shell/severity-warning'
  | 'studio.shell/status-label'
  | 'studio.shell/undo'
  | 'studio.shell/unresolved-block'
  | 'studio.shell/viewport-label';

export type StudioMessageOverrides = Partial<Record<StudioMessageKey, StudioMessage>>;

export const studioMessages: Record<StudioMessageKey, StudioMessage> = {
  'studio.shell/announce-binding-removed': { defaultMessage: 'Removed the {port} binding' },
  'studio.shell/announce-binding-set': { defaultMessage: 'Set the {port} binding' },
  'studio.shell/announce-command-failed': { defaultMessage: 'Command failed: {message}' },
  'studio.shell/announce-conflict': {
    defaultMessage:
      'The change was rejected: {message} The document is unchanged; refresh the session or undo before retrying.',
  },
  'studio.shell/announce-deleted': { defaultMessage: 'Deleted {label} block' },
  'studio.shell/announce-drag-cancelled': {
    defaultMessage: 'Reorder cancelled. {label} kept its position.',
  },
  'studio.shell/announce-dropped': {
    defaultMessage: 'Moved {label} to position {position} of {count}',
  },
  'studio.shell/announce-duplicated': { defaultMessage: 'Duplicated {label}' },
  'studio.shell/announce-edit-cancelled': {
    defaultMessage: 'Edit cancelled. {property} kept its value.',
  },
  'studio.shell/announce-inserted': { defaultMessage: 'Inserted {label}' },
  'studio.shell/announce-invalid-value': {
    defaultMessage: 'The {label} value is not valid JSON. Nothing was changed.',
  },
  'studio.shell/announce-moved-down': { defaultMessage: 'Moved {label} down' },
  'studio.shell/announce-moved-up': { defaultMessage: 'Moved {label} up' },
  'studio.shell/announce-name-required': {
    defaultMessage: 'Enter a name before applying the change.',
  },
  'studio.shell/announce-override-removed': {
    defaultMessage: 'Removed the {property} override for the {viewport} viewport',
  },
  'studio.shell/announce-override-set': {
    defaultMessage: 'Set the {property} override for the {viewport} viewport',
  },
  'studio.shell/announce-property-set': { defaultMessage: 'Set {property}' },
  'studio.shell/announce-property-unset': { defaultMessage: 'Unset {property}' },
  'studio.shell/announce-redid': { defaultMessage: 'Redid change' },
  'studio.shell/announce-selection-cleared': { defaultMessage: 'Selection cleared' },
  'studio.shell/announce-undid': { defaultMessage: 'Undid change' },
  'studio.shell/announce-viewport-changed': { defaultMessage: 'Previewing the {label} viewport' },
  'studio.shell/block-actions': { defaultMessage: 'Block actions' },
  'studio.shell/breadcrumb-label': { defaultMessage: 'Selection path' },
  'studio.shell/canvas-empty': { defaultMessage: 'Choose a block to begin composing.' },
  'studio.shell/canvas-label': { defaultMessage: 'Blueprint structure' },
  'studio.shell/command-clear-selection': { defaultMessage: 'Clear selection' },
  'studio.shell/command-insert': { defaultMessage: 'Insert {label}' },
  'studio.shell/command-palette-empty': { defaultMessage: 'No commands match the filter.' },
  'studio.shell/command-palette-hint': {
    defaultMessage:
      'Type to filter commands. Arrow Down moves into the results, Arrow Up returns to the filter, Enter runs a command, Escape closes.',
  },
  'studio.shell/command-palette-input-label': { defaultMessage: 'Filter commands' },
  'studio.shell/command-palette-label': { defaultMessage: 'Command palette' },
  'studio.shell/command-palette-results-label': { defaultMessage: 'Matching commands' },
  'studio.shell/command-palette-toggle': { defaultMessage: 'Commands' },
  'studio.shell/delete': { defaultMessage: 'Delete' },
  'studio.shell/diagnostics-empty': { defaultMessage: 'No issues' },
  'studio.shell/diagnostics-heading': { defaultMessage: 'Diagnostics' },
  'studio.shell/drag-drop-position': {
    defaultMessage: 'Moving {label} to position {position} of {count}',
  },
  'studio.shell/duplicate': { defaultMessage: 'Duplicate' },
  'studio.shell/history-label': { defaultMessage: 'History' },
  'studio.shell/inspector-add-override': { defaultMessage: 'Add override' },
  'studio.shell/inspector-add-override-name-label': { defaultMessage: 'Override property name' },
  'studio.shell/inspector-add-override-value-label': { defaultMessage: 'Override value as JSON' },
  'studio.shell/inspector-add-property': { defaultMessage: 'Add property' },
  'studio.shell/inspector-add-property-name-label': { defaultMessage: 'New property name' },
  'studio.shell/inspector-add-property-value-label': {
    defaultMessage: 'New property value as JSON',
  },
  'studio.shell/inspector-binding-port-label': { defaultMessage: 'Binding port name' },
  'studio.shell/inspector-binding-value-label': { defaultMessage: 'Binding value as JSON' },
  'studio.shell/inspector-bindings-empty': { defaultMessage: 'No bindings' },
  'studio.shell/inspector-bindings-heading': { defaultMessage: 'Bindings' },
  'studio.shell/inspector-empty': { defaultMessage: 'Select a block to inspect its contract.' },
  'studio.shell/inspector-heading': { defaultMessage: 'Inspector' },
  'studio.shell/inspector-hint': {
    defaultMessage: 'Inputs hold JSON values. Enter applies the edit, Escape reverts it.',
  },
  'studio.shell/inspector-identifier': { defaultMessage: 'Identifier' },
  'studio.shell/inspector-override-value-label': {
    defaultMessage: 'Override of {property} for the {viewport} viewport as JSON',
  },
  'studio.shell/inspector-overrides-empty': {
    defaultMessage: 'No overrides for the {viewport} viewport',
  },
  'studio.shell/inspector-overrides-heading': {
    defaultMessage: 'Overrides for the {viewport} viewport',
  },
  'studio.shell/inspector-properties': { defaultMessage: 'Properties' },
  'studio.shell/inspector-properties-empty': { defaultMessage: 'No properties' },
  'studio.shell/inspector-property-value-label': { defaultMessage: 'Value of {property} as JSON' },
  'studio.shell/inspector-read-only': {
    defaultMessage: 'Editing is disabled because this session is read-only.',
  },
  'studio.shell/inspector-remove-binding': { defaultMessage: 'Remove' },
  'studio.shell/inspector-remove-binding-label': { defaultMessage: 'Remove the {port} binding' },
  'studio.shell/inspector-remove-override': { defaultMessage: 'Remove' },
  'studio.shell/inspector-remove-override-label': {
    defaultMessage: 'Remove the {property} override for the {viewport} viewport',
  },
  'studio.shell/inspector-set-binding': { defaultMessage: 'Set binding' },
  'studio.shell/inspector-type': { defaultMessage: 'Type' },
  'studio.shell/inspector-unset': { defaultMessage: 'Unset' },
  'studio.shell/inspector-unset-label': { defaultMessage: 'Unset {property}' },
  'studio.shell/move-down': { defaultMessage: 'Move down' },
  'studio.shell/move-up': { defaultMessage: 'Move up' },
  'studio.shell/outline-empty': {
    defaultMessage: 'The outline lists blocks once the document has content.',
  },
  'studio.shell/outline-heading': { defaultMessage: 'Outline' },
  'studio.shell/outline-hint': {
    defaultMessage:
      'Arrow keys move focus. Alt+Arrow moves the block. Delete removes it. Ctrl+D or Cmd+D duplicates it.',
  },
  'studio.shell/palette-heading': { defaultMessage: 'Blocks' },
  'studio.shell/palette-label': { defaultMessage: 'Block palette' },
  'studio.shell/redo': { defaultMessage: 'Redo' },
  'studio.shell/save-state-saved': { defaultMessage: 'Saved' },
  'studio.shell/save-state-unsaved': { defaultMessage: 'Unsaved changes' },
  'studio.shell/severity-blocking': { defaultMessage: 'Blocking' },
  'studio.shell/severity-error': { defaultMessage: 'Error' },
  'studio.shell/severity-information': { defaultMessage: 'Information' },
  'studio.shell/severity-warning': { defaultMessage: 'Warning' },
  'studio.shell/status-label': { defaultMessage: 'Status' },
  'studio.shell/undo': { defaultMessage: 'Undo' },
  'studio.shell/unresolved-block': { defaultMessage: '(unresolved)' },
  'studio.shell/viewport-label': { defaultMessage: 'Preview width' },
};

/**
 * Resolves a chrome string: host override first, then the catalog default,
 * then the key itself so a missing entry stays visible instead of vanishing.
 * `{name}` placeholders are replaced from `parameters`.
 */
export function messageText(
  key: StudioMessageKey,
  overrides?: StudioMessageOverrides,
  parameters?: Readonly<Record<string, string>>,
): string {
  const message = overrides?.[key] ?? studioMessages[key];
  const template = message?.defaultMessage ?? key;
  if (parameters === undefined) {
    return template;
  }
  let text = template;
  for (const [name, value] of Object.entries(parameters)) {
    text = text.replaceAll(`{${name}}`, value);
  }
  return text;
}
