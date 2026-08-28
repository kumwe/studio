import { describe, expect, it } from 'vitest';
import hostedDeployment from '../../../schemas/examples/studio-deployment.hosted.example.json' with { type: 'json' };
import standaloneDeployment from '../../../schemas/examples/studio-deployment.standalone.example.json' with { type: 'json' };
import {
  HostPortFailure,
  STUDIO_WIRE_PROTOCOL_VERSION,
  type HostRequestContext,
} from '@kumwe/studio-protocol';
import {
  createHttpHostAdapter,
  validateStudioDeploymentConfiguration,
  type HttpRequestInit,
} from '../src/index.js';

const now = (): number => Date.parse('2029-01-01T00:00:00Z');

describe('configuration-driven transport objectives', () => {
  it('admits only the isolated local profile when HTTP transport is absent or standalone', () => {
    expect(validateStudioDeploymentConfiguration({})).toBe(false);
    expect(validateStudioDeploymentConfiguration(standaloneDeployment)).toBe(true);
    expect(
      validateStudioDeploymentConfiguration({
        ...standaloneDeployment,
        transport: { kind: 'standalone' },
      }),
    ).toBe(true);

    const withoutTransport = structuredClone(hostedDeployment) as unknown as Record<
      string,
      unknown
    >;
    delete withoutTransport.transport;
    expect(validateStudioDeploymentConfiguration(withoutTransport)).toBe(false);

    const explicitStandalone = structuredClone(hostedDeployment) as unknown as Record<
      string,
      unknown
    >;
    explicitStandalone.transport = { kind: 'standalone' };
    expect(validateStudioDeploymentConfiguration(explicitStandalone)).toBe(false);
  });

  it('keeps endpoint, authentication, and failure state independent across configured instances', async () => {
    const alphaCalls: { init: HttpRequestInit; url: string }[] = [];
    const bravoCalls: { init: HttpRequestInit; url: string }[] = [];
    const alpha = createHttpHostAdapter(
      {
        authentication: {
          credentials: 'same-origin',
          csrf: { headerName: 'X-Alpha-CSRF', token: 'alpha' },
          kind: 'same-origin-session',
        },
        kind: 'http',
        routing: {
          endpoints: { 'model/list': '/php/alpha/models' },
          kind: 'operation-map',
        },
      },
      {
        currentTimeMilliseconds: now,
        fetchImplementation: (url, init) => {
          alphaCalls.push({ init, url });
          return Promise.resolve({
            contentType: 'application/json',
            status: 403,
            text: () => Promise.resolve('{"denied":true}'),
          });
        },
      },
    );
    const bravo = createHttpHostAdapter(
      {
        authentication: {
          credentials: 'same-origin',
          csrf: { headerName: 'X-Bravo-CSRF', token: 'bravo' },
          kind: 'same-origin-session',
        },
        kind: 'http',
        routing: { endpoint: '/php/bravo/studio', kind: 'single-endpoint' },
      },
      {
        currentTimeMilliseconds: now,
        fetchImplementation: (url, init) => {
          bravoCalls.push({ init, url });
          return Promise.resolve({
            contentType: 'application/json',
            status: 200,
            text: () => Promise.resolve('{"value":[]}'),
          });
        },
      },
    );

    const [alphaResult, bravoResult] = await Promise.allSettled([
      alpha.model?.list(context('alpha')),
      bravo.model?.list(context('bravo')),
    ]);

    expect(alphaResult.status).toBe('rejected');
    if (alphaResult.status === 'rejected') {
      expect(alphaResult.reason).toBeInstanceOf(HostPortFailure);
      expect((alphaResult.reason as HostPortFailure).error.category).toBe('forbidden');
    }
    expect(bravoResult).toEqual({ status: 'fulfilled', value: { value: [] } });
    expect(alphaCalls).toHaveLength(1);
    expect(bravoCalls).toHaveLength(1);
    expect(alphaCalls[0]).toMatchObject({
      init: {
        credentials: 'same-origin',
        headers: { 'x-alpha-csrf': 'alpha' },
      },
      url: '/php/alpha/models',
    });
    expect(alphaCalls[0]?.init.headers).not.toHaveProperty('x-bravo-csrf');
    expect(bravoCalls[0]).toMatchObject({
      init: {
        credentials: 'same-origin',
        headers: {
          'x-bravo-csrf': 'bravo',
          'x-studio-operation': 'model/list',
        },
      },
      url: '/php/bravo/studio',
    });
    expect(bravoCalls[0]?.init.headers).not.toHaveProperty('x-alpha-csrf');
  });
});

function context(instance: string): HostRequestContext {
  return {
    operationId: 'studio.operation/model.list',
    protocolVersion: STUDIO_WIRE_PROTOCOL_VERSION,
    requestId: `requests/${instance}`,
    resourceContextKey: `contexts/${instance}`,
    sessionGeneration: `${instance}-r1`,
  };
}
