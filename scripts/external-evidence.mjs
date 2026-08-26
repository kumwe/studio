import { isDeepStrictEqual } from 'node:util';

import { evidenceLane } from './evidence-lanes.mjs';

export function buildExternalSubjectAssertionIndex(registry) {
  const failures = [];
  const subjectsById = new Map();
  if (
    registry?.contractVersion !== '0.1-draft' ||
    registry?.kind !== 'external-subject-assertion-registry' ||
    !Array.isArray(registry?.subjects) ||
    Object.keys(registry ?? {})
      .sort()
      .join('\n') !== 'contractVersion\nkind\nsubjects'
  ) {
    return {
      failures: ['external subject assertion registry has an invalid closed shape'],
      subjectsById,
    };
  }
  for (const subject of registry.subjects) {
    if (
      subject === null ||
      typeof subject !== 'object' ||
      Array.isArray(subject) ||
      Object.keys(subject).sort().join('\n') !==
        'id\nlaneId\nrepository\nrequiredCommand\nrequiredPackageNames\nrequiredSourcePaths\nstatus\nworkflowPath'
    ) {
      failures.push('external subject assertion entry has an invalid closed shape');
      continue;
    }
    if (subjectsById.has(subject.id)) {
      failures.push(`external subject assertion ${String(subject.id)} is duplicated`);
      continue;
    }
    const registeredLane = evidenceLane(subject.laneId);
    if (registeredLane?.availability !== 'external-input') {
      failures.push(`external subject ${String(subject.id)} requires an external-input lane`);
    }
    if (
      !Array.isArray(subject.requiredPackageNames) ||
      subject.requiredPackageNames.length === 0 ||
      new Set(subject.requiredPackageNames).size !== subject.requiredPackageNames.length ||
      !Array.isArray(subject.requiredSourcePaths) ||
      subject.requiredSourcePaths.length === 0 ||
      new Set(subject.requiredSourcePaths).size !== subject.requiredSourcePaths.length
    ) {
      failures.push(
        `external subject ${String(subject.id)} has invalid required package or source sets`,
      );
    }
    if (!['executable', 'target'].includes(subject.status)) {
      failures.push(`external subject ${String(subject.id)} has invalid status`);
    }
    if (typeof subject.id === 'string') subjectsById.set(subject.id, subject);
  }
  return { failures, subjectsById };
}

export function collectExternalSubjectFailures(subject, context) {
  const failures = [];
  if (context.validateSchema !== undefined && !context.validateSchema(subject)) {
    failures.push(`external subject ${String(subject?.id)} violates its closed schema`);
    return failures;
  }
  const assertion = context.assertion;
  if (assertion === undefined) {
    return [`external subject ${String(subject.id)} is outside the closed subject registry`];
  }
  if (assertion.status !== 'executable') {
    failures.push(
      `external subject ${subject.id} remains target-only until its real workflow and attestation verifier land`,
    );
  } else if (
    !context.authenticatedWorkflowSubjects?.has(externalSubjectAuthenticationKey(subject))
  ) {
    failures.push(
      `external subject ${subject.id} has no authenticated workflow attestation for its exact run`,
    );
  }
  if (
    subject.repository !== assertion.repository ||
    subject.workflow?.repository !== assertion.repository ||
    subject.workflow?.path !== assertion.workflowPath ||
    subject.workflow?.command !== assertion.requiredCommand
  ) {
    failures.push(
      `external subject ${subject.id} does not use its registered repository, workflow, and command`,
    );
  }
  if (subject.commit !== subject.workflow?.commit) {
    failures.push(
      `external subject ${subject.id} workflow commit does not equal the tested commit`,
    );
  }
  const report = context.report;
  const attestation = context.attestation;
  if (
    report === undefined ||
    context.validateReportSchema === undefined ||
    !context.validateReportSchema(report)
  ) {
    failures.push(`external subject ${subject.id} has no valid closed App report`);
  }
  if (
    attestation === undefined ||
    context.validateAttestationSchema === undefined ||
    !context.validateAttestationSchema(attestation)
  ) {
    failures.push(`external subject ${subject.id} has no valid closed workflow attestation`);
  }
  if (report !== undefined) {
    collectBoundDocumentFailures(failures, subject, report, 'report');
  }
  if (attestation !== undefined) {
    collectBoundDocumentFailures(failures, subject, attestation, 'attestation');
    if (attestation.reportChecksum !== subject.reportChecksum) {
      failures.push(`external subject ${subject.id} attestation does not bind its report digest`);
    }
  }
  if (subject.studioBinding?.candidateCommit !== context.candidateCommit) {
    failures.push(`external subject ${subject.id} is bound to another Studio candidate`);
  }
  const sourcePaths = Object.keys(subject.sourceChecksums ?? {});
  if (!sameMembers(sourcePaths, assertion.requiredSourcePaths)) {
    failures.push(`external subject ${subject.id} does not bind the exact required source set`);
  }
  const expectedLockfiles = assertion.requiredSourcePaths.filter(
    (path) => path === 'composer.lock' || path === 'package-lock.json',
  );
  if (!sameMembers(Object.keys(subject.lockfileChecksums ?? {}), expectedLockfiles)) {
    failures.push(`external subject ${subject.id} does not bind the exact required lockfile set`);
  }
  for (const path of expectedLockfiles) {
    if (subject.lockfileChecksums?.[path] !== subject.sourceChecksums?.[path]) {
      failures.push(`external subject ${subject.id} lockfile checksum ${path} is inconsistent`);
    }
  }
  if (
    subject.studioBinding?.corpusManifestChecksum !==
    subject.sourceChecksums?.['tests/Fixtures/Studio/testkit/corpus-manifest.json']
  ) {
    failures.push(`external subject ${subject.id} corpus checksum is inconsistent`);
  }
  const embeddedReleasePaths = [
    'resources/studio-contract/protocol/studio-release.json',
    'resources/studio-contract/studio-release.json',
  ];
  if (
    embeddedReleasePaths.some(
      (path) => subject.sourceChecksums?.[path] !== subject.studioBinding?.releaseRecordChecksum,
    )
  ) {
    failures.push(
      `external subject ${subject.id} embedded release record checksums are inconsistent`,
    );
  }
  if (
    !sameMembers(
      Object.keys(subject.studioBinding?.packageIntegrities ?? {}),
      assertion.requiredPackageNames,
    )
  ) {
    failures.push(`external subject ${subject.id} does not bind the exact Studio package family`);
  }
  for (const path of [
    subject.recordArtifactPath,
    subject.reportArtifactPath,
    subject.attestationArtifactPath,
  ]) {
    if (!context.artifactPaths.has(path)) {
      failures.push(
        `external subject ${subject.id} links unknown retained artifact ${String(path)}`,
      );
    }
  }
  const expectedArtifacts = [
    [subject.recordArtifactPath, 'integration/external-subject-v1'],
    [subject.reportArtifactPath, 'integration/kumwe-app-report-v1'],
    [subject.attestationArtifactPath, 'integration/external-attestation-v1'],
  ];
  for (const [path, role] of expectedArtifacts) {
    const artifact = context.artifactsByPath?.get(path);
    if (
      artifact !== undefined &&
      (artifact.producerTestId !== 'integration/kumwe-app-v1' || artifact.role !== role)
    ) {
      failures.push(
        `external subject ${subject.id} artifact ${path} does not match its exact App verifier producer and role`,
      );
    }
  }
  const reportArtifact = context.artifactsByPath?.get(subject.reportArtifactPath);
  if (reportArtifact !== undefined && reportArtifact.checksum !== subject.reportChecksum) {
    failures.push(`external subject ${subject.id} report digest does not match its artifact`);
  }
  const attestationArtifact = context.artifactsByPath?.get(subject.attestationArtifactPath);
  if (
    attestationArtifact !== undefined &&
    attestationArtifact.checksum !== subject.attestationChecksum
  ) {
    failures.push(`external subject ${subject.id} attestation digest does not match its artifact`);
  }
  if (
    new Set([
      subject.recordArtifactPath,
      subject.reportArtifactPath,
      subject.attestationArtifactPath,
    ]).size !== 3
  ) {
    failures.push(
      `external subject ${subject.id} record, report, and attestation must be distinct artifacts`,
    );
  }
  return failures;
}

export function externalSubjectAuthenticationKey(subject) {
  return [
    subject.repository,
    subject.ref,
    subject.commit,
    subject.tree,
    subject.workflow?.path,
    subject.workflow?.commit,
    subject.workflow?.runId,
    subject.workflow?.runAttempt,
    subject.workflow?.command,
    subject.workflow?.digest,
    subject.reportChecksum,
    subject.attestationChecksum,
  ].join('\u0000');
}

function collectBoundDocumentFailures(failures, subject, document, kind) {
  for (const member of ['repository', 'ref', 'commit', 'tree']) {
    if (document[member] !== subject[member]) {
      failures.push(`external subject ${subject.id} ${kind} does not bind exact ${member}`);
    }
  }
  if (!isDeepStrictEqual(document.workflow, subject.workflow)) {
    failures.push(`external subject ${subject.id} ${kind} does not bind the exact workflow run`);
  }
  if (!isDeepStrictEqual(document.sourceChecksums, subject.sourceChecksums)) {
    failures.push(
      `external subject ${subject.id} ${kind} does not bind authenticated App source checksums`,
    );
  }
  if (!isDeepStrictEqual(document.studioBinding, subject.studioBinding)) {
    failures.push(
      `external subject ${subject.id} ${kind} does not bind the exact Studio release, corpus, and package integrities`,
    );
  }
}

function sameMembers(left, right) {
  if (left.length !== right.length || new Set(left).size !== left.length) return false;
  const expected = new Set(right);
  return expected.size === right.length && left.every((item) => expected.has(item));
}
