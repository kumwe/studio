import { describe, expect, it, vi } from 'vitest';
import type { AuthoringPort } from '@kumwe/studio-protocol';
import { createAuthoringHttpResponder } from '../src/index.js';

describe('authoritative HTTP responder boundary', () => {
  it('authenticates before parsing, schema validation, or host dispatch', async () => {
    const resolveTarget = vi.fn();
    const validateSchema = vi.fn(() => true);
    const verifyTransportSecurity = vi.fn(() => ({
      authenticated: false,
      requestIntegrity: false,
    }));
    const responder = createAuthoringHttpResponder({ resolveTarget } as unknown as AuthoringPort, {
      validateSchema,
      verifyTransportSecurity,
    });

    const response = await responder({
      body: '{not-json',
      headers: { 'content-type': 'application/json' },
      method: 'POST',
      path: '/ports/authoring/resolve-target',
    });

    expect(response.status).toBe(401);
    expect(JSON.parse(response.body)).toMatchObject({
      category: 'unauthenticated',
      kind: 'host-error',
      retryable: false,
    });
    expect(verifyTransportSecurity).toHaveBeenCalledOnce();
    expect(validateSchema).not.toHaveBeenCalled();
    expect(resolveTarget).not.toHaveBeenCalled();
  });

  it('keeps request-integrity refusal authoritative before host dispatch', async () => {
    const resolveTarget = vi.fn();
    const validateSchema = vi.fn(() => true);
    const responder = createAuthoringHttpResponder({ resolveTarget } as unknown as AuthoringPort, {
      validateSchema,
      verifyTransportSecurity: () => ({ authenticated: true, requestIntegrity: false }),
    });

    const response = await responder({
      body: '{}',
      headers: { 'content-type': 'application/json' },
      method: 'POST',
      path: '/ports/authoring/resolve-target',
    });

    expect(response.status).toBe(403);
    expect(JSON.parse(response.body)).toMatchObject({
      category: 'forbidden',
      kind: 'host-error',
      retryable: false,
    });
    expect(validateSchema).not.toHaveBeenCalled();
    expect(resolveTarget).not.toHaveBeenCalled();
  });
});
