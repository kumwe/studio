import { fileURLToPath } from 'node:url';

import {
  buildTestProducerResult,
  loadProducerRuntime,
  PRODUCER_SCENARIO_SETS,
  PRODUCER_TEST_REPORT_SPECS,
  runVitestEvidence,
} from '../producer-evidence.mjs';

const repositoryRoot = fileURLToPath(new URL('../../', import.meta.url));
const laneId = 'integration/media-rich-text-v1';
const role = 'integration/media-rich-text-report-v1';
const files = PRODUCER_TEST_REPORT_SPECS[role].files;
const patterns = {
  'canonical-rich-text-round-trip':
    /round-trips portable Markdown|replays to the canonical projection/u,
  'host-media-browse-and-select': /browses\/searches through the host/u,
  'host-media-upload-cancel-retry': /cancels mid-transfer|retries a failed upload/u,
  'safe-html-hostile-input': /imports only the fixed safe HTML ceiling/u,
  'strict-csp-editor-boundary': /without creating style or HTML-string sinks/u,
};

const runtime = await loadProducerRuntime(repositoryRoot, laneId);
const report = runVitestEvidence(repositoryRoot, files);
await runtime.write(role, buildTestProducerResult(report, PRODUCER_SCENARIO_SETS[role], patterns));
process.stdout.write('Structured media and rich-text integration evidence produced.\n');
