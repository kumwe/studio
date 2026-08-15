import type { SemanticVersion } from '@kumwe/studio-protocol';

const VERSION_PATTERN =
  /^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)(?:-((?:0|[1-9][0-9]*|[0-9]*[A-Za-z-][0-9A-Za-z-]*)(?:\.(?:0|[1-9][0-9]*|[0-9]*[A-Za-z-][0-9A-Za-z-]*))*))?(?:\+([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?$/u;

export interface ParsedSemanticVersion {
  major: number;
  minor: number;
  patch: number;
  prerelease: readonly (number | string)[];
}

export function parseSemanticVersion(value: string): ParsedSemanticVersion {
  const match = value.length <= 100 ? VERSION_PATTERN.exec(value) : null;
  if (match === null) {
    throw new TypeError(`${value} is not a canonical semantic version.`);
  }
  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
    prerelease:
      match[4] === undefined
        ? []
        : match[4]
            .split('.')
            .map((part) => (/^(0|[1-9][0-9]*)$/u.test(part) ? Number(part) : part)),
  };
}

/** SemVer 2.0 precedence; build metadata never participates. */
export function compareSemanticVersions(left: string, right: string): -1 | 0 | 1 {
  const a = parseSemanticVersion(left);
  const b = parseSemanticVersion(right);
  for (const member of ['major', 'minor', 'patch'] as const) {
    if (a[member] !== b[member]) {
      return a[member] < b[member] ? -1 : 1;
    }
  }
  if (a.prerelease.length === 0 && b.prerelease.length === 0) {
    return 0;
  }
  if (a.prerelease.length === 0) {
    return 1;
  }
  if (b.prerelease.length === 0) {
    return -1;
  }
  const length = Math.max(a.prerelease.length, b.prerelease.length);
  for (let index = 0; index < length; index += 1) {
    const first = a.prerelease[index];
    const second = b.prerelease[index];
    if (first === undefined) {
      return -1;
    }
    if (second === undefined) {
      return 1;
    }
    if (first === second) {
      continue;
    }
    if (typeof first === 'number' && typeof second === 'number') {
      return first < second ? -1 : 1;
    }
    if (typeof first === 'number') {
      return -1;
    }
    if (typeof second === 'number') {
      return 1;
    }
    return first < second ? -1 : 1;
  }
  return 0;
}

interface Comparator {
  operator: '<' | '<=' | '=' | '>' | '>=';
  version: SemanticVersion;
}

/**
 * Expand caret and tilde shorthands into their conventional comparator
 * conjunctions. The supported grammar is deliberately small and
 * deterministic: exact versions, `^`/`~` shorthands, and space-joined
 * comparators; disjunctions are unsupported until the compatibility
 * contract ratifies them.
 */
export function normalizeVersionRange(range: string): string {
  const trimmed = range.trim();
  if (trimmed.length === 0 || trimmed.length > 120 || trimmed.includes('||')) {
    throw new TypeError(`${range} is not a supported version range.`);
  }
  return trimmed
    .split(/\s+/u)
    .map((part) => {
      if (part.startsWith('^')) {
        const source = part.slice(1);
        const version = parseSemanticVersion(source);
        const upper =
          version.major > 0
            ? `${version.major + 1}.0.0-0`
            : version.minor > 0
              ? `0.${version.minor + 1}.0-0`
              : `0.0.${version.patch + 1}-0`;
        return `>=${source} <${upper}`;
      }
      if (part.startsWith('~')) {
        const source = part.slice(1);
        const version = parseSemanticVersion(source);
        return `>=${source} <${version.major}.${version.minor + 1}.0-0`;
      }
      parseComparator(part);
      return part;
    })
    .join(' ');
}

/** Whether a version satisfies every comparator of the supported range grammar. */
export function satisfiesVersionRange(version: string, range: string): boolean {
  parseSemanticVersion(version);
  const comparators = normalizeVersionRange(range).split(/\s+/u).map(parseComparator);
  return comparators.every((comparator) => {
    const comparison = compareSemanticVersions(version, comparator.version);
    switch (comparator.operator) {
      case '<':
        return comparison < 0;
      case '<=':
        return comparison <= 0;
      case '=':
        return comparison === 0;
      case '>':
        return comparison > 0;
      default:
        return comparison >= 0;
    }
  });
}

function parseComparator(part: string): Comparator {
  const match = /^(>=|<=|>|<|=)?([^<>=].*)$/u.exec(part);
  if (match?.[2] === undefined) {
    throw new TypeError(`${part} is not a supported version comparator.`);
  }
  parseSemanticVersion(match[2]);
  return {
    operator: (match[1] ?? '=') as Comparator['operator'],
    version: match[2],
  };
}
