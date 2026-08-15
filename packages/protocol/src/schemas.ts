import blockDefinitionSchemaDocument from '../schemas/block-definition.schema.json' with { type: 'json' };
import blueprintSchemaDocument from '../schemas/blueprint.schema.json' with { type: 'json' };
import commandSchemaDocument from '../schemas/command.schema.json' with { type: 'json' };
import commandVectorSchemaDocument from '../schemas/command-vector.schema.json' with { type: 'json' };
import commonSchemaDocument from '../schemas/common.schema.json' with { type: 'json' };
import contentModelSchemaDocument from '../schemas/content-model.schema.json' with { type: 'json' };
import entrySchemaDocument from '../schemas/entry.schema.json' with { type: 'json' };
import hostCapabilitiesSchemaDocument from '../schemas/host-capabilities.schema.json' with { type: 'json' };
import hostErrorSchemaDocument from '../schemas/host-error.schema.json' with { type: 'json' };
import mediaAssetSchemaDocument from '../schemas/media-asset.schema.json' with { type: 'json' };
import mediaReferenceSchemaDocument from '../schemas/media-reference.schema.json' with { type: 'json' };
import pluginManifestSchemaDocument from '../schemas/plugin-manifest.schema.json' with { type: 'json' };
import previewMessageSchemaDocument from '../schemas/preview-message.schema.json' with { type: 'json' };
import richTextSchemaDocument from '../schemas/rich-text.schema.json' with { type: 'json' };
import studioConfigurationSchemaDocument from '../schemas/studio-config.schema.json' with { type: 'json' };
import themeSchemaDocument from '../schemas/theme.schema.json' with { type: 'json' };
import type { JsonSchema } from './types.js';

export const blockDefinitionSchema: JsonSchema = blockDefinitionSchemaDocument;
export const blueprintSchema: JsonSchema = blueprintSchemaDocument;
export const commandSchema: JsonSchema = commandSchemaDocument;
export const commandVectorSchema: JsonSchema = commandVectorSchemaDocument;
export const commonSchema: JsonSchema = commonSchemaDocument;
export const contentModelSchema: JsonSchema = contentModelSchemaDocument;
export const entrySchema: JsonSchema = entrySchemaDocument;
export const hostCapabilitiesSchema: JsonSchema = hostCapabilitiesSchemaDocument;
export const hostErrorSchema: JsonSchema = hostErrorSchemaDocument;
export const mediaAssetSchema: JsonSchema = mediaAssetSchemaDocument;
export const mediaReferenceSchema: JsonSchema = mediaReferenceSchemaDocument;
export const pluginManifestSchema: JsonSchema = pluginManifestSchemaDocument;
export const previewMessageSchema: JsonSchema = previewMessageSchemaDocument;
export const richTextSchema: JsonSchema = richTextSchemaDocument;
export const studioConfigurationSchema: JsonSchema = studioConfigurationSchemaDocument;
export const themeSchema: JsonSchema = themeSchemaDocument;

export const protocolSchemas: readonly JsonSchema[] = Object.freeze([
  commonSchema,
  blockDefinitionSchema,
  blueprintSchema,
  commandSchema,
  commandVectorSchema,
  contentModelSchema,
  entrySchema,
  hostCapabilitiesSchema,
  hostErrorSchema,
  mediaAssetSchema,
  mediaReferenceSchema,
  pluginManifestSchema,
  previewMessageSchema,
  richTextSchema,
  studioConfigurationSchema,
  themeSchema,
]);
