import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  buildExpectedTypeScriptRuntimeInventory,
  inspectTypeScriptRuntimeReport,
  TYPESCRIPT_COMPILER_DEPTH_BOUNDARIES,
} from '../lib/typescript-evidence.mjs';

const repositoryRoot = fileURLToPath(new URL('../../', import.meta.url));
const corpusManifest = JSON.parse(
  await readFile(`${repositoryRoot}/packages/testkit/corpus-manifest.json`, 'utf8'),
);
const inventory = buildExpectedTypeScriptRuntimeInventory(corpusManifest);
const transportMatrixPath = 'schemas/vectors/authoring-http/transport-matrix.json';

test('TypeScript runtime inventory is derived from the exact positive corpus', () => {
  const manifestDocumentCount = corpusManifest.groups
    .filter(({ path }) => path !== 'invalid')
    .reduce((count, { files }) => count + files.length, 0);
  assert.equal(inventory.length, manifestDocumentCount + 2);
  assert.ok(inventory.includes(transportMatrixPath));
  const report = validReport();
  assert.deepEqual(inspectTypeScriptRuntimeReport(report, inventory), []);
  assert.deepEqual(
    report.exercisedDocuments.find(({ path }) => path === transportMatrixPath),
    { classification: 'assignable', path: transportMatrixPath },
  );
  assert.deepEqual(
    report.exercisedDocuments
      .filter(({ classification }) => classification === 'compiler-depth-boundary')
      .map(({ path }) => path),
    [...TYPESCRIPT_COMPILER_DEPTH_BOUNDARIES].sort(),
  );
});

test('TypeScript runtime inventory rejects missing, extra, substituted, and misclassified names', () => {
  for (const mutate of [
    (report) => report.exercisedDocuments.pop(),
    (report) =>
      report.exercisedDocuments.push({ classification: 'assignable', path: 'schemas/extra.json' }),
    (report) => {
      report.exercisedDocuments[0].path = 'schemas/substituted.json';
    },
    (report) => {
      const boundary = report.exercisedDocuments.find(({ path }) =>
        TYPESCRIPT_COMPILER_DEPTH_BOUNDARIES.includes(path),
      );
      boundary.classification = 'assignable';
    },
  ]) {
    const report = validReport();
    mutate(report);
    assert.notDeepEqual(inspectTypeScriptRuntimeReport(report, inventory), []);
  }
});

function validReport() {
  return {
    exercisedDocuments: inventory.map((path) => ({
      classification: TYPESCRIPT_COMPILER_DEPTH_BOUNDARIES.includes(path)
        ? 'compiler-depth-boundary'
        : 'assignable',
      path,
    })),
    kind: 'studio-typescript-runtime-round-trip-report',
    schemaValidatedRoundTrips: inventory.length,
  };
}
