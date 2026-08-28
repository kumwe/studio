import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import { buildStudioEnhancementRuntimeAssets } from './studio-enhancement-artifacts.mjs';

async function main() {
  const outputIndex = process.argv.indexOf('--out-dir');
  const output = outputIndex === -1 ? undefined : process.argv[outputIndex + 1];
  if (outputIndex !== -1 && (output === undefined || output.startsWith('--'))) {
    throw new TypeError('--out-dir requires a directory.');
  }
  if (process.argv.length !== 2 && outputIndex === -1) {
    throw new Error(
      'Usage: node scripts/build-studio-enhancement-runtime.mjs [--out-dir <directory>]',
    );
  }
  const result = await buildStudioEnhancementRuntimeAssets(
    new URL('../', import.meta.url),
    output === undefined ? undefined : resolve(output),
  );
  console.log(`Built precompiled Studio enhancement runtime at ${result.entryPoint}.`);
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
