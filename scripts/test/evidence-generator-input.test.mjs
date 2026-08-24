import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import Ajv2020 from 'ajv/dist/2020.js';
import { parseEvidenceArguments } from '../evidence-generator-input.mjs';

const repositoryRoot = fileURLToPath(new URL('../../', import.meta.url));

test('evidence generator arguments accept only bounded, registered-shape inputs', () => {
  assert.deepEqual(
    parseEvidenceArguments([
      '--candidate',
      'a'.repeat(40),
      '--criteria',
      'gate-a/02-protocol-schemas,gate-a/12-accessible-interactions',
      '--id',
      'M2-01-aabbccddeeff-gha-1-1',
      '--package',
      'M2-01',
      '--profiles',
      'studio.profile/engine-core',
      '--runner',
      'github-actions/1/1',
    ]),
    {
      candidate: 'a'.repeat(40),
      criteria: ['gate-a/02-protocol-schemas', 'gate-a/12-accessible-interactions'],
      id: 'M2-01-aabbccddeeff-gha-1-1',
      package: 'M2-01',
      profiles: ['studio.profile/engine-core'],
      runner: 'github-actions/1/1',
    },
  );
});

for (const [name, argv, pattern] of [
  [
    'shell metacharacters',
    ['--package', "M2-01';touch-pwned", '--criteria', 'gate-a/02-protocol-schemas'],
    /Invalid work package/u,
  ],
  [
    'path traversal',
    ['--package', 'M2-01', '--criteria', 'gate-a/02-protocol-schemas', '--id', '../../gate-a'],
    /Invalid or reserved bundle/u,
  ],
  [
    'reserved sample prefix',
    ['--package', 'M2-01', '--criteria', 'gate-a/02-protocol-schemas', '--id', 'SAMPLE-real'],
    /Invalid or reserved bundle/u,
  ],
  [
    'duplicate flag',
    ['--package', 'M2-01', '--package', 'M2-02', '--criteria', 'gate-a/02-protocol-schemas'],
    /only once/u,
  ],
  [
    'unknown flag',
    ['--package', 'M2-01', '--criteria', 'gate-a/02-protocol-schemas', '--output', 'elsewhere'],
    /Unknown evidence generator argument/u,
  ],
  [
    'duplicate criterion',
    ['--package', 'M2-01', '--criteria', 'gate-a/02-protocol-schemas,gate-a/02-protocol-schemas'],
    /duplicate value/u,
  ],
  ['missing value', ['--package', 'M2-01', '--criteria'], /requires a nonempty value/u],
]) {
  test(`evidence generator rejects ${name}`, () => {
    assert.throws(() => parseEvidenceArguments(argv), pattern);
  });
}

test('the checked-in pending sample remains schema-valid without asserting reproduction', async () => {
  const schema = JSON.parse(
    await readFile(`${repositoryRoot}/evidence/schema/evidence-bundle.schema.json`, 'utf8'),
  );
  const sample = JSON.parse(
    await readFile(
      `${repositoryRoot}/evidence/bundles/SAMPLE-failing-stale-commit/manifest.json`,
      'utf8',
    ),
  );
  const ajv = new Ajv2020({ allErrors: true, strict: true });
  const validate = ajv.compile(schema);
  assert.equal(validate(sample), true, ajv.errorsText(validate.errors));
  assert.deepEqual(sample.review, { status: 'pending' });
  assert.ok(sample.criteria.length > 0);
});
