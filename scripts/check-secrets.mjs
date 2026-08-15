import { readFile, stat } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const repositoryRoot = fileURLToPath(new URL('../', import.meta.url));
const allowMarker = 'studio-secret-scan:allow';
const maximumFileBytes = 1024 * 1024;

// Repository-relative paths of deliberate whole-file fixtures exempt from scanning. Keep this
// empty whenever possible; individual fixture lines use the allow marker comment instead.
const ALLOWLIST = [];

const binaryExtensions = new Set([
  '.avif',
  '.eot',
  '.gif',
  '.gz',
  '.ico',
  '.jar',
  '.jpeg',
  '.jpg',
  '.mp3',
  '.mp4',
  '.otf',
  '.pdf',
  '.png',
  '.tar',
  '.tgz',
  '.ttf',
  '.wasm',
  '.webm',
  '.webp',
  '.woff',
  '.woff2',
  '.zip',
]);

const detectors = [
  {
    name: 'private key PEM block',
    pattern: /-----BEGIN (?:[A-Z]+ )*PRIVATE KEY-----/u,
  },
  {
    name: 'GitHub token',
    pattern: /\bgh[oprsu]_[A-Za-z0-9]{36,}\b/u,
  },
  {
    name: 'GitHub fine-grained token',
    pattern: /\bgithub_pat_[A-Za-z0-9]{22}_[A-Za-z0-9]{59}\b/u,
  },
  {
    name: 'npm token',
    pattern: /\bnpm_[A-Za-z0-9]{36}\b/u,
  },
  {
    name: 'AWS access key identifier',
    pattern: /\bAKIA[0-9A-Z]{16}\b/u,
  },
  {
    name: 'AWS secret access key assignment',
    pattern:
      /\b(?:aws[_-]?)?secret[_-]?(?:access[_-]?)?key\b['"]?\s*(?:=>|[:=])\s*['"]?[A-Za-z0-9/+=]{40}(?![A-Za-z0-9/+=])/iu,
  },
  {
    name: 'Slack token',
    pattern: /\bxox[abprs]-[A-Za-z0-9-]{10,}/u,
  },
  {
    name: 'Google API key',
    pattern: /\bAIza[0-9A-Za-z_-]{35}(?![0-9A-Za-z_-])/u,
  },
  {
    name: 'generic credential assignment',
    pattern:
      /\b(?:password|secret|token|api[_-]?key)\b['"]?\s*(?:=>|[:=])\s*(['"])([^'"]{12,})\1/iu,
    placeholderGroup: 2,
  },
];

const placeholderPatterns = [
  /changeme/iu,
  /example/iu,
  /placeholder/iu,
  /redacted/iu,
  /todo/iu,
  /xxxx/iu,
  /<[^<>]+>/u,
  /\$\{[^{}]+\}/u,
  /\{\{[^{}]+\}\}/u,
];

// Known-positive samples are concatenated from fragments so this file never contains a string
// that the detectors themselves would flag.
const knownPositiveSamples = [
  {
    detector: 'private key PEM block',
    sample: ['-----BEGIN RSA PRIV', 'ATE KEY-----'].join(''),
  },
  {
    detector: 'GitHub token',
    sample: ['ghp', '_', 'A1b2C3d4E5f6'.repeat(3)].join(''),
  },
  {
    detector: 'GitHub fine-grained token',
    sample: ['github', '_pat_', '0'.repeat(22), '_', 'a'.repeat(59)].join(''),
  },
  {
    detector: 'npm token',
    sample: ['npm', '_', 'a1B2c3'.repeat(6)].join(''),
  },
  {
    detector: 'AWS access key identifier',
    sample: ['AK', 'IA', 'IOSFODNN7EXAMPLE'].join(''),
  },
  {
    detector: 'AWS secret access key assignment',
    sample: ['aws_secret_access', '_key = ', 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY'].join(''),
  },
  {
    detector: 'Slack token',
    sample: ['xoxb', '-', '1234567890abcdef'].join(''),
  },
  {
    detector: 'Google API key',
    sample: ['AI', 'za', 'SyD4'.repeat(8), 'x-_'].join(''),
  },
  {
    detector: 'generic credential assignment',
    sample: ['pass', 'word = ', "'correct-horse-battery-staple'"].join(''),
  },
];

const knownPlaceholderSamples = [
  ['pass', 'word = ', "'changeme-changeme'"].join(''),
  ['api', '_key: ', "'<your-api-key-here>'"].join(''),
  ['tok', 'en = ', "'${STUDIO_DEPLOY_TOKEN}'"].join(''),
];

for (const detector of detectors) {
  const positive = knownPositiveSamples.find((sample) => sample.detector === detector.name);
  if (positive === undefined) {
    throw new Error(`Self-check failed: no known-positive sample covers "${detector.name}".`);
  }
  if (!scanLine(positive.sample).includes(detector.name)) {
    throw new Error(
      `Self-check failed: the "${detector.name}" pattern missed its known-positive sample.`,
    );
  }
}
for (const sample of knownPlaceholderSamples) {
  const findings = scanLine(sample);
  if (findings.length > 0) {
    throw new Error(
      `Self-check failed: a placeholder sample was flagged as ${findings.join(', ')}.`,
    );
  }
}

const trackedOutput = execFileSync('git', ['ls-files', '-z'], {
  cwd: repositoryRoot,
  encoding: 'utf8',
});
const trackedFiles = trackedOutput.split('\0').filter((path) => path.length > 0);

const failures = [];
let scannedFileCount = 0;
let skippedFileCount = 0;
for (const path of trackedFiles) {
  if (ALLOWLIST.includes(path) || binaryExtensions.has(extname(path).toLowerCase())) {
    skippedFileCount += 1;
    continue;
  }
  const absolutePath = join(repositoryRoot, path);
  if ((await stat(absolutePath)).size > maximumFileBytes) {
    skippedFileCount += 1;
    continue;
  }
  const source = await readFile(absolutePath, 'utf8');
  scannedFileCount += 1;
  for (const [index, line] of source.split(/\r?\n/u).entries()) {
    for (const finding of scanLine(line)) {
      failures.push(`${path}:${index + 1}: matches the ${finding} pattern`);
    }
  }
}

if (failures.length > 0) {
  throw new Error(`Potential secrets detected:\n${failures.join('\n')}`);
}

console.log(
  `${detectors.length} secret patterns passed the embedded self-check; ${scannedFileCount} ` +
    `tracked files scanned (${skippedFileCount} skipped) with no secrets detected.`,
);

export function scanLine(line) {
  if (line.includes(allowMarker)) {
    return [];
  }
  const findings = [];
  for (const detector of detectors) {
    const match = detector.pattern.exec(line);
    if (match === null) {
      continue;
    }
    if (
      detector.placeholderGroup !== undefined &&
      placeholderPatterns.some((pattern) => pattern.test(match[detector.placeholderGroup]))
    ) {
      continue;
    }
    findings.push(detector.name);
  }
  return findings;
}
