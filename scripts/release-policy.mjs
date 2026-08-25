const shaPattern = /^[a-f0-9]{40}$/u;
const alphaVersionPattern =
  /^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)-alpha\.(0|[1-9][0-9]*)$/u;
const rcVersionPattern = /^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)-rc\.(0|[1-9][0-9]*)$/u;
const stableVersionPattern = /^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$/u;

// These are the Version 2 profiles that docs/contracts/conformance-profiles.md
// currently marks Declared, executable. Target profiles must be promoted here
// deliberately before a release record is allowed to advertise them.
export const EXECUTABLE_VERSION_TWO_PROFILES = Object.freeze([
  'studio.profile/binding-projection-v1',
  'studio.profile/engine-core',
  'studio.profile/host-baseline',
  'studio.profile/host-baseline-v2',
  'studio.profile/media-policy',
  'studio.profile/preview-identity-v1',
  'studio.profile/renderer-web',
  'studio.profile/schema-property',
]);

const executableProfileSet = new Set(EXECUTABLE_VERSION_TWO_PROFILES);

export function classifyReleaseVersion(version) {
  if (typeof version !== 'string') {
    return undefined;
  }
  if (alphaVersionPattern.test(version)) {
    return 'alpha';
  }
  if (rcVersionPattern.test(version)) {
    return 'rc';
  }
  if (stableVersionPattern.test(version)) {
    return 'stable';
  }
  return undefined;
}

export function promotionTargetVersion(channel, sourceVersion) {
  if (channel === 'rc') {
    const match = alphaVersionPattern.exec(sourceVersion);
    if (match === null) {
      throw new Error('RC preparation requires a coordinated numeric alpha source release.');
    }
    // The counter is intentionally reset. Retagging alpha.9 as rc would let
    // Changesets carry the prerelease counter forward and produce rc.10.
    return `${match[1]}.${match[2]}.${match[3]}-rc.1`;
  }
  if (channel === 'stable') {
    const match = rcVersionPattern.exec(sourceVersion);
    if (match === null) {
      throw new Error('Stable preparation requires a coordinated numeric RC source release.');
    }
    return `${match[1]}.${match[2]}.${match[3]}`;
  }
  throw new Error(`Promotion channel must be rc or stable; received ${String(channel)}.`);
}

export function nextRcVersion(sourceVersion) {
  const match = rcVersionPattern.exec(sourceVersion);
  if (match === null) {
    throw new Error('RC correction requires a coordinated numeric RC source release.');
  }
  return `${match[1]}.${match[2]}.${match[3]}-rc.${Number(match[4]) + 1}`;
}

export function isPromotionVersionTransition(sourceVersion, targetVersion) {
  for (const channel of ['rc', 'stable']) {
    try {
      if (promotionTargetVersion(channel, sourceVersion) === targetVersion) {
        return true;
      }
    } catch {
      // Try the other governed transition.
    }
  }
  return false;
}

export function parseProfileInput(value, { requireNonEmpty = false } = {}) {
  const profiles =
    typeof value === 'string' && value.length > 0
      ? value.split(',').map((profile) => profile.trim())
      : [];
  if (profiles.some((profile) => profile.length === 0)) {
    throw new Error('Profile input must be a comma-separated list without empty members.');
  }
  if (new Set(profiles).size !== profiles.length) {
    throw new Error('Profile input must not contain duplicates.');
  }
  const unsupported = profiles.filter((profile) => !executableProfileSet.has(profile));
  if (unsupported.length > 0) {
    throw new Error(
      `Only currently executable Version 2 profiles may be claimed: ${unsupported.join(', ')}.`,
    );
  }
  if (requireNonEmpty && profiles.length === 0) {
    throw new Error('Promotion requires at least one executable Version 2 profile claim.');
  }
  return [...profiles].sort();
}

export function assertReleaseProfileClaims(document, options) {
  if (
    document === null ||
    typeof document !== 'object' ||
    Array.isArray(document) ||
    document.kind !== 'studio-release-profile-claims' ||
    !Array.isArray(document.profiles) ||
    Object.keys(document).sort().join('\n') !== 'kind\nprofiles'
  ) {
    throw new Error('release-profile-claims.json has an invalid closed shape.');
  }
  const normalized = parseProfileInput(document.profiles.join(','), options);
  if (normalized.join('\n') !== document.profiles.join('\n')) {
    throw new Error('release-profile-claims.json profiles must be unique and sorted.');
  }
  return normalized;
}

export function requiredGateForChannel(channel) {
  if (channel === 'rc') {
    return 'A';
  }
  if (channel === 'stable') {
    return 'B';
  }
  throw new Error(`Promotion channel must be rc or stable; received ${String(channel)}.`);
}

export function assertPromotionEvidencePolicy({
  candidateSha,
  channel,
  gateRecord,
  releaseRecord,
}) {
  if (!shaPattern.test(candidateSha)) {
    throw new Error('Promotion evidence requires an exact lowercase candidate SHA.');
  }
  const requiredGate = requiredGateForChannel(channel);
  if (
    gateRecord.gate !== requiredGate ||
    gateRecord.decision !== 'pass' ||
    gateRecord.sourceCommit !== candidateSha
  ) {
    throw new Error(
      `${channel} publication requires a passing Gate ${requiredGate} record for the exact candidate.`,
    );
  }
  if (classifyReleaseVersion(releaseRecord.release) !== 'rc') {
    throw new Error(
      `The qualified candidate coordinate ${String(releaseRecord.release)} must be an immutable RC.`,
    );
  }
  const claims = parseProfileInput(releaseRecord.claimedProfiles?.join(',') ?? '', {
    requireNonEmpty: true,
  });
  const supported = [...gateRecord.supportedProfiles].sort();
  if (claims.join('\n') !== supported.join('\n')) {
    throw new Error(
      'The release claimedProfiles must exactly equal the profiles supported by the passing gate record.',
    );
  }
}

export function assertPromotionPackageState({
  channel,
  pendingChangesets,
  preState,
  releaseRecord,
}) {
  if (pendingChangesets.length > 0) {
    throw new Error('Promotion requires every top-level Changeset to be consumed first.');
  }
  if (classifyReleaseVersion(releaseRecord.release) !== channel) {
    throw new Error(
      `The coordinated release ${String(releaseRecord.release)} is not a ${channel} coordinate.`,
    );
  }
  if (channel === 'rc' && (preState?.mode !== 'pre' || preState.tag !== 'rc')) {
    throw new Error('RC publication requires Changesets pre mode with the rc tag.');
  }
  if (channel === 'stable' && preState !== undefined) {
    throw new Error('Stable publication requires Changesets prerelease mode to be fully exited.');
  }
  parseProfileInput(releaseRecord.claimedProfiles?.join(',') ?? '', { requireNonEmpty: true });
}
