import { spawnSync } from 'node:child_process';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  loadProducerRuntime,
  renderEvidenceCommand,
  TYPESCRIPT_PRODUCER_COMMANDS,
} from '../producer-evidence.mjs';
import {
  buildExpectedTypeScriptRuntimeInventory,
  inspectTypeScriptRuntimeReport,
  typeScriptRuntimeInventoryChecksum,
} from '../lib/typescript-evidence.mjs';

const repositoryRoot = fileURLToPath(new URL('../../', import.meta.url));
const laneId = 'portability/typescript-corpus-v2';
const runtime = await loadProducerRuntime(repositoryRoot, laneId);
const commands = TYPESCRIPT_PRODUCER_COMMANDS;
const reportRoot = await mkdtemp(join(tmpdir(), 'studio-typescript-evidence-'));
const runtimeReportPath = join(reportRoot, 'runtime-round-trips.json');
let runtimeReport;
try {
  for (const [index, [command, args]] of commands.entries()) {
    const result = spawnSync(command, args, {
      cwd: repositoryRoot,
      encoding: 'utf8',
      env: {
        ...process.env,
        CI: '1',
        ...(index === 2 ? { STUDIO_TYPESCRIPT_RUNTIME_REPORT: runtimeReportPath } : {}),
      },
      maxBuffer: 20 * 1_024 * 1_024,
    });
    if (result.stderr) process.stderr.write(result.stderr);
    if (result.error !== undefined || result.status !== 0) {
      throw new Error(`${renderEvidenceCommand(command, args)} failed.`, { cause: result.error });
    }
    if (index === 2) {
      const vitestReport = JSON.parse(result.stdout);
      if (
        vitestReport.numFailedTests !== 0 ||
        vitestReport.numPassedTests !== vitestReport.numTotalTests ||
        vitestReport.numPassedTests < 1
      ) {
        throw new Error('The protocol generated-model runtime test did not pass completely.');
      }
    } else if (result.stdout) {
      process.stdout.write(result.stdout);
    }
  }
  runtimeReport = JSON.parse(await readFile(runtimeReportPath, 'utf8'));
} finally {
  await rm(reportRoot, { force: true, recursive: true });
}
const corpusManifest = JSON.parse(
  await readFile(join(repositoryRoot, 'packages/testkit/corpus-manifest.json'), 'utf8'),
);
const expectedRuntimeInventory = buildExpectedTypeScriptRuntimeInventory(corpusManifest);
const runtimeFailures = inspectTypeScriptRuntimeReport(runtimeReport, expectedRuntimeInventory);
if (runtimeFailures.length > 0) {
  throw new Error(
    `The real protocol runtime test emitted invalid machine-readable evidence:\n- ${runtimeFailures.join('\n- ')}`,
  );
}

let generatedDefinitions = 0;
for (const file of await readdir(join(repositoryRoot, 'schemas'))) {
  if (!file.endsWith('.schema.json')) continue;
  const schema = JSON.parse(await readFile(join(repositoryRoot, 'schemas', file), 'utf8'));
  generatedDefinitions += Object.keys(schema.$defs ?? {}).length;
}
const schemaManifest = JSON.parse(
  await readFile(join(repositoryRoot, 'packages/protocol/schemas/manifest.json'), 'utf8'),
);
await runtime.write('portability/typescript-generation-v1', {
  commands: commands.map(([command, args]) => renderEvidenceCommand(command, args)),
  generatedDefinitions,
  generatedRoots: schemaManifest.schemas.length,
  localeDriftChecked: true,
});
await runtime.write('portability/corpus-replay-v1', {
  assignableDocuments: runtimeReport.exercisedDocuments.filter(
    ({ classification }) => classification === 'assignable',
  ).length,
  command: renderEvidenceCommand(commands[1][0], commands[1][1]),
  compilerDepthBoundaries: runtimeReport.exercisedDocuments
    .filter(({ classification }) => classification === 'compiler-depth-boundary')
    .map(({ path }) => path),
  inventoryChecksum: typeScriptRuntimeInventoryChecksum(runtimeReport.exercisedDocuments),
  runtimeCommand: renderEvidenceCommand(commands[2][0], commands[2][1]),
  schemaValidatedRoundTrips: runtimeReport.schemaValidatedRoundTrips,
});
process.stdout.write(
  'Structured TypeScript generation and corpus portability evidence produced.\n',
);
