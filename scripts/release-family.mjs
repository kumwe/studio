export const STUDIO_RELEASE_PACKAGES = Object.freeze([
  Object.freeze({ directory: 'core', name: '@kumwe/studio-core' }),
  Object.freeze({ directory: 'media', name: '@kumwe/studio-media' }),
  Object.freeze({ directory: 'preview', name: '@kumwe/studio-preview' }),
  Object.freeze({ directory: 'protocol', name: '@kumwe/studio-protocol' }),
  Object.freeze({ directory: 'rich-text', name: '@kumwe/studio-rich-text' }),
  Object.freeze({ directory: 'studio-lit', name: '@kumwe/studio' }),
  Object.freeze({ directory: 'testkit', name: '@kumwe/studio-testkit' }),
]);

export const STUDIO_RELEASE_PACKAGE_NAMES = Object.freeze(
  STUDIO_RELEASE_PACKAGES.map(({ name }) => name),
);

export const STUDIO_RELEASE_RECORD_TARGETS = Object.freeze([
  'studio-release.json',
  'packages/protocol/studio-release.json',
  'packages/testkit/studio-release.json',
]);
