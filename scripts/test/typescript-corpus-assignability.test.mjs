import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, relative, sep } from 'node:path';
import { test } from 'node:test';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';

const execFileAsync = promisify(execFile);
const repositoryRoot = fileURLToPath(new URL('../../', import.meta.url));
const schemaRoot = join(repositoryRoot, 'schemas');
const compilerDepthBoundary = new Set([
  'schemas/vectors/schema-profile/json-depth-limit.accepted.json',
  'schemas/vectors/schema-profile/json-depth-limit.rejected.json',
]);

const exampleSchemas = new Map([
  ['authoring-message-catalog.schema.json', ['authoring-message-catalog.en.json']],
  ['block-definition.schema.json', ['block.grid.example.json', 'block.price.example.json']],
  ['blueprint.schema.json', ['blueprint.product.example.json']],
  ['command.schema.json', ['command.move-node.example.json']],
  ['content-model.schema.json', ['content-model.product.example.json']],
  ['design-vocabulary.schema.json', ['design-vocabulary.example.json']],
  ['entry.schema.json', ['entry.product.example.json']],
  ['field-adapter.schema.json', ['field-adapter.example.json']],
  ['host-capabilities.schema.json', ['host-capabilities.example.json']],
  ['host-error.schema.json', ['host-error.conflict.example.json']],
  ['host-operations.schema.json', ['host-operations.example.json']],
  ['inspector.schema.json', ['inspector.example.json']],
  ['media-asset.schema.json', ['media-asset.example.json', 'media-asset.processing.example.json']],
  ['media-reference.schema.json', ['media-reference.example.json']],
  ['media-upload-grant.schema.json', ['media-upload-grant.example.json']],
  ['media-upload-session.schema.json', ['media-upload-session.transferring.example.json']],
  ['migration.schema.json', ['migration.example.json']],
  ['pattern.schema.json', ['pattern.example.json']],
  ['plugin-manifest.schema.json', ['plugin.example.json']],
  ['preview-message.schema.json', ['preview.render.example.json']],
  ['provenance.schema.json', ['provenance.example.json']],
  ['rich-text.schema.json', ['rich-text.example.json']],
  ['studio-config.schema.json', ['studio-config.example.json']],
  ['theme.schema.json', ['theme.example.json']],
  ['unresolved-contribution.schema.json', ['unresolved-contribution.example.json']],
]);

const corpusGroups = [
  ['vectors/binding-projection', 'binding-projection-vector.schema.json'],
  ['vectors/canonical', 'canonical-vector.schema.json'],
  ['vectors/command', 'command-vector.schema.json'],
  ['vectors/host', 'host-vector.schema.json'],
  ['vectors/host-sequence', 'host-sequence-vector.schema.json'],
  ['vectors/media', 'media-vector.schema.json'],
  ['vectors/preview', 'preview-vector.schema.json'],
  ['vectors/schema-profile', 'schema-profile-vector.schema.json'],
  ['conformance/authoring-web', 'authoring-web-vector.schema.json'],
  ['conformance/renderer-web', 'renderer-web-vector.schema.json'],
  ['conformance/rich-text', 'rich-text-projection.schema.json'],
];

test('canonical corpus literals are assignable to their exact generated schema roots', async () => {
  const documents = await loadApplicableCorpus();
  assert.equal(documents.length, 236);

  const bounded = documents.filter(({ path }) => compilerDepthBoundary.has(path));
  assert.deepEqual(bounded.map(({ path }) => path).sort(), [...compilerDepthBoundary].sort());
  const staticallyChecked = documents.filter(({ path }) => !compilerDepthBoundary.has(path));
  assert.equal(staticallyChecked.length, 234);

  const proofRoot = await mkdtemp(join(tmpdir(), 'studio-typescript-corpus-'));
  try {
    await writeCompilerConfig(proofRoot);
    await writeFile(
      join(proofRoot, 'schema-models.ts'),
      await readFile(join(repositoryRoot, 'packages/protocol/src/generated/schema-models.ts')),
    );
    await writeFile(join(proofRoot, 'assignable.ts'), renderAssignments(staticallyChecked));
    await assert.doesNotReject(runTypeScriptCompiler(proofRoot));

    for (const document of bounded) {
      await writeFile(join(proofRoot, 'assignable.ts'), renderAssignments([document]));
      await assert.rejects(
        runTypeScriptCompiler(proofRoot),
        (error) => {
          const diagnostics = `${error.stdout ?? ''}\n${error.stderr ?? ''}`;
          assert.match(diagnostics, /TS2321: Excessive stack depth comparing types/u);
          return true;
        },
        `${document.path} must remain an explicit compiler-depth boundary`,
      );
    }
  } finally {
    await rm(proofRoot, { force: true, recursive: true });
  }
});

async function loadApplicableCorpus() {
  const documents = [];
  for (const [schemaFile, files] of exampleSchemas) {
    for (const file of files) {
      documents.push(await loadDocument(join(schemaRoot, 'examples', file), schemaFile));
    }
  }
  for (const [directory, schemaFile] of corpusGroups) {
    const absoluteDirectory = join(schemaRoot, directory);
    const files = (await readdir(absoluteDirectory))
      .filter((file) => file.endsWith('.json'))
      .sort();
    for (const file of files) {
      documents.push(await loadDocument(join(absoluteDirectory, file), schemaFile));
    }
  }
  documents.push(
    await loadDocument(
      join(repositoryRoot, 'packages/testkit/corpus-manifest.json'),
      'corpus-manifest.schema.json',
    ),
  );
  documents.push(
    await loadDocument(join(repositoryRoot, 'studio-release.json'), 'studio-release.schema.json'),
  );
  return documents;
}

async function loadDocument(path, schemaFile) {
  const source = await readFile(path, 'utf8');
  JSON.parse(source);
  return {
    path: relative(repositoryRoot, path).split(sep).join('/'),
    schemaFile,
    source: source.trim(),
  };
}

function renderAssignments(documents) {
  const assignments = documents.map(
    ({ path, schemaFile, source }, index) =>
      `// ${path}\nconst document${index}: GeneratedProtocolModelMap[${JSON.stringify(
        schemaFile,
      )}] = (${source});\nvoid document${index};`,
  );
  return `import type { GeneratedProtocolModelMap } from './schema-models.js';\n\n${assignments.join(
    '\n\n',
  )}\n`;
}

async function writeCompilerConfig(proofRoot) {
  await writeFile(
    join(proofRoot, 'tsconfig.json'),
    `${JSON.stringify(
      {
        compilerOptions: {
          exactOptionalPropertyTypes: true,
          module: 'NodeNext',
          moduleResolution: 'NodeNext',
          noEmit: true,
          skipLibCheck: true,
          strict: true,
          target: 'ES2024',
          types: [],
        },
        files: ['assignable.ts', 'schema-models.ts'],
      },
      null,
      2,
    )}\n`,
  );
}

async function runTypeScriptCompiler(proofRoot) {
  return execFileAsync(
    process.execPath,
    [join(repositoryRoot, 'node_modules/typescript/bin/tsc'), '--project', 'tsconfig.json'],
    { cwd: proofRoot, maxBuffer: 10 * 1_024 * 1_024 },
  );
}
