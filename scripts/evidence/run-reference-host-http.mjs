import { fileURLToPath } from 'node:url';

import {
  buildTestProducerResult,
  loadProducerRuntime,
  PRODUCER_SCENARIO_SETS,
  PRODUCER_TEST_REPORT_SPECS,
  runVitestEvidence,
} from '../producer-evidence.mjs';

const repositoryRoot = fileURLToPath(new URL('../../', import.meta.url));
const laneId = 'integration/reference-host-http-v1';
const role = 'integration/reference-host-report-v1';
const files = PRODUCER_TEST_REPORT_SPECS[role].files;
const patterns = {
  'deadline-and-disconnect-mapping': /expired transport deadline|mid-call disconnect/u,
  'generation-invalidation': /invalidates the previous generation|invalidates the whole session/u,
  'malformed-response-refusal': /malformed response bodies/u,
  'model-and-resource-transport': /serializes model get and list/u,
  'save-conflict-recovery': /session lifecycle drill|loses a race, and recovers/u,
};

const runtime = await loadProducerRuntime(repositoryRoot, laneId);
const report = runVitestEvidence(repositoryRoot, files);
await runtime.write(role, buildTestProducerResult(report, PRODUCER_SCENARIO_SETS[role], patterns));
process.stdout.write('Structured real-HTTP reference-host evidence produced.\n');
