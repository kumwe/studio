import assert from 'node:assert/strict';
import { test } from 'node:test';
import { assertNoDuplicateJsonMembers } from '../lib/json-no-duplicate-members.mjs';

test('canonical JSON lint rejects duplicate schema members', () => {
  assert.throws(
    () =>
      assertNoDuplicateJsonMembers(
        '{"additionalProperties":false,"additionalProperties":{"type":"string"}}',
        'duplicate.schema.json',
      ),
    /duplicate member "additionalProperties"/u,
  );
  assert.doesNotThrow(() =>
    assertNoDuplicateJsonMembers(
      '{"type":"object","properties":{"value":{"type":"string"}}}',
      'valid.schema.json',
    ),
  );
});

test('canonical JSON lint bounds nesting before recursive descent can exhaust the stack', () => {
  const hostile = `${'['.repeat(10_000)}null${']'.repeat(10_000)}`;
  assert.throws(
    () => assertNoDuplicateJsonMembers(hostile, 'hostile.json', 16),
    /document exceeds maximum depth 16/u,
  );
});
