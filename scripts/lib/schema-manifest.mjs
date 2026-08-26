import { createHash } from 'node:crypto';

export const SCHEMA_EPOCH = 'https://schemas.kumwe.org/studio/v1/';
export const DOCUMENT_CONTRACT_REVISION = '0.1-draft';
export const SCHEMA_MANIFEST_GENERATOR = Object.freeze({
  name: '@kumwe/studio/schema-manifest',
  version: '1.0.0',
});

export function sha256Digest(bytes) {
  return `sha256-${createHash('sha256').update(bytes).digest('base64')}`;
}

export function buildSchemaManifest(schemaSources) {
  for (const { file, schema } of schemaSources) {
    if (typeof schema?.$id !== 'string' || !schema.$id.startsWith(SCHEMA_EPOCH)) {
      throw new Error(`Canonical schema ${file} is outside schema epoch ${SCHEMA_EPOCH}.`);
    }
  }
  return {
    contractVersion: DOCUMENT_CONTRACT_REVISION,
    epoch: SCHEMA_EPOCH,
    generator: SCHEMA_MANIFEST_GENERATOR,
    kind: 'schema-manifest',
    schemas: schemaSources
      .map(({ bytes, file, schema }) => ({
        digest: sha256Digest(bytes),
        file,
        id: schema.$id,
      }))
      .sort((left, right) => compareCodeUnits(left.file, right.file)),
  };
}

export function serializeSchemaManifest(manifest) {
  return `${JSON.stringify(manifest, null, 2)}\n`;
}

function compareCodeUnits(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}
