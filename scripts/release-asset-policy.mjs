import { createHash } from 'node:crypto';

import { transform as transformCss } from 'lightningcss';
import { minify as minifyJavaScriptWithOxc } from 'vite';

export const RELEASE_ASSET_HASH_HEX_LENGTH = 16;

/**
 * These are publication ceilings, not targets. A budget change is reviewable
 * release policy and must never be inferred from the bytes that happened to be
 * produced by the current build.
 */
export const RELEASE_ASSET_BUDGETS = Object.freeze({
  'authoring-browser-module': 1_048_576,
  'authoring-entry': 65_536,
  'authoring-style': 65_536,
  'enhancement-runtime': 65_536,
  'public-style': 262_144,
});

export const RELEASE_ARCHIVE_BUDGET_BYTES = 2_097_152;

export const RELEASE_PACKAGE_BUDGETS = Object.freeze({
  '@kumwe/studio-core': 262_144,
  '@kumwe/studio-media': 32_768,
  '@kumwe/studio-preview': 40_960,
  '@kumwe/studio-protocol': 163_840,
  '@kumwe/studio-renderer-web': 98_304,
  '@kumwe/studio-rich-text': 98_304,
  '@kumwe/studio': 786_432,
  '@kumwe/studio-testkit': 327_680,
});

/** Deterministically minify an ECMAScript module or classic browser script. */
export async function minifyReleaseJavaScript(source, { fileName, format }) {
  if (typeof source !== 'string') throw new TypeError('JavaScript source must be text.');
  if (typeof fileName !== 'string' || fileName.length === 0) {
    throw new TypeError('JavaScript minification requires a filename.');
  }
  if (format !== 'esm' && format !== 'iife') {
    throw new TypeError(`Unsupported release JavaScript format ${String(format)}.`);
  }
  const result = await minifyJavaScriptWithOxc(fileName, source, {
    compress: true,
    legalComments: 'none',
    mangle: true,
    module: format === 'esm',
  });
  if (result.errors.length > 0) {
    throw new Error(
      `Release JavaScript minification failed for ${fileName}: ${JSON.stringify(result.errors)}`,
    );
  }
  return result.code;
}

/** Deterministically minify generated CSS for a deployment layer. */
export function minifyReleaseCss(source, { fileName = 'studio-generated.css' } = {}) {
  const input = Buffer.isBuffer(source) ? source : Buffer.from(source, 'utf8');
  return transformCss({
    code: input,
    drafts: { customMedia: false },
    errorRecovery: false,
    filename: fileName,
    minify: true,
    sourceMap: false,
  }).code;
}

/**
 * Validate renderer-web's language-neutral compact CSS grammar. Producer must
 * write these exact bytes; a host-selected CSS optimizer would break the
 * renderer corpus digest and create a second wire representation.
 */
export function assertCanonicalPublicRendererCss(source) {
  const text = Buffer.isBuffer(source) ? source.toString('utf8') : String(source);
  if (
    text.length === 0 ||
    text !== text.trim() ||
    /[\r\n\t]|\/\*/u.test(text) ||
    /\s[{}:;,]|[{:;,]\s/u.test(text)
  ) {
    throw new Error('Public renderer CSS is not in the canonical compact grammar.');
  }
  return Buffer.from(text, 'utf8');
}

export function releaseAssetIdentity(bytes) {
  const content = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes);
  const contentHash = createHash('sha256').update(content).digest('hex');
  return {
    bytes: content.byteLength,
    contentHash,
    integrity: `sha256-${Buffer.from(contentHash, 'hex').toString('base64')}`,
  };
}

export function contentHashedAssetName(prefix, bytes, extension, { minified = true } = {}) {
  if (!/^[a-z][a-z0-9-]*$/u.test(prefix)) {
    throw new TypeError(`Unsafe release asset prefix ${String(prefix)}.`);
  }
  if (!/^\.[a-z0-9]+$/u.test(extension)) {
    throw new TypeError(`Unsafe release asset extension ${String(extension)}.`);
  }
  const { contentHash } = releaseAssetIdentity(bytes);
  const suffix = minified ? '.min' : '';
  return `${prefix}-${contentHash.slice(0, RELEASE_ASSET_HASH_HEX_LENGTH)}${suffix}${extension}`;
}

/**
 * Close and verify the metadata for one deployable runtime asset. This is the
 * same function used by builders and by the publication gate.
 */
export async function assertReleaseRuntimeAsset(
  asset,
  bytes,
  { format, policy, requireHashedName = true } = {},
) {
  if (
    asset === null ||
    typeof asset !== 'object' ||
    Array.isArray(asset) ||
    typeof asset.path !== 'string' ||
    typeof asset.mediaType !== 'string' ||
    asset.minified !== true ||
    !Number.isSafeInteger(asset.budgetBytes) ||
    asset.budgetBytes <= 0
  ) {
    throw new Error('Release runtime asset metadata is incomplete.');
  }
  const expectedBudget = RELEASE_ASSET_BUDGETS[policy];
  if (expectedBudget === undefined || asset.budgetBytes !== expectedBudget) {
    throw new Error(
      `Release asset ${asset.path} does not carry the governed ${String(policy)} budget.`,
    );
  }
  const identity = releaseAssetIdentity(bytes);
  for (const member of ['bytes', 'contentHash', 'integrity']) {
    if (asset[member] !== identity[member]) {
      throw new Error(`Release asset ${asset.path} has incorrect ${member} metadata.`);
    }
  }
  if (identity.bytes > expectedBudget) {
    throw new Error(
      `Release asset ${asset.path} is ${identity.bytes} bytes and exceeds its ${expectedBudget}-byte budget.`,
    );
  }
  if (requireHashedName) {
    const names = {
      'authoring-browser-module': ['studio-browser', '.js'],
      'authoring-entry': ['studio-authoring', '.js'],
      'authoring-style': ['studio-authoring-style', '.css'],
      'enhancement-runtime': ['studio-enhancements', '.js'],
      'public-style': ['studio-public', '.css'],
    };
    const naming = names[policy];
    const expectedName =
      naming === undefined ? undefined : contentHashedAssetName(naming[0], bytes, naming[1]);
    if (expectedName === undefined || asset.path.split('/').at(-1) !== expectedName) {
      throw new Error(`Release asset ${asset.path} is not named with its exact content hash.`);
    }
  }

  const source = Buffer.isBuffer(bytes) ? bytes.toString('utf8') : String(bytes);
  let remade;
  if (asset.mediaType === 'text/javascript') {
    remade = Buffer.from(
      await minifyReleaseJavaScript(source, {
        fileName: asset.path,
        format,
      }),
    );
  } else if (asset.mediaType === 'text/css') {
    remade =
      policy === 'public-style'
        ? assertCanonicalPublicRendererCss(source)
        : minifyReleaseCss(source, { fileName: asset.path });
  } else {
    throw new Error(`Release runtime asset ${asset.path} has unsupported media type.`);
  }
  if (!Buffer.from(bytes).equals(remade)) {
    throw new Error(`Release runtime asset ${asset.path} is not deterministically minified.`);
  }
  return { ...asset };
}

export function releaseRuntimeAssetRecord({ bytes, mediaType, path, policy, role }) {
  const budgetBytes = RELEASE_ASSET_BUDGETS[policy];
  if (budgetBytes === undefined) throw new Error(`Unknown release asset policy ${String(policy)}.`);
  return {
    ...releaseAssetIdentity(bytes),
    budgetBytes,
    mediaType,
    minified: true,
    path,
    role,
  };
}
