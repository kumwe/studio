import { describe, expect, it } from 'vitest';
import hostedDeployment from '../../../schemas/examples/studio-deployment.hosted.example.json' with { type: 'json' };
import standaloneDeployment from '../../../schemas/examples/studio-deployment.standalone.example.json' with { type: 'json' };
import {
  assertStudioDeploymentConfiguration,
  parseJsonRejectingDuplicateMembers,
  validateStudioDeploymentConfiguration,
} from '../src/index.js';

describe('Studio deployment validation', () => {
  it('requires emitted deployments to identify their kind mount and archive release', () => {
    expect(validateStudioDeploymentConfiguration({})).toBe(false);
    expect(validateStudioDeploymentConfiguration({ mount: '.studio-page' })).toBe(false);
    expect(validateStudioDeploymentConfiguration(standaloneDeployment)).toBe(true);
  });

  it('admits a bounded standalone locale without admitting hosted session fields', () => {
    expect(validateStudioDeploymentConfiguration(standaloneDeployment)).toBe(true);
    expect(
      validateStudioDeploymentConfiguration({ ...standaloneDeployment, locale: 'x'.repeat(51) }),
    ).toBe(false);
    expect(
      validateStudioDeploymentConfiguration({
        ...standaloneDeployment,
        session: hostedDeployment.session,
      }),
    ).toBe(false);
    expect(
      validateStudioDeploymentConfiguration({
        ...hostedDeployment,
        locale: 'rw',
      }),
    ).toBe(false);
  });

  it('rejects duplicate raw transport and authentication members before parsing', () => {
    expect(() =>
      parseJsonRejectingDuplicateMembers(
        '{"transport":{"kind":"standalone"},"transport":{"kind":"http"}}',
      ),
    ).toThrow(/duplicate member "transport"/u);
    expect(() =>
      parseJsonRejectingDuplicateMembers(
        '{"authentication":{"kind":"bearer-token","kind":"header-token"}}',
      ),
    ).toThrow(/duplicate member "kind"/u);
  });

  it('bounds nesting while scanning duplicate members', () => {
    const hostile = `${'['.repeat(10_000)}null${']'.repeat(10_000)}`;
    expect(() => parseJsonRejectingDuplicateMembers(hostile)).toThrow(/exceeds maximum depth 16/u);
    expect(() => parseJsonRejectingDuplicateMembers('[[null]]', 1)).toThrow(
      /exceeds maximum depth 1/u,
    );
  });

  it('scans large numeric arrays without repeatedly copying the remaining source', () => {
    const source = `[${Array.from({ length: 20_000 }, (_, index) => String(index)).join(',')}]`;
    expect(parseJsonRejectingDuplicateMembers(source)).toHaveLength(20_000);
  });

  it('accepts a complete PHP/host-resolved deployment', () => {
    expect(validateStudioDeploymentConfiguration(hostedDeployment)).toBe(true);
  });

  it('rejects unknown configuration members and malformed authentication', () => {
    expect(validateStudioDeploymentConfiguration({ backend: '/api/studio' })).toBe(false);

    const malformed = structuredClone(hostedDeployment);
    malformed.transport.authentication.credentials = 'omit';
    expect(validateStudioDeploymentConfiguration(malformed)).toBe(false);
  });

  it('rejects reserved authentication fields case-insensitively in the schema contract', () => {
    const csrf = structuredClone(hostedDeployment);
    csrf.transport.authentication.csrf.headerName = 'aUtHoRiZaTiOn';
    expect(validateStudioDeploymentConfiguration(csrf)).toBe(false);

    const custom = structuredClone(hostedDeployment) as unknown as Record<string, unknown>;
    const transport = custom.transport as Record<string, unknown>;
    transport.authentication = {
      credentials: 'omit',
      expiresAt: '2029-01-01T00:10:00Z',
      headerName: 'Sec-Fetch-Site',
      issuedAt: '2029-01-01T00:00:00Z',
      kind: 'header-token',
      token: 'example',
    };
    expect(validateStudioDeploymentConfiguration(custom)).toBe(false);
  });

  it('enforces the closed fifteen-minute serialized token window', () => {
    const now = Date.parse('2029-01-01T00:00:00Z');
    const tokenDeployment = structuredClone(hostedDeployment) as unknown as Record<string, unknown>;
    const transport = tokenDeployment.transport as Record<string, unknown>;
    transport.authentication = {
      credentials: 'omit',
      expiresAt: '2029-01-01T00:15:00Z',
      issuedAt: '2029-01-01T00:00:00Z',
      kind: 'bearer-token',
      token: 'example',
    };
    expect(validateStudioDeploymentConfiguration(tokenDeployment, now)).toBe(true);

    for (const [issuedAt, expiresAt] of [
      ['2029-01-01T00:00:00Z', '2029-01-01T00:15:00.000000001Z'],
      ['2029-01-01T00:00:01Z', '2029-01-01T00:10:01Z'],
      ['2028-12-31T23:50:00Z', '2029-01-01T00:00:00Z'],
      ['not-an-instant', '2029-01-01T00:10:00Z'],
    ]) {
      const invalid = structuredClone(tokenDeployment);
      const invalidTransport = invalid.transport as Record<string, unknown>;
      invalidTransport.authentication = {
        credentials: 'omit',
        expiresAt,
        issuedAt,
        kind: 'bearer-token',
        token: 'invalid',
      };
      expect(validateStudioDeploymentConfiguration(invalid, now)).toBe(false);
    }
  });

  it('rejects a launch/session resource-context mismatch before transport', () => {
    const mismatched = structuredClone(hostedDeployment);
    mismatched.launch.resourceContext.key = 'contexts/other-page';
    expect(validateStudioDeploymentConfiguration(mismatched)).toBe(false);
  });

  it('requires operation-map routes to agree exactly with host capabilities', () => {
    const missing = structuredClone(hostedDeployment);
    missing.transport.routing.endpoints = {
      'authoring/resolve-target': missing.transport.routing.endpoints['authoring/resolve-target'],
    } as typeof missing.transport.routing.endpoints;
    expect(validateStudioDeploymentConfiguration(missing)).toBe(false);

    const unadvertised = structuredClone(hostedDeployment);
    Object.assign(unadvertised.transport.routing.endpoints, {
      'media/list': '/api/studio/media/list',
    });
    expect(validateStudioDeploymentConfiguration(unadvertised)).toBe(false);
  });

  it('rejects unknown advertised operation capabilities with single-endpoint routing', () => {
    const unknown = structuredClone(hostedDeployment);
    unknown.transport.routing = {
      endpoint: '/api/studio',
      kind: 'single-endpoint',
    } as unknown as typeof unknown.transport.routing;
    unknown.session.hostCapabilities.ports[0]?.operations.push(
      'studio.operation/authoring.future-operation',
    );
    expect(validateStudioDeploymentConfiguration(unknown)).toBe(false);
  });

  it('throws a bounded value-free assertion error', () => {
    const token = ['must-not', 'appear', 'in-diagnostics'].join('-');
    let message = '';
    try {
      assertStudioDeploymentConfiguration({
        transport: {
          authentication: { credentials: 'omit', kind: 'bearer-token', token },
          kind: 'http',
          routing: { endpoint: '/api/studio', kind: 'single-endpoint' },
        },
      });
    } catch (error) {
      message = error instanceof Error ? error.message : String(error);
    }
    expect(message).toContain('Studio deployment configuration is invalid');
    expect(message).not.toContain(token);
  });
});
