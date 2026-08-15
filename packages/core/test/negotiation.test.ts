import { describe, expect, it } from 'vitest';
import {
  STUDIO_CONTRACT_VERSION,
  STUDIO_WIRE_PROTOCOL_VERSION,
  type HostCapabilities,
} from '@kumwe/studio-protocol';
import { negotiateCapabilities } from '../src/index.js';

function capabilities(overrides: Partial<HostCapabilities> = {}): HostCapabilities {
  return {
    capabilities: [],
    contractVersion: STUDIO_CONTRACT_VERSION,
    host: { generation: 'host-r1', id: 'studio.test/host', version: '1.0.0' },
    kind: 'host-capabilities',
    ports: [
      {
        id: 'studio.port/artifact',
        operations: ['studio.operation/load', 'studio.operation/save'],
        version: '1.0.0',
      },
    ],
    protocolVersions: [STUDIO_WIRE_PROTOCOL_VERSION],
    ...overrides,
  };
}

describe('negotiateCapabilities', () => {
  it('resolves an editable session when versions and required ports align', () => {
    const result = negotiateCapabilities(capabilities());
    expect(result.sessionState).toBe('editable');
    expect(result.protocolVersion).toBe(STUDIO_WIRE_PROTOCOL_VERSION);
    expect(result.diagnostics).toEqual([]);
    expect(result.availablePorts).toEqual(['studio.port/artifact']);
  });

  it('refuses an editable session without a common protocol version', () => {
    const result = negotiateCapabilities(capabilities({ protocolVersions: ['9.9.9'] }));
    expect(result.sessionState).toBe('read-only');
    expect(result.protocolVersion).toBeUndefined();
    expect(result.diagnostics).toEqual([
      expect.objectContaining({
        code: 'studio.host/no-common-protocol-version',
        severity: 'blocking',
      }),
    ]);
  });

  it('refuses an editable session when a required port is missing', () => {
    const result = negotiateCapabilities(capabilities({ ports: [] }));
    expect(result.sessionState).toBe('read-only');
    expect(result.missingRequiredPorts).toEqual(['studio.port/artifact']);
    expect(result.diagnostics).toEqual([
      expect.objectContaining({ code: 'studio.host/missing-required-port', severity: 'blocking' }),
    ]);
  });

  it('degrades missing optional ports with informational diagnostics', () => {
    const result = negotiateCapabilities(capabilities(), {
      optionalPorts: ['studio.port/preview', 'studio.port/media'],
    });
    expect(result.sessionState).toBe('editable');
    expect(result.missingOptionalPorts).toEqual(['studio.port/preview', 'studio.port/media']);
    expect(result.diagnostics).toHaveLength(2);
    expect(result.diagnostics.every((entry) => entry.severity === 'information')).toBe(true);
  });

  it('honours caller-selected version support and port requirements', () => {
    const result = negotiateCapabilities(
      capabilities({ protocolVersions: ['0.2.0', STUDIO_WIRE_PROTOCOL_VERSION] }),
      {
        requiredPorts: ['studio.port/artifact', 'studio.port/permission'],
        supportedProtocolVersions: ['0.2.0'],
      },
    );
    expect(result.protocolVersion).toBe('0.2.0');
    expect(result.sessionState).toBe('read-only');
    expect(result.missingRequiredPorts).toEqual(['studio.port/permission']);
  });
});
