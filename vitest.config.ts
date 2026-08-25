import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      '@kumwe/studio': source('studio-lit'),
      '@kumwe/studio-core': source('core'),
      '@kumwe/studio-media': source('media'),
      '@kumwe/studio-preview': source('preview'),
      '@kumwe/studio-protocol': source('protocol'),
      '@kumwe/studio-renderer-web': source('renderer-web'),
      '@kumwe/studio-rich-text': source('rich-text'),
      '@kumwe/studio-testkit': source('testkit'),
    },
  },
  test: {
    coverage: {
      include: ['packages/*/src/**/*.ts'],
      provider: 'v8',
      reporter: ['text', 'html'],
    },
    environment: 'happy-dom',
    include: ['packages/*/test/**/*.test.ts', 'examples/*/test/**/*.test.ts'],
  },
});

function source(packageDirectory: string): string {
  return fileURLToPath(new URL(`./packages/${packageDirectory}/src/index.ts`, import.meta.url));
}
