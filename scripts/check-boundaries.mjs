import { readFile } from 'node:fs/promises';
import { glob } from 'node:fs/promises';

const policies = [
  {
    directory: 'packages/protocol/src',
    allowedImports: [/^\.\.?\//u],
  },
  {
    directory: 'packages/core/src',
    allowedImports: [/^\.\.?\//u, /^@kumwe\/studio-protocol$/u, /^ajv(?:\/|$)/u],
  },
  {
    directory: 'packages/testkit/src',
    allowedImports: [/^@kumwe\/studio-(?:core|protocol)$/u, /^\.\.?\//u],
  },
];

const runtimeGlobals = [
  /\bAbortSignal\b/u,
  /\bBlob\b/u,
  /\bBuffer\b/u,
  /\bHTMLElement\b/u,
  /\bNodeJS\b/u,
  /\blocalStorage\b/u,
  /\bnavigator\b/u,
  /\bprocess\s*\./u,
  /\bsessionStorage\b/u,
  /\bwindow\s*\./u,
];

const failures = [];

for (const policy of policies) {
  for await (const file of glob(`${policy.directory}/**/*.ts`)) {
    const source = await readFile(file, 'utf8');
    for (const match of source.matchAll(/(?:\bfrom\s+|^\s*import\s+)['"]([^'"]+)['"]/gmu)) {
      const specifier = match[1];
      if (specifier !== undefined && !policy.allowedImports.some((rule) => rule.test(specifier))) {
        failures.push(`${file}: forbidden inner-package import ${specifier}`);
      }
    }
    for (const pattern of runtimeGlobals) {
      if (pattern.test(source)) {
        failures.push(`${file}: forbidden runtime global matching ${pattern.source}`);
      }
    }
  }
}

if (failures.length > 0) {
  throw new Error(`Package boundary violations:\n${failures.join('\n')}`);
}

console.log('Inner package boundaries are DOM-free and Node-free.');
