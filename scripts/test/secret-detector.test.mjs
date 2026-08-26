import assert from 'node:assert/strict';
import test from 'node:test';

import {
  assertSecretDetectorSelfTest,
  isCredentialBearingUrl,
  scanSecretLine,
  scanSecretText,
  SECRET_DETECTOR_COUNT,
} from '../lib/secret-detector.mjs';

test('one shared detector rejects source and retained-artifact credential families', () => {
  assert.equal(assertSecretDetectorSelfTest(), SECRET_DETECTOR_COUNT);
  const samples = [
    [
      'GitHub fine-grained token',
      ['github', '_pat_', '1'.repeat(22), '_', 'A'.repeat(59)].join(''),
    ],
    ['Slack token', ['xoxp', '-', '1234567890-abcdefghij'].join('')],
    ['Google API key', ['AI', 'za', 'A'.repeat(35)].join('')],
    ['AWS access key identifier', ['AK', 'IA', 'ABCDEFGHIJKLMNOP'].join('')],
    ['AWS secret access key assignment', `aws_secret_access_key=${'A'.repeat(40)}`],
    ['generic credential assignment', `DEPLOY_TOKEN=${'a'.repeat(32)}`],
    ['generic credential assignment', ['DEPLOY_PASS', 'WORD=', 'p@ssw0rd!long-secret'].join('')],
    ['generic credential assignment', ['CLIENT_SEC', 'RET=', 'abc.def.ghi.jklmnop'].join('')],
    [
      'credential-bearing proxy URL',
      ['https://build-user:', 'not-a-placeholder', '@proxy.invalid'].join(''),
    ],
  ];
  for (const [expected, sample] of samples) {
    assert.ok(scanSecretLine(sample).includes(expected), expected);
    assert.ok(
      scanSecretText(`header\n${sample}\nfooter`).some(({ detector }) => detector === expected),
    );
  }
});

test('credential marker text cannot suppress artifact scanning', () => {
  const sample = `${['github', '_pat_', '1'.repeat(22), '_', 'A'.repeat(59)].join('')} studio-secret-scan:allow`;
  assert.ok(scanSecretLine(sample).includes('GitHub fine-grained token'));
});

test('declared placeholders remain usable while credential-bearing proxies are isolated', () => {
  assert.deepEqual(scanSecretLine("token = '<redacted-token>'"), []);
  assert.deepEqual(scanSecretLine("password = '${STUDIO_PASSWORD}'"), []);
  assert.equal(isCredentialBearingUrl('https://proxy.invalid:8443'), false);
  assert.equal(
    isCredentialBearingUrl(['https://user:', 'password', '@proxy.invalid:8443'].join('')),
    true,
  );
  assert.equal(
    isCredentialBearingUrl(['socks5h://user:', 'password', '@proxy.invalid'].join('')),
    true,
  );
});

test('placeholder words embedded in real-looking values cannot suppress detection', () => {
  for (const sample of [
    ['DATABASE_PASS', "WORD='redacted-but-real-A9f4x2q7'"].join(''),
    ['DEPLOY_TO', "KEN='actual-example-credential-12345'"].join(''),
    ['API_', "KEY='todo-production-key-987654321'"].join(''),
  ]) {
    assert.ok(scanSecretLine(sample).includes('generic credential assignment'));
  }
});

test('ordinary source identifiers are not treated as credential values', () => {
  for (const sourceLine of [
    'const token = tokens[index];',
    "const token = encodedToken.replaceAll('~1', '/');",
    'const token = inlineTokenAt(source, cursor);',
  ]) {
    assert.deepEqual(scanSecretLine(sourceLine), []);
  }
});
