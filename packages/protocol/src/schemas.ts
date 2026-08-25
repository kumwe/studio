import blockDefinitionSchemaDocument from '../schemas/block-definition.schema.json' with { type: 'json' };
import bindingProjectionVectorSchemaDocument from '../schemas/binding-projection-vector.schema.json' with { type: 'json' };
import authoringWebVectorSchemaDocument from '../schemas/authoring-web-vector.schema.json' with { type: 'json' };
import blueprintSchemaDocument from '../schemas/blueprint.schema.json' with { type: 'json' };
import commandSchemaDocument from '../schemas/command.schema.json' with { type: 'json' };
import commandVectorSchemaDocument from '../schemas/command-vector.schema.json' with { type: 'json' };
import commonSchemaDocument from '../schemas/common.schema.json' with { type: 'json' };
import contentModelSchemaDocument from '../schemas/content-model.schema.json' with { type: 'json' };
import designVocabularySchemaDocument from '../schemas/design-vocabulary.schema.json' with { type: 'json' };
import entrySchemaDocument from '../schemas/entry.schema.json' with { type: 'json' };
import fieldAdapterSchemaDocument from '../schemas/field-adapter.schema.json' with { type: 'json' };
import hostCapabilitiesSchemaDocument from '../schemas/host-capabilities.schema.json' with { type: 'json' };
import hostErrorSchemaDocument from '../schemas/host-error.schema.json' with { type: 'json' };
import hostOperationsSchemaDocument from '../schemas/host-operations.schema.json' with { type: 'json' };
import hostRequestSchemaDocument from '../schemas/host-request.schema.json' with { type: 'json' };
import hostResultSchemaDocument from '../schemas/host-result.schema.json' with { type: 'json' };
import hostVectorSchemaDocument from '../schemas/host-vector.schema.json' with { type: 'json' };
import hostSequenceVectorSchemaDocument from '../schemas/host-sequence-vector.schema.json' with { type: 'json' };
import inspectorSchemaDocument from '../schemas/inspector.schema.json' with { type: 'json' };
import mediaAssetSchemaDocument from '../schemas/media-asset.schema.json' with { type: 'json' };
import mediaReferenceSchemaDocument from '../schemas/media-reference.schema.json' with { type: 'json' };
import mediaUploadGrantSchemaDocument from '../schemas/media-upload-grant.schema.json' with { type: 'json' };
import mediaUploadSessionSchemaDocument from '../schemas/media-upload-session.schema.json' with { type: 'json' };
import migrationSchemaDocument from '../schemas/migration.schema.json' with { type: 'json' };
import patternSchemaDocument from '../schemas/pattern.schema.json' with { type: 'json' };
import pluginManifestSchemaDocument from '../schemas/plugin-manifest.schema.json' with { type: 'json' };
import previewMessageSchemaDocument from '../schemas/preview-message.schema.json' with { type: 'json' };
import previewVectorSchemaDocument from '../schemas/preview-vector.schema.json' with { type: 'json' };
import rendererWebVectorSchemaDocument from '../schemas/renderer-web-vector.schema.json' with { type: 'json' };
import provenanceSchemaDocument from '../schemas/provenance.schema.json' with { type: 'json' };
import richTextSchemaDocument from '../schemas/rich-text.schema.json' with { type: 'json' };
import schemaProfileSchemaDocument from '../schemas/schema-profile.schema.json' with { type: 'json' };
import schemaProfileVectorSchemaDocument from '../schemas/schema-profile-vector.schema.json' with { type: 'json' };
import studioConfigurationSchemaDocument from '../schemas/studio-config.schema.json' with { type: 'json' };
import studioChartSchemaDocument from '../schemas/studio-chart.schema.json' with { type: 'json' };
import studioDrawingSchemaDocument from '../schemas/studio-drawing.schema.json' with { type: 'json' };
import studioMoneySchemaDocument from '../schemas/studio-money.schema.json' with { type: 'json' };
import themeSchemaDocument from '../schemas/theme.schema.json' with { type: 'json' };
import unresolvedContributionSchemaDocument from '../schemas/unresolved-contribution.schema.json' with { type: 'json' };
import type { JsonSchema } from './types.js';

export const blockDefinitionSchema: JsonSchema = blockDefinitionSchemaDocument;
export const bindingProjectionVectorSchema: JsonSchema = bindingProjectionVectorSchemaDocument;
export const authoringWebVectorSchema: JsonSchema = authoringWebVectorSchemaDocument;
export const blueprintSchema: JsonSchema = blueprintSchemaDocument;
export const commandSchema: JsonSchema = commandSchemaDocument;
export const commandVectorSchema: JsonSchema = commandVectorSchemaDocument;
export const commonSchema: JsonSchema = commonSchemaDocument;
export const contentModelSchema: JsonSchema = contentModelSchemaDocument;
export const designVocabularySchema: JsonSchema = designVocabularySchemaDocument;
export const entrySchema: JsonSchema = entrySchemaDocument;
export const fieldAdapterSchema: JsonSchema = fieldAdapterSchemaDocument;
export const hostCapabilitiesSchema: JsonSchema = hostCapabilitiesSchemaDocument;
export const hostErrorSchema: JsonSchema = hostErrorSchemaDocument;
export const hostOperationsSchema: JsonSchema = hostOperationsSchemaDocument;
export const hostRequestSchema: JsonSchema = hostRequestSchemaDocument;
export const hostResultSchema: JsonSchema = hostResultSchemaDocument;
export const hostVectorSchema: JsonSchema = hostVectorSchemaDocument;
export const hostSequenceVectorSchema: JsonSchema = hostSequenceVectorSchemaDocument;
export const inspectorSchema: JsonSchema = inspectorSchemaDocument;
export const mediaAssetSchema: JsonSchema = mediaAssetSchemaDocument;
export const mediaReferenceSchema: JsonSchema = mediaReferenceSchemaDocument;
export const mediaUploadGrantSchema: JsonSchema = mediaUploadGrantSchemaDocument;
export const mediaUploadSessionSchema: JsonSchema = mediaUploadSessionSchemaDocument;
export const migrationSchema: JsonSchema = migrationSchemaDocument;
export const patternSchema: JsonSchema = patternSchemaDocument;
export const pluginManifestSchema: JsonSchema = pluginManifestSchemaDocument;
export const previewMessageSchema: JsonSchema = previewMessageSchemaDocument;
export const previewVectorSchema: JsonSchema = previewVectorSchemaDocument;
export const rendererWebVectorSchema: JsonSchema = rendererWebVectorSchemaDocument;
export const provenanceSchema: JsonSchema = provenanceSchemaDocument;
export const richTextSchema: JsonSchema = richTextSchemaDocument;
export const schemaProfileSchema: JsonSchema = schemaProfileSchemaDocument;
export const schemaProfileVectorSchema: JsonSchema = schemaProfileVectorSchemaDocument;
export const studioConfigurationSchema: JsonSchema = studioConfigurationSchemaDocument;
export const studioChartSchema: JsonSchema = studioChartSchemaDocument;
export const studioDrawingSchema: JsonSchema = studioDrawingSchemaDocument;
export const studioMoneySchema: JsonSchema = studioMoneySchemaDocument;
export const themeSchema: JsonSchema = themeSchemaDocument;
export const unresolvedContributionSchema: JsonSchema = unresolvedContributionSchemaDocument;

export const protocolSchemas: readonly JsonSchema[] = Object.freeze([
  commonSchema,
  authoringWebVectorSchema,
  blockDefinitionSchema,
  bindingProjectionVectorSchema,
  blueprintSchema,
  commandSchema,
  commandVectorSchema,
  contentModelSchema,
  designVocabularySchema,
  entrySchema,
  fieldAdapterSchema,
  hostOperationsSchema,
  hostCapabilitiesSchema,
  hostErrorSchema,
  hostRequestSchema,
  hostResultSchema,
  hostVectorSchema,
  hostSequenceVectorSchema,
  inspectorSchema,
  mediaAssetSchema,
  mediaReferenceSchema,
  mediaUploadGrantSchema,
  mediaUploadSessionSchema,
  migrationSchema,
  patternSchema,
  pluginManifestSchema,
  previewMessageSchema,
  previewVectorSchema,
  rendererWebVectorSchema,
  provenanceSchema,
  richTextSchema,
  schemaProfileSchema,
  schemaProfileVectorSchema,
  studioConfigurationSchema,
  studioChartSchema,
  studioDrawingSchema,
  studioMoneySchema,
  themeSchema,
  unresolvedContributionSchema,
]);
