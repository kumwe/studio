import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { Ajv2020 } from 'ajv/dist/2020.js';
import {
  protocolSchemas,
  STUDIO_CONTRACT_VERSION,
  STUDIO_WIRE_PROTOCOL_VERSION,
  type HostAdapter,
} from '@kumwe/studio-protocol';
import { createTestbedHost } from '../src/index.js';

/**
 * The published operation registry is the only place the three names of a port
 * operation — the typed method, the route segment, and the capability
 * identifier — are bound together. If it drifts from the typed surface a host
 * cannot publish a truthful capability document, so this suite fails on any
 * divergence rather than letting the registry rot.
 */

interface RegistryEntry {
  capability: string;
  method: string;
  expectsRevision: boolean;
  mutating: boolean;
  operation: string;
  port: string;
  portCapability: string;
  required: boolean;
  route: string;
}

interface Registry {
  contractVersion: string;
  kind: string;
  operations: RegistryEntry[];
}

const registry = JSON.parse(
  await readFile(
    join(process.cwd(), 'packages/testkit/fixtures/host-operations.example.json'),
    'utf8',
  ),
) as Registry;

const ajv = new Ajv2020({ allErrors: true, strict: true });
for (const schema of protocolSchemas) {
  ajv.addSchema(schema);
}

/** Every port operation the typed HostAdapter actually exposes at runtime. */
function typedSurface(host: HostAdapter): string[] {
  const surface: string[] = [];
  for (const [portName, port] of Object.entries(host)) {
    if (port === undefined) {
      continue;
    }
    for (const [operation, member] of Object.entries(port as Record<string, unknown>)) {
      if (typeof member === 'function') {
        surface.push(`${portName}.${operation}`);
      }
    }
  }
  return surface.sort();
}

describe('host operation registry', () => {
  it('validates against its canonical schema', () => {
    const validate = ajv.getSchema(
      'https://schemas.kumwe.org/studio/v1/host-operations.schema.json',
    );
    expect(validate).toBeDefined();
    expect(validate?.(registry), ajv.errorsText(validate?.errors)).toBe(true);
    expect(registry.contractVersion).toBe(STUDIO_CONTRACT_VERSION);
  });

  it('covers exactly the operations the typed port surface exposes', () => {
    const { host } = createTestbedHost();
    // The reference host implements every port except `model`, so the registry
    // is compared against the surface it does expose plus that known absence.
    const implemented = typedSurface(host);
    const declared = registry.operations.map((entry) => `${entry.port}.${entry.method}`).sort();
    for (const method of implemented) {
      expect(declared, `${method} is implemented but not declared in the registry`).toContain(
        method,
      );
    }
    const modelOperations = declared.filter((method) => method.startsWith('model.'));
    expect(modelOperations).toEqual(['model.get', 'model.list']);
    expect(declared.filter((method) => !method.startsWith('model.'))).toEqual(implemented);
  });

  it('binds the three names of every operation one to one', () => {
    for (const entry of registry.operations) {
      expect(entry.route).toBe(`${entry.port}/${entry.operation}`);
      expect(entry.capability).toBe(`studio.operation/${entry.port}.${entry.operation}`);
      // The typed method is the wire name with separators removed, so the two
      // spellings can never drift into unrelated names.
      expect(entry.method).toBe(
        entry.operation.replace(/-([a-z])/g, (_match, letter: string) => letter.toUpperCase()),
      );
      expect(entry.portCapability).toBe(`studio.port/${entry.port}`);
    }
    const routes = registry.operations.map((entry) => entry.route);
    const capabilities = registry.operations.map((entry) => entry.capability);
    expect(new Set(routes).size).toBe(routes.length);
    expect(new Set(capabilities).size).toBe(capabilities.length);
  });

  it('marks exactly the concurrency-protected operations', () => {
    const concurrencyProtected = registry.operations
      .filter((entry) => entry.expectsRevision)
      .map((entry) => entry.route)
      .sort();
    expect(concurrencyProtected).toEqual([
      'artifact/publish',
      'artifact/save',
      'artifact/unpublish',
    ]);
    // A concurrency-protected operation is necessarily a mutation.
    for (const entry of registry.operations) {
      if (entry.expectsRevision) {
        expect(entry.mutating).toBe(true);
      }
    }
  });

  it('requires only the artifact port for an editable session', () => {
    const requiredPorts = [
      ...new Set(registry.operations.filter((entry) => entry.required).map((entry) => entry.port)),
    ];
    expect(requiredPorts).toEqual(['artifact']);
  });

  it('accepts a capability document that names only registered operations', () => {
    const validate = ajv.getSchema(
      'https://schemas.kumwe.org/studio/v1/host-capabilities.schema.json',
    );
    expect(validate).toBeDefined();
    const document = {
      capabilities: [],
      contractVersion: STUDIO_CONTRACT_VERSION,
      host: { generation: 'host-r1', id: 'org.example/host', version: '1.0.0' },
      kind: 'host-capabilities',
      ports: [
        {
          id: 'studio.port/artifact',
          operations: ['studio.operation/artifact.load'],
          version: '1.0.0',
        },
      ],
      protocolVersions: [STUDIO_WIRE_PROTOCOL_VERSION],
    };
    expect(validate?.(document), ajv.errorsText(validate?.errors)).toBe(true);

    // An operation that is not on the wire can no longer be advertised.
    const untruthful = {
      ...document,
      ports: [
        {
          id: 'studio.port/media',
          operations: ['studio.operation/media.upload-everything'],
          version: '1.0.0',
        },
      ],
    };
    expect(validate?.(untruthful)).toBe(false);
  });
});
