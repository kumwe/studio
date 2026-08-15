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
  | 'studio.shell/announce-command-failed'
  | 'studio.shell/announce-deleted'
  | 'studio.shell/announce-duplicated'
  | 'studio.shell/announce-moved-down'
  | 'studio.shell/announce-moved-up'
  | 'studio.shell/announce-redid'
  | 'studio.shell/announce-undid'
  | 'studio.shell/block-actions'
  | 'studio.shell/canvas-empty'
  | 'studio.shell/canvas-label'
  | 'studio.shell/delete'
  | 'studio.shell/duplicate'
  | 'studio.shell/history-label'
  | 'studio.shell/inspector-empty'
  | 'studio.shell/inspector-heading'
  | 'studio.shell/inspector-identifier'
  | 'studio.shell/inspector-properties'
  | 'studio.shell/inspector-type'
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
  | 'studio.shell/status-label'
  | 'studio.shell/undo'
  | 'studio.shell/unresolved-block';

export type StudioMessageOverrides = Partial<Record<StudioMessageKey, StudioMessage>>;

export const studioMessages: Record<StudioMessageKey, StudioMessage> = {
  'studio.shell/announce-command-failed': { defaultMessage: 'Command failed: {message}' },
  'studio.shell/announce-deleted': { defaultMessage: 'Deleted {label} block' },
  'studio.shell/announce-duplicated': { defaultMessage: 'Duplicated {label}' },
  'studio.shell/announce-moved-down': { defaultMessage: 'Moved {label} down' },
  'studio.shell/announce-moved-up': { defaultMessage: 'Moved {label} up' },
  'studio.shell/announce-redid': { defaultMessage: 'Redid change' },
  'studio.shell/announce-undid': { defaultMessage: 'Undid change' },
  'studio.shell/block-actions': { defaultMessage: 'Block actions' },
  'studio.shell/canvas-empty': { defaultMessage: 'Choose a block to begin composing.' },
  'studio.shell/canvas-label': { defaultMessage: 'Blueprint structure' },
  'studio.shell/delete': { defaultMessage: 'Delete' },
  'studio.shell/duplicate': { defaultMessage: 'Duplicate' },
  'studio.shell/history-label': { defaultMessage: 'History' },
  'studio.shell/inspector-empty': { defaultMessage: 'Select a block to inspect its contract.' },
  'studio.shell/inspector-heading': { defaultMessage: 'Inspector' },
  'studio.shell/inspector-identifier': { defaultMessage: 'Identifier' },
  'studio.shell/inspector-properties': { defaultMessage: 'Properties' },
  'studio.shell/inspector-type': { defaultMessage: 'Type' },
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
  'studio.shell/status-label': { defaultMessage: 'Status' },
  'studio.shell/undo': { defaultMessage: 'Undo' },
  'studio.shell/unresolved-block': { defaultMessage: '(unresolved)' },
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
