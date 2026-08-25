import {
  CORE_PRODUCTION_BLOCK_TYPES,
  coreProductionInitialProperties,
  type CoreProductionBlockType,
} from '@kumwe/studio-core';
import {
  STUDIO_CONTRACT_VERSION,
  type BlockDefinition,
  type BlueprintDocument,
  type BlueprintNode,
  type FieldBinding,
  type JsonObject,
  type JsonValue,
  type QualifiedName,
} from '@kumwe/studio-protocol';

const VERSION = '1.0.0';

export function createReferenceBlueprint(
  definitions: readonly BlockDefinition[],
): BlueprintDocument {
  const definitionByType = new Map(definitions.map((definition) => [definition.type, definition]));
  const node = (
    id: string,
    type: CoreProductionBlockType,
    options: {
      bindings?: Readonly<Record<string, JsonValue | FieldBinding>>;
      properties?: JsonObject;
      responsive?: BlueprintNode['responsive'];
      slots?: Readonly<Record<string, BlueprintNode[]>>;
    } = {},
  ): BlueprintNode => {
    const definition = definitionByType.get(type);
    if (definition === undefined) throw new Error(`Missing reference definition ${type}.`);
    const slots = Object.fromEntries(
      definition.slots.map((slot) => [slot.id, [...(options.slots?.[slot.id] ?? [])]]),
    );
    return {
      authoring: { mode: definition.slots.length === 0 ? 'content' : 'structural' },
      bindings: Object.fromEntries(
        Object.entries(options.bindings ?? {}).map(([port, value]) => [
          port,
          isBinding(value) ? value : staticBinding(value),
        ]),
      ),
      id,
      properties: { ...coreProductionInitialProperties(type), ...(options.properties ?? {}) },
      ...(options.responsive === undefined ? {} : { responsive: options.responsive }),
      slots,
      type,
      version: VERSION,
    };
  };

  const richText = (text: string): JsonObject => ({
    content: [{ content: [{ text, type: 'text' }], type: 'paragraph' }],
    type: 'doc',
  });

  const roots: BlueprintNode[] = [
    node('hero', CORE_PRODUCTION_BLOCK_TYPES.section, {
      slots: {
        content: [
          node('hero-columns', CORE_PRODUCTION_BLOCK_TYPES.columns, {
            properties: { columns: 1 },
            responsive: { columns: { expanded: 2, medium: 2 } },
            slots: {
              items: [
                node('hero-copy', CORE_PRODUCTION_BLOCK_TYPES.stack, {
                  slots: {
                    items: [
                      node('hero-heading', CORE_PRODUCTION_BLOCK_TYPES.heading, {
                        bindings: { text: 'Portable pages, owned end to end' },
                        properties: { level: 1 },
                      }),
                      node('hero-intro', CORE_PRODUCTION_BLOCK_TYPES.richText, {
                        bindings: {
                          content: resourceBinding(
                            'studio.reference/safe-intro',
                            'studio.resource/safe-markup',
                          ),
                        },
                      }),
                      node('hero-action', CORE_PRODUCTION_BLOCK_TYPES.callToAction, {
                        bindings: { label: 'Explore the production catalog' },
                        properties: { appearance: 'primary', href: '#capabilities' },
                      }),
                    ],
                  },
                }),
                node('hero-image', CORE_PRODUCTION_BLOCK_TYPES.image, {
                  bindings: { asset: mediaReference('studio.reference/hero', 'hero') },
                  properties: { fit: 'cover', loading: 'eager' },
                }),
              ],
            },
          }),
        ],
      },
    }),
    node('primary-navigation', CORE_PRODUCTION_BLOCK_TYPES.navigation, {
      bindings: { label: 'Reference page' },
      properties: { presentation: 'navbar' },
      slots: {
        items: [
          node('navigation-overview', CORE_PRODUCTION_BLOCK_TYPES.navigationItem, {
            bindings: { label: 'Overview' },
            properties: { current: true, href: '#capabilities' },
          }),
          node('navigation-guides', CORE_PRODUCTION_BLOCK_TYPES.navigationItem, {
            bindings: { label: 'Guides' },
            properties: { current: false, href: '#host-data' },
            slots: {
              children: [
                node('navigation-integration', CORE_PRODUCTION_BLOCK_TYPES.navigationItem, {
                  bindings: { label: 'Integration guide' },
                  properties: { current: false, href: '#semantic-catalog' },
                }),
              ],
            },
          }),
        ],
      },
    }),
    node('feature-grid', CORE_PRODUCTION_BLOCK_TYPES.grid, {
      properties: { collapse: 'wrap', columns: 1 },
      responsive: { columns: { expanded: 3, medium: 2 } },
      slots: {
        items: [
          node('feature-portable', CORE_PRODUCTION_BLOCK_TYPES.card, {
            bindings: {
              summary: richText('Canonical JSON crosses hosts without exposing editor internals.'),
              title: 'Portable contracts',
            },
            properties: { appearance: 'bordered' },
          }),
          node('feature-dynamic', CORE_PRODUCTION_BLOCK_TYPES.card, {
            bindings: {
              summary: richText(
                'Queries and resources stay host-owned and resolve at delivery time.',
              ),
              title: 'Dynamic resources',
            },
            properties: { appearance: 'bordered' },
          }),
          node('feature-secure', CORE_PRODUCTION_BLOCK_TYPES.card, {
            bindings: {
              summary: richText(
                'Safe markup and scoped styles pass through explicit trusted seams.',
              ),
              title: 'Secure by construction',
            },
            properties: { appearance: 'bordered' },
          }),
        ],
      },
    }),
    node('disclosures', CORE_PRODUCTION_BLOCK_TYPES.columns, {
      properties: { columns: 1 },
      responsive: { columns: { expanded: 2, medium: 2 } },
      slots: {
        items: [
          node('faq', CORE_PRODUCTION_BLOCK_TYPES.accordion, {
            properties: { 'allow-multiple': true },
            slots: {
              items: [
                node('faq-editor', CORE_PRODUCTION_BLOCK_TYPES.accordionItem, {
                  bindings: { title: 'Who owns the rich-text implementation?' },
                  properties: { expanded: true },
                  slots: {
                    content: [
                      node('faq-editor-answer', CORE_PRODUCTION_BLOCK_TYPES.richText, {
                        bindings: {
                          content: richText(
                            'Studio owns the Editor.js adapter; hosts receive only canonical values.',
                          ),
                        },
                      }),
                    ],
                  },
                }),
                node('faq-data', CORE_PRODUCTION_BLOCK_TYPES.accordionItem, {
                  bindings: { title: 'Can blocks render host data?' },
                  slots: {
                    content: [
                      node('faq-data-answer', CORE_PRODUCTION_BLOCK_TYPES.richText, {
                        bindings: {
                          content: richText(
                            'Yes. Resource and query bindings remain declarative in the page.',
                          ),
                        },
                      }),
                    ],
                  },
                }),
              ],
            },
          }),
          node('tabs', CORE_PRODUCTION_BLOCK_TYPES.tabs, {
            properties: { activation: 'automatic' },
            slots: {
              items: [
                node('tab-author', CORE_PRODUCTION_BLOCK_TYPES.tab, {
                  bindings: { title: 'Author' },
                  slots: {
                    content: [
                      node('tab-author-copy', CORE_PRODUCTION_BLOCK_TYPES.richText, {
                        bindings: { content: richText('Compose, bind, preview, and save.') },
                      }),
                    ],
                  },
                }),
                node('tab-deliver', CORE_PRODUCTION_BLOCK_TYPES.tab, {
                  bindings: { title: 'Deliver' },
                  slots: {
                    content: [
                      node('tab-deliver-copy', CORE_PRODUCTION_BLOCK_TYPES.richText, {
                        bindings: {
                          content: richText('Render semantic HTML with progressive behavior.'),
                        },
                      }),
                    ],
                  },
                }),
              ],
            },
          }),
        ],
      },
    }),
    node('interactive-disclosures', CORE_PRODUCTION_BLOCK_TYPES.grid, {
      properties: { collapse: 'wrap', columns: 1 },
      responsive: { columns: { expanded: 3, medium: 2 } },
      slots: {
        items: [
          node('dialog', CORE_PRODUCTION_BLOCK_TYPES.dialog, {
            bindings: { 'trigger-label': 'Open publish checklist', title: 'Publish checklist' },
            properties: { modal: true },
            slots: {
              content: [
                node('dialog-copy', CORE_PRODUCTION_BLOCK_TYPES.richText, {
                  bindings: {
                    content: richText(
                      'Review accessibility, resource permissions, and publication status.',
                    ),
                  },
                }),
              ],
            },
          }),
          node('popover', CORE_PRODUCTION_BLOCK_TYPES.popover, {
            bindings: { 'trigger-label': 'Explain this resource', title: 'Binding source' },
            properties: { 'dismiss-on-blur': true, placement: 'auto' },
            slots: {
              content: [
                node('popover-copy', CORE_PRODUCTION_BLOCK_TYPES.richText, {
                  bindings: {
                    content: richText('The host resolves this value under the active scope.'),
                  },
                }),
              ],
            },
          }),
          node('notice', CORE_PRODUCTION_BLOCK_TYPES.notice, {
            bindings: {
              content: richText('A semantic fallback remains visible before enhancement runs.'),
              title: 'Portable disclosure behavior',
            },
            properties: { dismissible: true, tone: 'information' },
          }),
        ],
      },
    }),
    node('media-gallery', CORE_PRODUCTION_BLOCK_TYPES.gallery, {
      bindings: {
        items: [
          mediaReference('studio.reference/gallery-one', 'gallery'),
          mediaReference('studio.reference/gallery-two', 'gallery'),
          mediaReference('studio.reference/gallery-three', 'gallery'),
        ],
      },
      properties: { autoplay: false, columns: 3, presentation: 'slideshow' },
    }),
    node('capabilities', CORE_PRODUCTION_BLOCK_TYPES.grid, {
      properties: { collapse: 'wrap', columns: 1 },
      responsive: { columns: { expanded: 3, medium: 2 } },
      slots: {
        items: [
          node('chart', CORE_PRODUCTION_BLOCK_TYPES.chart, {
            bindings: {
              chart: {
                datasets: [{ label: 'Pages', values: [8, 21, 34] }],
                labels: ['Draft', 'Review', 'Published'],
                title: 'Content workflow',
                type: 'bar',
              },
            },
          }),
          node('diagram', CORE_PRODUCTION_BLOCK_TYPES.diagram, {
            bindings: { source: 'flowchart LR\n  Studio --> Contract --> Host --> Web' },
            properties: { theme: 'neutral' },
          }),
          node('math', CORE_PRODUCTION_BLOCK_TYPES.math, {
            bindings: { source: 'E = mc^2' },
            properties: { 'display-mode': true },
          }),
          node('drawing', CORE_PRODUCTION_BLOCK_TYPES.drawing, {
            bindings: {
              drawing: {
                alt: 'A blue line rising from lower left to upper right',
                height: 120,
                strokes: [
                  {
                    color: '#3157D5',
                    points: [
                      { x: 10, y: 100 },
                      { x: 70, y: 65 },
                      { x: 150, y: 20 },
                    ],
                    width: 6,
                  },
                ],
                width: 160,
              },
            },
          }),
          node('code', CORE_PRODUCTION_BLOCK_TYPES.code, {
            bindings: { source: 'const page = await studio.render(document);' },
            properties: { language: 'typescript', 'show-line-numbers': true },
          }),
          node('callout', CORE_PRODUCTION_BLOCK_TYPES.callout, {
            bindings: {
              content: richText(
                'The JSON contract is canonical; library adapters remain replaceable.',
              ),
              title: 'Integration boundary',
            },
            properties: { tone: 'information' },
          }),
        ],
      },
    }),
    node('host-data', CORE_PRODUCTION_BLOCK_TYPES.grid, {
      properties: { collapse: 'wrap', columns: 1 },
      responsive: { columns: { expanded: 3, medium: 2 } },
      slots: {
        items: [
          node('content-reference', CORE_PRODUCTION_BLOCK_TYPES.contentReference, {
            bindings: {
              item: resourceBinding(
                'studio.reference/article-featured',
                'studio.resource/content-summary',
              ),
            },
            properties: { presentation: 'summary' },
          }),
          node('content-collection', CORE_PRODUCTION_BLOCK_TYPES.contentCollection, {
            bindings: { items: queryBinding('studio.reference/recent-articles') },
            properties: { limit: 3, presentation: 'cards' },
          }),
          node('price', CORE_PRODUCTION_BLOCK_TYPES.money, {
            bindings: {
              amount: resourceBinding('studio.reference/product-price', 'studio.resource/money'),
            },
          }),
        ],
      },
    }),
    node('semantic-catalog', CORE_PRODUCTION_BLOCK_TYPES.grid, {
      properties: { collapse: 'wrap', columns: 1 },
      responsive: { columns: { expanded: 3, medium: 2 } },
      slots: {
        items: [
          node('reference-article', CORE_PRODUCTION_BLOCK_TYPES.article, {
            bindings: { title: 'Portable delivery article' },
            slots: {
              content: [
                node('reference-article-copy', CORE_PRODUCTION_BLOCK_TYPES.richText, {
                  bindings: {
                    content: richText(
                      'Article landmarks and authored prose retain useful semantic fallbacks.',
                    ),
                  },
                }),
              ],
            },
          }),
          node('reference-cover', CORE_PRODUCTION_BLOCK_TYPES.cover, {
            bindings: { background: mediaReference('studio.reference/gallery-three', 'cover') },
            properties: { alignment: 'center', overlay: 'medium' },
            slots: {
              content: [
                node('reference-cover-heading', CORE_PRODUCTION_BLOCK_TYPES.heading, {
                  bindings: { text: 'Responsive cover' },
                  properties: { level: 2 },
                }),
              ],
            },
          }),
          node('reference-descriptions', CORE_PRODUCTION_BLOCK_TYPES.descriptionList, {
            bindings: { title: 'Contract boundaries' },
            slots: {
              items: [
                node('reference-description-editor', CORE_PRODUCTION_BLOCK_TYPES.descriptionItem, {
                  bindings: {
                    description: richText('Private adapter; canonical value.'),
                    term: 'Editor',
                  },
                }),
                node('reference-description-host', CORE_PRODUCTION_BLOCK_TYPES.descriptionItem, {
                  bindings: {
                    description: richText('Owns authorization, media custody, and resources.'),
                    term: 'Host',
                  },
                }),
              ],
            },
          }),
          node('reference-table', CORE_PRODUCTION_BLOCK_TYPES.table, {
            bindings: {
              table: {
                caption: 'Release evidence',
                columns: ['Capability', 'Status'],
                rows: [
                  ['Canonical document', 'Exercised'],
                  ['Semantic renderer', 'Exercised'],
                  ['External host integration', 'Not claimed'],
                ],
              },
            },
          }),
          node('reference-utilities', CORE_PRODUCTION_BLOCK_TYPES.stack, {
            slots: {
              items: [
                node('reference-badge', CORE_PRODUCTION_BLOCK_TYPES.badge, {
                  bindings: { label: 'Reference host' },
                  properties: { appearance: 'soft', tone: 'information' },
                }),
                node('reference-label', CORE_PRODUCTION_BLOCK_TYPES.label, {
                  bindings: { text: 'Portable semantic controls' },
                  properties: { tone: 'success' },
                }),
                node('reference-icon', CORE_PRODUCTION_BLOCK_TYPES.icon, {
                  bindings: { 'alternative-text': 'Portable Studio symbol' },
                  properties: { decorative: false, name: 'studio/portable' },
                }),
                node('reference-countdown', CORE_PRODUCTION_BLOCK_TYPES.countdown, {
                  bindings: {
                    'completion-message': 'The reference milestone has arrived.',
                    target: '2030-01-01T00:00:00.000Z',
                  },
                  properties: { display: 'compact', 'expired-behavior': 'message' },
                }),
                node('reference-divider', CORE_PRODUCTION_BLOCK_TYPES.divider, {
                  bindings: { label: 'Delivery status' },
                  properties: { style: 'dashed' },
                }),
                node('reference-progress', CORE_PRODUCTION_BLOCK_TYPES.progress, {
                  bindings: { label: 'Reference coverage', value: 45 },
                  properties: { maximum: 45 },
                }),
                node('reference-spinner', CORE_PRODUCTION_BLOCK_TYPES.spinner, {
                  bindings: { label: 'Preview enhancement example' },
                  properties: { active: true, size: 'small' },
                }),
              ],
            },
          }),
          node('reference-search', CORE_PRODUCTION_BLOCK_TYPES.search, {
            bindings: { label: 'Search reference content', placeholder: 'Search blocks' },
            properties: { action: '#capabilities', 'query-parameter': 'q' },
          }),
        ],
      },
    }),
    node('media-types', CORE_PRODUCTION_BLOCK_TYPES.grid, {
      properties: { collapse: 'wrap', columns: 1 },
      responsive: { columns: { expanded: 3, medium: 2 } },
      slots: {
        items: [
          node('video', CORE_PRODUCTION_BLOCK_TYPES.video, {
            bindings: {
              asset: mediaReference('studio.reference/video', 'video'),
              captions: 'Reference video with a text fallback.',
              poster: mediaReference('studio.reference/video-poster', 'poster'),
            },
            properties: { autoplay: false, controls: true, muted: false },
          }),
          node('audio', CORE_PRODUCTION_BLOCK_TYPES.audio, {
            bindings: {
              asset: mediaReference('studio.reference/audio', 'audio'),
              transcript: 'Reference audio transcript.',
            },
            properties: { autoplay: false, controls: true },
          }),
          node('attachment', CORE_PRODUCTION_BLOCK_TYPES.attachment, {
            bindings: {
              asset: mediaReference('studio.reference/guide', 'attachment'),
              label: 'Download the integration guide',
            },
            properties: { download: true },
          }),
          node('embed', CORE_PRODUCTION_BLOCK_TYPES.embed, {
            bindings: {
              resource: resourceBinding(
                'studio.reference/embed-guide',
                'studio.resource/content-summary',
              ),
            },
            properties: { 'aspect-ratio': '16:9' },
          }),
        ],
      },
    }),
  ];

  return {
    contractVersion: STUDIO_CONTRACT_VERSION,
    dependencyLock: {
      blocks: definitions.map((definition) => ({
        revision: definition.revision,
        type: definition.type,
        version: definition.version,
      })),
      theme: { id: 'studio.reference/theme', revision: 'theme-r1', version: VERSION },
    },
    id: 'reference.home',
    kind: 'blueprint',
    label: { defaultMessage: 'Reference home', key: 'studio.reference/home' },
    model: { id: 'studio.reference/model', revision: 'model-r1', version: VERSION },
    owner: { id: 'studio.reference/host', version: VERSION },
    revision: 'blueprint-r1',
    roots,
    status: 'draft',
    version: VERSION,
  };
}

export function createBlankReferenceBlueprint(
  source: Readonly<BlueprintDocument>,
): BlueprintDocument {
  return { ...structuredClone(source), revision: 'blueprint-blank-r1', roots: [] };
}

function staticBinding(value: JsonValue): FieldBinding {
  return {
    onError: 'error',
    onNull: 'empty',
    source: { kind: 'static-value', value },
    transforms: [],
  };
}

function resourceBinding(id: string, resourceType: QualifiedName): FieldBinding {
  return {
    onError: 'error',
    onNull: 'empty',
    source: { id, kind: 'resource-reference', resourceType },
    transforms: [],
  };
}

function queryBinding(query: QualifiedName): FieldBinding {
  return {
    onError: 'error',
    onNull: 'empty',
    source: { kind: 'query-reference', parameters: {}, query, version: VERSION },
    transforms: [],
  };
}

function mediaReference(assetId: string, usage: string): JsonObject {
  return {
    accessibility: { altText: `Reference ${usage} artwork`, mode: 'informative' },
    assetId,
    contractVersion: STUDIO_CONTRACT_VERSION,
    kind: 'media-reference',
    usage: `studio.reference/${usage}`,
  };
}

function isBinding(value: JsonValue | FieldBinding): value is FieldBinding {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    'source' in value &&
    'transforms' in value
  );
}
