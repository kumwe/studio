const RUN_LOG_ROLE = 'run/log';

export const EVIDENCE_ARTIFACT_ROLES = Object.freeze([
  RUN_LOG_ROLE,
  'accessibility/manual-interaction-report-v1',
  'integration/external-attestation-v1',
  'integration/external-subject-v1',
  'integration/kumwe-app-report-v1',
  'integration/media-rich-text-report-v1',
  'integration/reference-host-report-v1',
  'lifecycle/contribution-report-v1',
  'manual/decision-record-v1',
  'manual/observation-v1',
  'portability/corpus-replay-v1',
  'portability/typescript-generation-v1',
  'release/approved-family-v1',
  'release/clean-consumer-lock-v1',
  'release/cyclonedx-sbom-v1',
  'release/provenance-set-v1',
  'release/reproducible-family-report-v1',
  'release/signature-audit-v1',
  'release/staged-registry-report-v1',
  'review/attestation-v1',
  'review/signature-v1',
  'gate-b/criterion-proof-v1',
]);

const lanes = {
  'quality/format': lane('npm', ['run', 'format:check']),
  'quality/lint': lane('npm', ['run', 'lint']),
  'quality/typecheck': lane('npm', ['run', 'typecheck']),
  'build/workspace': lane('npm', ['run', 'build']),
  'contract/package-boundaries': lane('node', ['scripts/check-boundaries.mjs']),
  'contract/canonical-corpus': lane('node', ['scripts/check-contracts.mjs']),
  'contract/release-record': lane('node', ['scripts/check-release-record.mjs']),
  'release/package-tarballs': lane('node', ['scripts/check-packages.mjs']),
  'evidence/authenticity': lane('node', ['scripts/check-evidence.mjs']),
  'security/secret-scan': lane('node', ['scripts/check-secrets.mjs']),
  'contract/requirement-registry': lane('node', ['scripts/check-requirements.mjs']),
  'security/threat-registry': lane('node', ['scripts/check-threats.mjs']),
  'release/changeset': lane('node', ['scripts/check-changesets.mjs']),
  'unit/workspace': lane('npm', ['run', 'test']),
  'accessibility/web': lane('npm', ['run', 'check:a11y', '--', '--retries=0']),
  'profile/binding-projection-v1': lane('./node_modules/.bin/vitest', [
    'run',
    'packages/core/test/binding-projection.test.ts',
    'packages/testkit/test/binding-projection-vectors.test.ts',
    '--coverage.enabled=false',
  ]),
  'profile/engine-core': lane('./node_modules/.bin/vitest', [
    'run',
    'packages/core/test/canonical-vectors.test.ts',
    'packages/core/test/command-vectors.test.ts',
    'packages/core/test/fuzz-canonical.test.ts',
    'packages/core/test/fuzz-commands.test.ts',
    '--coverage.enabled=false',
  ]),
  'profile/host-baseline': lane('./node_modules/.bin/vitest', [
    'run',
    'packages/testkit/test/host-testbed.test.ts',
    'packages/testkit/test/host-vectors.test.ts',
    'packages/testkit/test/http-transport.test.ts',
    '--coverage.enabled=false',
  ]),
  'profile/host-baseline-v2': lane('./node_modules/.bin/vitest', [
    'run',
    'packages/testkit/test/host-testbed.test.ts',
    'packages/testkit/test/host-vectors.test.ts',
    'packages/testkit/test/host-sequence-vectors.test.ts',
    'packages/testkit/test/http-transport.test.ts',
    '--coverage.enabled=false',
  ]),
  'profile/media-policy': lane('./node_modules/.bin/vitest', [
    'run',
    'packages/media/test/media-vectors.test.ts',
    'packages/media/test/upload-controller.test.ts',
    'packages/testkit/test/media-import-policy.test.ts',
    '--coverage.enabled=false',
  ]),
  'profile/preview-identity-v1': lane('./node_modules/.bin/vitest', [
    'run',
    'packages/preview/test/preview-identity.test.ts',
    'packages/testkit/test/preview-vectors.test.ts',
    '--coverage.enabled=false',
  ]),
  'profile/renderer-web': lane('./node_modules/.bin/vitest', [
    'run',
    'packages/renderer-web/test/conformance.test.ts',
    'packages/renderer-web/test/interactions.test.ts',
    'packages/renderer-web/test/renderer.test.ts',
    '--coverage.enabled=false',
  ]),
  'profile/schema-property': lane('./node_modules/.bin/vitest', [
    'run',
    'packages/core/test/profile-validator.test.ts',
    'packages/testkit/test/schema-profile-vectors.test.ts',
    '--coverage.enabled=false',
  ]),
  'lifecycle/contribution-runtime-v1': lane(
    'node',
    ['scripts/evidence/run-contribution-lifecycle.mjs'],
    'target',
    [RUN_LOG_ROLE, 'lifecycle/contribution-report-v1'],
  ),
  'integration/reference-host-http-v1': lane(
    'node',
    ['scripts/evidence/run-reference-host-http.mjs'],
    'target',
    [RUN_LOG_ROLE, 'integration/reference-host-report-v1'],
  ),
  'integration/media-rich-text-v1': lane(
    'node',
    ['scripts/evidence/run-media-rich-text.mjs'],
    'target',
    [RUN_LOG_ROLE, 'integration/media-rich-text-report-v1'],
  ),
  'integration/kumwe-app-v1': lane(
    'node',
    ['scripts/verify-kumwe-app-proof.mjs'],
    'external-input',
    [
      RUN_LOG_ROLE,
      'integration/external-subject-v1',
      'integration/kumwe-app-report-v1',
      'integration/external-attestation-v1',
    ],
  ),
  'portability/typescript-corpus-v2': lane(
    'node',
    ['scripts/evidence/run-typescript-portability.mjs'],
    'target',
    [RUN_LOG_ROLE, 'portability/typescript-generation-v1', 'portability/corpus-replay-v1'],
  ),
  'accessibility/manual-interactions-v1': manualLane(
    'accessibility/gate-a-interactions-v1',
    'accessibility/manual-interaction-report-v1',
  ),
  'manual/gate-a-01-artifact-vocabulary-v1': manualLane('gate-a/01-artifact-vocabulary-v1'),
  'manual/gate-a-10-host-playbooks-v1': manualLane('gate-a/10-host-playbooks-v1'),
  'manual/gate-a-11-evolution-policy-v1': manualLane('gate-a/11-evolution-policy-v1'),
  'manual/gate-a-13-independent-reproduction-v1': manualLane(
    'gate-a/13-independent-reproduction-v1',
  ),
  'manual/gate-a-14-risk-register-v1': manualLane('gate-a/14-risk-register-v1'),
  'release/reproducible-family-v1': lane(
    'node',
    ['scripts/evidence/verify-reproducible-family.mjs'],
    'target',
    [
      RUN_LOG_ROLE,
      'release/approved-family-v1',
      'release/clean-consumer-lock-v1',
      'release/provenance-set-v1',
      'release/reproducible-family-report-v1',
      'release/signature-audit-v1',
    ],
  ),
  'release/sbom-v1': lane('node', ['scripts/evidence/create-release-sbom.mjs'], 'target', [
    RUN_LOG_ROLE,
    'release/cyclonedx-sbom-v1',
  ]),
  'release/staged-registry-install': lane('npm', ['run', 'release:verify-stage'], 'target', [
    RUN_LOG_ROLE,
    'release/staged-registry-report-v1',
  ]),
};

const gateBTargetPairs = Object.freeze([
  ['01-contract-implementation', 'contract'],
  ['01-contract-implementation', 'integration'],
  ['02-coordinated-npm-release', 'release'],
  ['03-dom-free-core', 'unit'],
  ['03-dom-free-core', 'property-fuzz'],
  ['03-dom-free-core', 'portability'],
  ['04-web-authoring-operations', 'end-to-end'],
  ['04-web-authoring-operations', 'accessibility'],
  ['05-host-conformance', 'integration'],
  ['05-host-conformance', 'lifecycle'],
  ['06-public-rendering-boundary', 'integration'],
  ['06-public-rendering-boundary', 'security'],
  ['07-extension-theme-examples', 'lifecycle'],
  ['07-extension-theme-examples', 'integration'],
  ['08-document-compatibility', 'lifecycle'],
  ['08-document-compatibility', 'integration'],
  ['09-web-accessibility', 'accessibility'],
  ['09-web-accessibility', 'end-to-end'],
  ['10-security-resilience', 'security'],
  ['10-security-resilience', 'property-fuzz'],
  ['11-performance-budgets', 'performance'],
  ['12-deterministic-builds', 'release'],
  ['13-release-materials', 'release'],
  ['13-release-materials', 'manual-decision'],
  ['14-clean-room-host', 'integration'],
  ['14-clean-room-host', 'end-to-end'],
  ['15-kumwe-app-vertical', 'integration'],
  ['15-kumwe-app-vertical', 'end-to-end'],
  ['16-upgrade-recovery', 'lifecycle'],
  ['16-upgrade-recovery', 'integration'],
  ['17-candidate-evidence', 'release'],
  ['18-independent-approval', 'manual-decision'],
]);

for (const [criterion, evidenceClass] of gateBTargetPairs) {
  const id = `gate-b/${criterion}/${evidenceClass}-v1`;
  lanes[id] = lane(
    'node',
    [`scripts/evidence/gate-b/${criterion}-${evidenceClass}.mjs`],
    'target',
    [RUN_LOG_ROLE, 'gate-b/criterion-proof-v1'],
  );
}

export const EVIDENCE_LANES = Object.freeze(lanes);

const genericIds = Object.freeze([
  'quality/format',
  'quality/lint',
  'quality/typecheck',
  'build/workspace',
  'contract/package-boundaries',
  'contract/canonical-corpus',
  'contract/release-record',
  'release/package-tarballs',
  'evidence/authenticity',
  'security/secret-scan',
  'contract/requirement-registry',
  'security/threat-registry',
  'release/changeset',
  'unit/workspace',
  'accessibility/web',
]);

const profileIds = Object.freeze([
  'profile/binding-projection-v1',
  'profile/engine-core',
  'profile/host-baseline',
  'profile/host-baseline-v2',
  'profile/media-policy',
  'profile/preview-identity-v1',
  'profile/renderer-web',
  'profile/schema-property',
]);

export const GENERIC_EVIDENCE_LANES = selectLanes(genericIds);
export const PROFILE_EVIDENCE_LANES = selectLanes(profileIds);
export const SPECIALIZED_EVIDENCE_LANES = selectLanes(
  Object.keys(lanes).filter((id) => !genericIds.includes(id) && !profileIds.includes(id)),
);
export const REQUIRED_EVIDENCE_LANES = genericIds;

export function evidenceLane(testId) {
  return EVIDENCE_LANES[testId];
}

export function commandForEvidenceLane(testId) {
  const registered = evidenceLane(testId);
  return registered === undefined
    ? undefined
    : renderEvidenceCommand(registered.command, registered.args);
}

export function renderEvidenceCommand(command, args) {
  return [command, ...args]
    .map((part) => (/^[A-Za-z0-9_./:@+-]+$/u.test(part) ? part : JSON.stringify(part)))
    .join(' ');
}

function lane(command, args, availability = 'executable', artifactRoles = [RUN_LOG_ROLE]) {
  return Object.freeze({
    args: Object.freeze(args),
    artifactRoles: Object.freeze(artifactRoles),
    availability,
    command,
  });
}

function manualLane(procedureId, artifactRole = 'manual/decision-record-v1') {
  return lane(
    'node',
    ['scripts/verify-manual-evidence.mjs', '--procedure', procedureId],
    'manual-input',
    [
      RUN_LOG_ROLE,
      artifactRole,
      'manual/observation-v1',
      'review/attestation-v1',
      'review/signature-v1',
    ],
  );
}

function selectLanes(ids) {
  return Object.freeze(Object.fromEntries(ids.map((id) => [id, lanes[id]])));
}
