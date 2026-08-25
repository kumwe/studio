import { describe, expect, it } from 'vitest';
import { richTextSchema } from '@kumwe/studio-protocol';
import { DEFAULT_RICH_TEXT_PROFILE } from '../src/index.js';

interface SchemaDefs {
  $defs: Record<
    string,
    {
      oneOf?: { properties?: { type?: { const?: string; enum?: string[] } } }[];
      properties?: { type?: { enum?: string[] } };
    }
  >;
}

describe('portable rich-text profile', () => {
  const defs = (richTextSchema as unknown as SchemaDefs).$defs;

  it('matches the canonical mark vocabulary', () => {
    const mark = defs.mark;
    const marks = [
      ...(mark?.properties?.type?.enum ?? []),
      ...(mark?.oneOf ?? []).flatMap((entry) => [
        ...(entry.properties?.type?.enum ?? []),
        ...(entry.properties?.type?.const === undefined ? [] : [entry.properties.type.const]),
      ]),
    ];
    expect([...DEFAULT_RICH_TEXT_PROFILE.allowedMarks].sort()).toEqual(marks.sort());
  });

  it('matches the canonical node vocabulary', () => {
    const schemaNodes = Object.keys(defs)
      .filter((name) => !['block', 'inline', 'mark'].includes(name))
      .sort();
    expect([...DEFAULT_RICH_TEXT_PROFILE.allowedNodes].sort()).toEqual(schemaNodes);
  });

  it('matches the canonical heading levels', () => {
    const levelEnum = (
      defs.heading as unknown as {
        properties?: { attrs?: { properties?: { level?: { enum?: number[] } } } };
      }
    ).properties?.attrs?.properties?.level?.enum;
    expect([...(DEFAULT_RICH_TEXT_PROFILE.headingLevels ?? [])]).toEqual(levelEnum);
  });
});
