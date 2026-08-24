import { describe, expect, it } from 'vitest';
import {
  messageText,
  studioMessageCatalog,
  studioMessages,
  type StudioMessageKey,
} from '../src/index.js';

describe('authoring message catalog', () => {
  it('publishes the complete canonical English catalog', () => {
    expect(studioMessageCatalog.kind).toBe('authoring-message-catalog');
    expect(studioMessageCatalog.catalogVersion).toBe('1.1.0');
    expect(studioMessageCatalog.locale).toBe('en');
    expect(Object.keys(studioMessageCatalog.messages)).toHaveLength(119);
    expect(Object.keys(studioMessages)).toEqual(Object.keys(studioMessageCatalog.messages));
  });

  it('declares exactly the named parameters used by every default message', () => {
    for (const [key, entry] of Object.entries(studioMessageCatalog.messages)) {
      const used = [
        ...new Set(
          [...entry.defaultMessage.matchAll(/\{([a-z][a-z0-9_-]*)\}/g)].map((match) => match[1]),
        ),
      ].sort();
      expect(entry.parameters, key).toEqual(used);
    }
  });

  it('formats declared parameters and ignores undeclared values', () => {
    expect(
      messageText('studio.shell/announce-dropped', undefined, {
        count: '4',
        label: 'Gallery',
        position: '2',
        unexpected: 'not rendered',
      }),
    ).toBe('Moved Gallery to position 2 of 4');
  });

  it('uses host overrides while preserving missing placeholders visibly', () => {
    const key: StudioMessageKey = 'studio.shell/announce-binding-set';
    expect(
      messageText(
        key,
        { [key]: { defaultMessage: 'Connected {port} to {value}' } },
        { port: 'price' },
      ),
    ).toBe('Connected price to {value}');
  });
});
