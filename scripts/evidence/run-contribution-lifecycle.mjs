import { fileURLToPath } from 'node:url';

import {
  buildTestProducerResult,
  loadProducerRuntime,
  PRODUCER_SCENARIO_SETS,
  PRODUCER_TEST_REPORT_SPECS,
  runVitestEvidence,
} from '../producer-evidence.mjs';

const repositoryRoot = fileURLToPath(new URL('../../', import.meta.url));
const laneId = 'lifecycle/contribution-runtime-v1';
const role = 'lifecycle/contribution-report-v1';
const files = PRODUCER_TEST_REPORT_SPECS[role].files;
const patterns = {
  'activation-atomicity':
    /rejects activation atomically|fails closed before the runtime transaction/u,
  'disable-diagnostics': /disable removes executable contributions|owner disable removes/u,
  'immutable-generation': /new immutable generation|sealed immutable generation/u,
  'non-block-contribution-lifecycle': /activates declared non-block kinds/u,
  'trust-revocation': /trust revocation/u,
  'upgrade-and-rollback': /upgrade replaces declared versions|keeps the previous activation/u,
};

const runtime = await loadProducerRuntime(repositoryRoot, laneId);
const report = runVitestEvidence(repositoryRoot, files);
await runtime.write(role, buildTestProducerResult(report, PRODUCER_SCENARIO_SETS[role], patterns));
process.stdout.write('Structured contribution lifecycle evidence produced.\n');
