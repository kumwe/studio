import { createHash } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';

export const TYPESCRIPT_COMPILER_DEPTH_BOUNDARIES = Object.freeze([
  'schemas/vectors/schema-profile/json-depth-limit.accepted.json',
  'schemas/vectors/schema-profile/json-depth-limit.rejected.json',
]);

export function buildExpectedTypeScriptRuntimeInventory(corpusManifest) {
  if (!Array.isArray(corpusManifest?.groups)) {
    throw new Error('TypeScript runtime inventory requires the canonical corpus manifest.');
  }
  const paths = corpusManifest.groups
    .filter(({ path }) => path !== 'invalid')
    .flatMap((group) => {
      if (
        typeof group?.path !== 'string' ||
        !Array.isArray(group?.files) ||
        group.files.some(({ file }) => typeof file !== 'string')
      ) {
        throw new Error('Canonical corpus manifest contains an invalid inventory group.');
      }
      const directory = group.path === 'fixtures' ? 'schemas/examples' : `schemas/${group.path}`;
      return group.files.map(({ file }) => `${directory}/${file}`);
    });
  paths.push('packages/testkit/corpus-manifest.json', 'studio-release.json');
  paths.sort((left, right) => left.localeCompare(right, 'en'));
  if (new Set(paths).size !== paths.length) {
    throw new Error('Canonical TypeScript runtime inventory contains duplicate paths.');
  }
  return paths;
}

export function inspectTypeScriptRuntimeReport(report, expectedPaths) {
  const failures = [];
  const expected = [...expectedPaths].sort((left, right) => left.localeCompare(right, 'en'));
  const documents = Array.isArray(report?.exercisedDocuments) ? report.exercisedDocuments : [];
  const observedPaths = documents.map(({ path }) => path);
  if (
    report?.kind !== 'studio-typescript-runtime-round-trip-report' ||
    documents.some(
      (item) =>
        item === null ||
        typeof item !== 'object' ||
        Array.isArray(item) ||
        Object.keys(item).sort().join('\n') !== 'classification\npath' ||
        !['assignable', 'compiler-depth-boundary'].includes(item.classification) ||
        typeof item.path !== 'string',
    ) ||
    !isDeepStrictEqual(observedPaths, expected) ||
    report?.schemaValidatedRoundTrips !== expected.length
  ) {
    failures.push('runtime report does not match the exact canonical corpus inventory');
  }
  const boundarySet = new Set(TYPESCRIPT_COMPILER_DEPTH_BOUNDARIES);
  for (const item of documents) {
    const expectedClassification = boundarySet.has(item.path)
      ? 'compiler-depth-boundary'
      : 'assignable';
    if (item.classification !== expectedClassification) {
      failures.push(`runtime report misclassifies ${String(item.path)}`);
    }
  }
  const observedBoundaries = documents
    .filter(({ classification }) => classification === 'compiler-depth-boundary')
    .map(({ path }) => path);
  if (!isDeepStrictEqual(observedBoundaries, [...TYPESCRIPT_COMPILER_DEPTH_BOUNDARIES].sort())) {
    failures.push('runtime report substituted the two compiler-depth boundaries');
  }
  return failures;
}

export function typeScriptRuntimeInventoryChecksum(documents) {
  return `sha256-${createHash('sha256')
    .update(`${JSON.stringify(documents)}\n`)
    .digest('base64')}`;
}
