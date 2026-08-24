import catalog from './catalogs/en.json' with { type: 'json' };

/** A localized shell string supplied by the package or embedding host. */
export interface StudioMessage {
  defaultMessage: string;
}

/** One entry in the versioned, machine-readable shell message catalog. */
export interface StudioMessageCatalogEntry extends StudioMessage {
  parameters: readonly string[];
}

/** The published shape of a Studio authoring message catalog. */
export interface StudioMessageCatalog {
  readonly $schema: string;
  readonly kind: 'authoring-message-catalog';
  readonly contractVersion: string;
  readonly catalogVersion: string;
  readonly locale: string;
  readonly messages: Readonly<Record<string, StudioMessageCatalogEntry>>;
}

/** Every shell message key, derived from the canonical English catalog. */
export type StudioMessageKey = keyof typeof catalog.messages;

/** Host translations or text overrides keyed by the published catalog. */
export type StudioMessageOverrides = Partial<Record<StudioMessageKey, StudioMessage>>;

/** The complete canonical English catalog, including declared parameters. */
export const studioMessageCatalog: StudioMessageCatalog = catalog as StudioMessageCatalog;

/** Backwards-compatible message map used by existing shell integrations. */
export const studioMessages: Record<StudioMessageKey, StudioMessage> = catalog.messages;

/**
 * Resolves a shell string using a host override first and the catalog default
 * otherwise. Studio shell messages deliberately use the named-interpolation
 * subset of ICU MessageFormat. Unknown parameters are ignored and missing
 * parameters remain visible so malformed translations never fail silently.
 */
export function messageText(
  key: StudioMessageKey,
  overrides?: StudioMessageOverrides,
  parameters?: Readonly<Record<string, string>>,
): string {
  const message = overrides?.[key] ?? studioMessages[key];
  let text = message.defaultMessage;
  if (parameters === undefined) {
    return text;
  }
  for (const name of catalog.messages[key].parameters) {
    const value = parameters[name];
    if (value !== undefined) {
      text = text.replaceAll(`{${name}}`, value);
    }
  }
  return text;
}
