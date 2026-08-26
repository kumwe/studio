import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { lstat, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { isAbsolute, join, relative, resolve, sep } from 'node:path';
import { isDeepStrictEqual } from 'node:util';

export const REVIEW_SIGNATURE_NAMESPACE = 'kumwe-studio-evidence-v1';

const authorityChecksumPattern = /^sha256-[A-Za-z0-9+/]{42}[AEIMQUYcgkosw048]=$/u;
const identityPattern =
  /^github\/[1-9][0-9]{0,19}\/[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?$/u;
const publicKeyPattern = /^ssh-ed25519 [A-Za-z0-9+/]{40,120}={0,2}$/u;
const repositoryPathPattern = /^[A-Za-z0-9@][A-Za-z0-9._@-]*(?:\/[A-Za-z0-9@][A-Za-z0-9._@-]*)*$/u;
const reviewerRoles = new Set([
  'general',
  'accessibility',
  'compatibility',
  'data-integrity',
  'security',
]);

export function reviewerAuthorityRegistryChecksum(bytes) {
  return `sha256-${createHash('sha256').update(bytes).digest('base64')}`;
}

export function reviewerAuthorityChecksumFromFile(bytes) {
  if (!Buffer.isBuffer(bytes)) {
    throw new Error('Reviewer authority checksum file must be supplied as exact bytes.');
  }
  const contents = bytes.toString('utf8');
  const checksum = contents.endsWith('\n') ? contents.slice(0, -1) : '';
  if (`${checksum}\n` !== contents || !authorityChecksumPattern.test(checksum)) {
    throw new Error(
      'evidence/reviewer-authorities.sha256 must contain one exact sha256 integrity followed by a newline.',
    );
  }
  return checksum;
}

export function assertReviewerAuthorityStructuralPin(registryBytes, checksumFileBytes) {
  const checksum = reviewerAuthorityChecksumFromFile(checksumFileBytes);
  assertReviewerAuthorityRegistryPin(registryBytes, checksum);
  return checksum;
}

export function assertReviewerAuthorityReleaseTrust(
  registryBytes,
  checksumFileBytes,
  protectedChecksum,
) {
  const checkedInChecksum = assertReviewerAuthorityStructuralPin(registryBytes, checksumFileBytes);
  if (!authorityChecksumPattern.test(protectedChecksum ?? '')) {
    throw new Error(
      'STUDIO_REVIEWER_AUTHORITY_SHA256 must be the protected exact sha256 integrity of evidence/reviewer-authorities.json.',
    );
  }
  if (protectedChecksum !== checkedInChecksum) {
    throw new Error(
      'The protected reviewer authority checksum does not equal evidence/reviewer-authorities.sha256.',
    );
  }
  return checkedInChecksum;
}

export function assertReviewerAuthorityRegistryPin(bytes, expectedChecksum) {
  if (!authorityChecksumPattern.test(expectedChecksum ?? '')) {
    throw new Error('Reviewer authority checksum must be an exact sha256 integrity.');
  }
  const actual = reviewerAuthorityRegistryChecksum(bytes);
  if (actual !== expectedChecksum) {
    throw new Error(
      `Reviewer authority registry checksum ${actual} does not equal supplied checksum ${expectedChecksum}.`,
    );
  }
}

export function buildReviewerAuthorityIndex(registry) {
  const authoritiesByIdentity = new Map();
  const failures = [];
  const publicKeyOwners = new Map();
  if (
    registry?.contractVersion !== '0.1-draft' ||
    registry?.kind !== 'reviewer-authority-registry' ||
    !['active', 'input-required'].includes(registry?.status) ||
    !Array.isArray(registry?.authorities) ||
    Object.keys(registry ?? {})
      .sort()
      .join('\n') !== 'authorities\ncontractVersion\nkind\nstatus'
  ) {
    return {
      authoritiesByIdentity,
      failures: ['reviewer authority registry has an invalid closed shape'],
    };
  }
  for (const authority of registry.authorities) {
    if (
      authority === null ||
      typeof authority !== 'object' ||
      Array.isArray(authority) ||
      Object.keys(authority).sort().join('\n') !== 'identity\nindependent\npublicKeys\nroles'
    ) {
      failures.push('reviewer authority entry has an invalid closed shape');
      continue;
    }
    if (!identityPattern.test(authority.identity ?? '')) {
      failures.push(`reviewer authority ${String(authority.identity)} has an invalid identity`);
    }
    if (authoritiesByIdentity.has(authority.identity)) {
      failures.push(`reviewer authority ${String(authority.identity)} is duplicated`);
      continue;
    }
    if (
      typeof authority.independent !== 'boolean' ||
      !Array.isArray(authority.roles) ||
      authority.roles.length === 0 ||
      new Set(authority.roles).size !== authority.roles.length ||
      authority.roles.some((role) => !reviewerRoles.has(role)) ||
      [...authority.roles].sort().join('\n') !== authority.roles.join('\n')
    ) {
      failures.push(`reviewer authority ${String(authority.identity)} has invalid roles`);
    }
    if (
      !Array.isArray(authority.publicKeys) ||
      authority.publicKeys.length === 0 ||
      new Set(authority.publicKeys).size !== authority.publicKeys.length ||
      authority.publicKeys.some((key) => !publicKeyPattern.test(key))
    ) {
      failures.push(`reviewer authority ${String(authority.identity)} has invalid public keys`);
    }
    for (const key of authority.publicKeys ?? []) {
      const owner = publicKeyOwners.get(key);
      if (owner !== undefined && owner !== authority.identity) {
        failures.push(
          `reviewer public key is shared by authorities ${owner} and ${String(authority.identity)}`,
        );
      } else {
        publicKeyOwners.set(key, authority.identity);
      }
    }
    authoritiesByIdentity.set(authority.identity, authority);
  }
  if (registry.status === 'input-required' && registry.authorities.length !== 0) {
    failures.push('input-required reviewer authority registry must remain empty');
  }
  if (registry.status === 'active' && registry.authorities.length < 2) {
    failures.push('active reviewer authority registry requires at least two authorities');
  }
  return { authoritiesByIdentity, failures };
}

export async function collectSignedReviewFailures({
  authentication,
  context,
  expectedIssuedAt,
  expectedReviewer,
  expectedSubject,
  requiredRole,
  subjectBytes,
}) {
  const failures = [];
  if (context.reviewerAuthorityStructuralPinVerified !== true) {
    return ['review authentication lacks a checksum-pinned reviewer authority registry'];
  }
  if (
    authentication === null ||
    typeof authentication !== 'object' ||
    Array.isArray(authentication) ||
    Object.keys(authentication).sort().join('\n') !== 'attestationPath\nsignaturePath'
  ) {
    return ['review authentication has an invalid closed shape'];
  }
  const authority = context.reviewerAuthorities?.get(expectedReviewer?.identity);
  if (authority === undefined) {
    failures.push(
      `reviewer ${String(expectedReviewer?.identity)} is absent from the externally pinned authority registry`,
    );
    return failures;
  }
  const authorityReviewer = {
    identity: authority.identity,
    independent: authority.independent,
    roles: authority.roles,
  };
  if (!isDeepStrictEqual(authorityReviewer, expectedReviewer)) {
    failures.push(
      `reviewer ${authority.identity} claims roles or independence outside its authority`,
    );
  }
  if (requiredRole !== undefined && !authority.roles.includes(requiredRole)) {
    failures.push(`reviewer ${authority.identity} lacks trusted ${requiredRole} authority`);
  }
  let attestationBytes;
  let signaturePath;
  try {
    [attestationBytes, signaturePath] = await Promise.all([
      readClosedReviewFile(authentication.attestationPath, context, 64 * 1024),
      resolveClosedReviewFile(authentication.signaturePath, context, 16 * 1024),
    ]);
  } catch (error) {
    failures.push(error instanceof Error ? error.message : String(error));
    return failures;
  }
  if (authentication.attestationPath === authentication.signaturePath) {
    failures.push('review attestation and signature paths must be distinct');
    return failures;
  }
  let attestation;
  try {
    attestation = JSON.parse(attestationBytes.toString('utf8'));
  } catch {
    failures.push('review attestation is not valid JSON');
    return failures;
  }
  if (
    context.validateReviewAttestationSchema === undefined ||
    !context.validateReviewAttestationSchema(attestation)
  ) {
    failures.push('review attestation violates its closed schema');
    return failures;
  }
  const expectedBoundSubject = {
    ...expectedSubject,
    subjectChecksum: reviewerAuthorityRegistryChecksum(subjectBytes),
  };
  if (!isDeepStrictEqual(attestation.subject, expectedBoundSubject)) {
    failures.push('review attestation does not bind the exact subject bytes and review context');
  }
  if (!isDeepStrictEqual(attestation.reviewer, authorityReviewer)) {
    failures.push('review attestation reviewer does not equal the trusted authority');
  }
  if (attestation.issuedAt !== expectedIssuedAt) {
    failures.push('review attestation issuedAt does not equal the signed decision time');
  }
  try {
    await verifySshSignature({
      attestationBytes,
      authority,
      signaturePath,
    });
  } catch {
    failures.push(`review attestation signature is not valid for ${authority.identity}`);
  }
  return failures;
}

async function readClosedReviewFile(path, context, maximumBytes) {
  const resolved = await resolveClosedReviewFile(path, context, maximumBytes);
  return readFile(resolved);
}

async function resolveClosedReviewFile(path, context, maximumBytes) {
  if (
    typeof path !== 'string' ||
    path.length > 240 ||
    !repositoryPathPattern.test(path) ||
    isAbsolute(path)
  ) {
    throw new Error(`review authentication path ${String(path)} is not a bounded repository path`);
  }
  const root = context.evidenceRoot ?? context.repositoryRoot;
  const resolved = resolve(root, path);
  if (!isContained(root, resolved)) {
    throw new Error(`review authentication path ${path} escapes the evidence root`);
  }
  const stat = await lstat(resolved);
  if (
    !stat.isFile() ||
    stat.isSymbolicLink() ||
    (stat.mode & 0o777) !== 0o644 ||
    stat.size < 1 ||
    stat.size > maximumBytes
  ) {
    throw new Error(
      `review authentication path ${path} must be a nonempty mode-0644 regular file no larger than ${maximumBytes} bytes`,
    );
  }
  if (!isContained(await realpath(root), await realpath(resolved))) {
    throw new Error(`review authentication path ${path} resolves outside the evidence root`);
  }
  return resolved;
}

async function verifySshSignature({ attestationBytes, authority, signaturePath }) {
  const temporaryRoot = await mkdtemp(join(tmpdir(), 'studio-review-authority-'));
  const allowedSignersPath = join(temporaryRoot, 'allowed_signers');
  try {
    const allowedSigners = authority.publicKeys
      .map((key) => `${authority.identity} namespaces="${REVIEW_SIGNATURE_NAMESPACE}" ${key}\n`)
      .join('');
    await writeFile(allowedSignersPath, allowedSigners, { flag: 'wx', mode: 0o600 });
    await new Promise((resolvePromise, rejectPromise) => {
      const child = execFile(
        'ssh-keygen',
        [
          '-Y',
          'verify',
          '-f',
          allowedSignersPath,
          '-I',
          authority.identity,
          '-n',
          REVIEW_SIGNATURE_NAMESPACE,
          '-s',
          signaturePath,
        ],
        { timeout: 10_000 },
        (error) => (error === null ? resolvePromise() : rejectPromise(error)),
      );
      child.stdin.on('error', rejectPromise);
      child.stdin.end(attestationBytes);
    });
  } finally {
    await rm(temporaryRoot, { force: true, recursive: true });
  }
}

function isContained(root, candidate) {
  const path = relative(root, candidate);
  return path === '' || (!path.startsWith(`..${sep}`) && path !== '..' && !isAbsolute(path));
}
