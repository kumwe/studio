import { readFile } from 'node:fs/promises';
import { isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';

import { buildCycloneDxSbom, loadProducerRuntime } from '../producer-evidence.mjs';

const repositoryRoot = fileURLToPath(new URL('../../', import.meta.url));
const laneId = 'release/sbom-v1';
const role = 'release/cyclonedx-sbom-v1';
const runtime = await loadProducerRuntime(repositoryRoot, laneId);
const cleanConsumerPath = process.env.STUDIO_EVIDENCE_CLEAN_CONSUMER_LOCK_PATH;
if (typeof cleanConsumerPath !== 'string' || !isAbsolute(cleanConsumerPath)) {
  throw new Error('CycloneDX evidence requires the generator-owned clean-consumer lock output.');
}
const cleanConsumer = JSON.parse(await readFile(cleanConsumerPath, 'utf8'));
if (
  cleanConsumer?.role !== 'release/clean-consumer-lock-v1' ||
  cleanConsumer?.subject?.bundleId !== runtime.subject.bundleId ||
  cleanConsumer?.subject?.candidateCommit !== runtime.subject.candidateCommit ||
  cleanConsumer?.subject?.candidateTree !== runtime.subject.candidateTree ||
  cleanConsumer?.subject?.workPackage !== runtime.subject.workPackage ||
  cleanConsumer?.subject?.execution?.id !== runtime.subject.execution.id ||
  cleanConsumer?.subject?.execution?.attempt !== runtime.subject.execution.attempt ||
  cleanConsumer?.subject?.execution?.runner !== runtime.subject.execution.runner
) {
  throw new Error('Clean-consumer evidence is not bound to this exact bundle execution.');
}
const sbom = buildCycloneDxSbom(cleanConsumer.result, runtime.subject);
await runtime.writeRaw(role, sbom);
process.stdout.write(
  `Deterministic CycloneDX 1.5 SBOM produced with ${sbom.components.length} components.\n`,
);
