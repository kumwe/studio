const DETECTORS = Object.freeze([
  Object.freeze({
    name: 'private key PEM block',
    pattern: /-----BEGIN (?:[A-Z]+ )*PRIVATE KEY-----/u,
  }),
  Object.freeze({
    name: 'GitHub token',
    pattern: /\bgh[oprsu]_[A-Za-z0-9]{36,255}\b/u,
  }),
  Object.freeze({
    name: 'GitHub fine-grained token',
    pattern: /\bgithub_pat_[A-Za-z0-9_]{50,255}\b/u,
  }),
  Object.freeze({
    name: 'npm token',
    pattern: /\bnpm_[A-Za-z0-9]{36,255}\b/u,
  }),
  Object.freeze({
    name: 'AWS access key identifier',
    pattern: /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/u,
  }),
  Object.freeze({
    name: 'AWS secret access key assignment',
    pattern:
      /\b(?:aws[_-]?)?secret[_-]?(?:access[_-]?)?key\b['"]?\s*(?:=>|[:=])\s*['"]?[A-Za-z0-9/+=]{40}(?![A-Za-z0-9/+=])/iu,
  }),
  Object.freeze({
    name: 'Slack token',
    pattern: /\bxox[aboprs]-[A-Za-z0-9-]{10,255}\b/u,
  }),
  Object.freeze({
    name: 'Google API key',
    pattern: /\bAIza[0-9A-Za-z_-]{35}(?![0-9A-Za-z_-])/u,
  }),
  Object.freeze({
    name: 'generic credential assignment',
    pattern:
      /\b(?:[A-Za-z][A-Za-z0-9]*[_-])*(?:password|passwd|secret|token|api[_-]?key|access[_-]?key)\b['"]?\s*(?:=>|[:=])\s*(?:['"]([^'"\r\n]{12,})['"]|([A-Za-z0-9_./+=:@!?$%~-]{12,})(?=\s|[,;#]|$))/iu,
    valueGroups: Object.freeze([1, 2]),
  }),
  Object.freeze({
    name: 'credential-bearing proxy URL',
    pattern: /\b(?:https?|socks5h?):\/\/([^\s/:@]{1,200}):([^\s/@]{1,500})@[^\s/]+/iu,
    valueGroups: Object.freeze([1, 2]),
  }),
]);

const PLACEHOLDER_PATTERNS = Object.freeze([
  /^(?:changeme|changeme-changeme|example|placeholder|redacted|todo)$/iu,
  /^x+$/iu,
  /^<[^<>]+>$/u,
  /^\$\{[^{}]+\}$/u,
  /^\{\{[^{}]+\}\}$/u,
]);

export function scanSecretLine(line) {
  const findings = [];
  for (const detector of DETECTORS) {
    const pattern = new RegExp(detector.pattern.source, `${detector.pattern.flags}g`);
    for (const match of line.matchAll(pattern)) {
      const values = (detector.valueGroups ?? [])
        .map((index) => match[index])
        .filter((value) => typeof value === 'string');
      if (
        values.length > 0 &&
        values.every((value) => PLACEHOLDER_PATTERNS.some((placeholder) => placeholder.test(value)))
      ) {
        continue;
      }
      findings.push(detector.name);
      break;
    }
  }
  return findings;
}

export function scanSecretText(text) {
  return text
    .split(/\r?\n/u)
    .flatMap((line, index) =>
      scanSecretLine(line).map((detector) => ({ detector, line: index + 1 })),
    );
}

export function assertSecretDetectorSelfTest() {
  const positives = [
    ['private key PEM block', ['-----BEGIN RSA PRIV', 'ATE KEY-----'].join('')],
    ['GitHub token', ['ghp', '_', 'A1b2C3d4E5f6'.repeat(3)].join('')],
    [
      'GitHub fine-grained token',
      ['github', '_pat_', '0'.repeat(22), '_', 'a'.repeat(59)].join(''),
    ],
    ['npm token', ['npm', '_', 'a1B2c3'.repeat(6)].join('')],
    ['AWS access key identifier', ['AS', 'IA', 'IOSFODNN7EXAMPLE'].join('')],
    [
      'AWS secret access key assignment',
      ['aws_secret_access', '_key = ', 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY'].join(''),
    ],
    ['Slack token', ['xoxb', '-', '1234567890abcdef'].join('')],
    ['Google API key', ['AI', 'za', 'SyD4'.repeat(8), 'x-_'].join('')],
    [
      'generic credential assignment',
      ['pass', 'word = ', "'correct-horse-battery-staple'"].join(''),
    ],
    [
      'credential-bearing proxy URL',
      ['https://proxy-user:', 'actual-proxy-password', '@proxy.invalid:8443'].join(''),
    ],
  ];
  for (const [expected, sample] of positives) {
    if (!scanSecretLine(sample).includes(expected)) {
      throw new Error(`Secret detector self-check missed ${expected}.`);
    }
  }
  for (const sample of [
    ['pass', 'word = ', "'changeme-changeme'"].join(''),
    ['api', '_key: ', "'<your-api-key-here>'"].join(''),
    ['tok', 'en = ', "'${STUDIO_DEPLOY_TOKEN}'"].join(''),
  ]) {
    if (scanSecretLine(sample).length > 0) {
      throw new Error('Secret detector self-check rejected a declared placeholder.');
    }
  }
  return DETECTORS.length;
}

export function isCredentialBearingUrl(value) {
  if (typeof value !== 'string') return false;
  try {
    const parsed = new URL(value);
    return parsed.username.length > 0 || parsed.password.length > 0;
  } catch {
    return scanSecretLine(value).includes('credential-bearing proxy URL');
  }
}

export const SECRET_DETECTOR_COUNT = DETECTORS.length;
