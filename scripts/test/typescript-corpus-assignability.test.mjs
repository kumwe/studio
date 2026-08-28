import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, relative, sep } from 'node:path';
import { test } from 'node:test';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';

import { buildExpectedTypeScriptRuntimeInventory } from '../lib/typescript-evidence.mjs';

const execFileAsync = promisify(execFile);
const repositoryRoot = fileURLToPath(new URL('../../', import.meta.url));
const schemaRoot = join(repositoryRoot, 'schemas');
const corpusManifest = JSON.parse(
  await readFile(join(repositoryRoot, 'packages/testkit/corpus-manifest.json'), 'utf8'),
);
const compilerDepthBoundary = new Set([
  'schemas/vectors/schema-profile/json-depth-limit.accepted.json',
  'schemas/vectors/schema-profile/json-depth-limit.rejected.json',
]);

const exampleSchemas = new Map([
  ['authoring-message-catalog.schema.json', ['authoring-message-catalog.en.json']],
  ['authoring-save.schema.json', ['authoring-save.plan.example.json']],
  ['authoring-session.schema.json', ['authoring-session.example.json']],
  ['authoring-target.schema.json', ['authoring-target.example.json']],
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
  ['reusable-content-type.schema.json', ['reusable-content-type.example.json']],
  ['studio-config.schema.json', ['studio-config.example.json']],
  [
    'studio-deployment.schema.json',
    ['studio-deployment.hosted.example.json', 'studio-deployment.standalone.example.json'],
  ],
  ['theme.schema.json', ['theme.example.json']],
  ['unresolved-contribution.schema.json', ['unresolved-contribution.example.json']],
]);

const corpusGroupSchemas = new Map([
  [
    'binding-projection-vectors',
    ['vectors/binding-projection', 'binding-projection-vector.schema.json'],
  ],
  ['canonical-vectors', ['vectors/canonical', 'canonical-vector.schema.json']],
  ['command-vectors', ['vectors/command', 'command-vector.schema.json']],
  ['host-vectors', ['vectors/host', 'host-vector.schema.json']],
  ['host-sequence-vectors', ['vectors/host-sequence', 'host-sequence-vector.schema.json']],
  ['authoring-http-vectors', ['vectors/authoring-http', 'authoring-http-vector.schema.json']],
  ['media-vectors', ['vectors/media', 'media-vector.schema.json']],
  ['preview-vectors', ['vectors/preview', 'preview-vector.schema.json']],
  ['schema-profile-vectors', ['vectors/schema-profile', 'schema-profile-vector.schema.json']],
  ['authoring-web-conformance', ['conformance/authoring-web', 'authoring-web-vector.schema.json']],
  ['renderer-web-conformance', ['conformance/renderer-web', 'renderer-web-vector.schema.json']],
  ['rich-text-conformance', ['conformance/rich-text', 'rich-text-projection.schema.json']],
]);

const exampleSchemaByFile = new Map(
  [...exampleSchemas].flatMap(([schemaFile, files]) => files.map((file) => [file, schemaFile])),
);
const transportMatrixPath = 'schemas/vectors/authoring-http/transport-matrix.json';

test('canonical corpus literals are assignable to their exact generated schema roots', async () => {
  const documents = await loadApplicableCorpus();
  const expectedPaths = buildExpectedTypeScriptRuntimeInventory(corpusManifest);
  assert.deepEqual(documents.map(({ path }) => path).sort(), expectedPaths);

  assert.deepEqual(
    documents
      .filter(({ path }) => path === transportMatrixPath)
      .map(({ path, schemaFile }) => ({ path, schemaFile })),
    [{ path: transportMatrixPath, schemaFile: 'authoring-http-vector.schema.json' }],
  );

  const bounded = documents.filter(({ path }) => compilerDepthBoundary.has(path));
  assert.deepEqual(bounded.map(({ path }) => path).sort(), [...compilerDepthBoundary].sort());
  const staticallyChecked = documents.filter(({ path }) => !compilerDepthBoundary.has(path));
  assert.equal(staticallyChecked.length, expectedPaths.length - compilerDepthBoundary.size);
  assert.ok(staticallyChecked.some(({ path }) => path === transportMatrixPath));

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
  const expectedMappedGroups = new Set(corpusGroupSchemas.keys());
  const observedMappedGroups = new Set();
  for (const group of corpusManifest.groups) {
    if (group.path === 'invalid') continue;
    if (group.path === 'fixtures') {
      for (const { file } of group.files) {
        const schemaFile = exampleSchemaByFile.get(file);
        assert.ok(schemaFile, `Manifest fixture ${file} has no generated schema assignment.`);
        documents.push(await loadDocument(join(schemaRoot, 'examples', file), schemaFile));
      }
      assert.deepEqual(
        group.files.map(({ file }) => file).sort(),
        [...exampleSchemaByFile.keys()].sort(),
      );
      continue;
    }

    const assignment = corpusGroupSchemas.get(group.group);
    assert.ok(assignment, `Manifest group ${group.group} has no generated schema assignment.`);
    const [expectedPath, schemaFile] = assignment;
    assert.equal(group.path, expectedPath, `Manifest group ${group.group} changed path.`);
    observedMappedGroups.add(group.group);
    for (const { file } of group.files) {
      documents.push(await loadDocument(join(schemaRoot, group.path, file), schemaFile));
    }
  }
  assert.deepEqual([...observedMappedGroups].sort(), [...expectedMappedGroups].sort());
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
