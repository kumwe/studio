import { expect, test, type Locator } from '@playwright/test';

const phpOrigin = 'http://127.0.0.1:4174';

interface HostedObservation {
  dirty: { blueprint: boolean; entry: boolean; model: boolean };
  entryRevision: string;
  entryValues: Record<string, unknown>;
  resourceContextKey: string;
  sessionGeneration: string;
  sessionId: string;
}

interface EmittedConfigurationObservation {
  csrfHeaderName: string;
  csrfToken: string;
  instanceId: string;
  resourceContextKey: string;
  routePrefix: string;
  sessionGeneration: string;
  sessionId: string;
}

interface QualificationAudit {
  mounts: Record<
    string,
    {
      csrfHeaderName: string;
      entryRevision: string;
      entryValues: Record<string, unknown>;
      instanceId: string;
      resourceContextKey: string;
      routePrefix: string;
      responseAttack: string | null;
      sessionGeneration: string;
      sessionId: string;
    }
  >;
  operations: {
    idempotencyKeyPresent: boolean;
    mount: string;
    resourceContextKey: string;
    route: string;
    sessionGeneration: string;
  }[];
  security: {
    cookieAuthenticated: boolean;
    csrfMatched: boolean;
    mount: string;
    originMatched: boolean;
    resourceRoutePrefix: string;
    route: string;
    sameOriginFetch: boolean;
  }[];
}

interface MountFailureObservation {
  category?: string;
  instanceId?: string;
  messageKey?: string;
  retryable?: boolean;
  revision?: string;
}

interface HostileNetworkObservation {
  body?: string;
  contentLength?: number;
  contentType?: string;
  status: number;
}

test('compiled Studio completes isolated authoritative round trips through real PHP', async ({
  context,
  page,
  request: isolatedRequest,
}) => {
  const browserErrors: string[] = [];
  const hostileNetworkResponses = new Map<string, HostileNetworkObservation>();
  const hostileResponseReads: Promise<void>[] = [];
  const postPaths: string[] = [];
  const postUrls: string[] = [];
  let alphaResolveRequestBody: string | undefined;
  page.on('pageerror', (error) => browserErrors.push(error.message));
  page.on('request', (request) => {
    if (request.method() !== 'POST') return;
    postUrls.push(request.url());
    if (!request.url().startsWith(phpOrigin)) return;
    const path = new URL(request.url()).pathname;
    postPaths.push(path);
    if (path === '/studio/alpha/ports/authoring/resolve-target') {
      alphaResolveRequestBody ??= request.postData() ?? undefined;
    }
  });
  page.on('response', (networkResponse) => {
    const path = new URL(networkResponse.url()).pathname;
    const match = /^\/studio\/([^/]+)\/ports\/authoring\/resolve-target$/u.exec(path);
    const mount = match?.[1];
    if (mount === undefined || mount === 'alpha' || mount === 'beta') return;
    const headers = networkResponse.headers();
    const contentLength = Number.parseInt(headers['content-length'] ?? '', 10);
    hostileNetworkResponses.set(mount, {
      ...(Number.isSafeInteger(contentLength) ? { contentLength } : {}),
      ...(headers['content-type'] === undefined ? {} : { contentType: headers['content-type'] }),
      status: networkResponse.status(),
    });
    if (mount === 'duplicate-json') {
      hostileResponseReads.push(
        networkResponse.text().then((body) => {
          hostileNetworkResponses.set(mount, {
            ...hostileNetworkResponses.get(mount),
            body,
            status: networkResponse.status(),
          });
        }),
      );
    }
  });

  const response = await page.goto(`${phpOrigin}/`);
  expect(response?.status()).toBe(200);
  await expect(page.locator('html')).toHaveAttribute('data-php-mount-ready', 'true');
  await expect(page.locator('html')).toHaveAttribute('data-php-mount-success-count', '2');
  await expect(page.locator('html')).toHaveAttribute('data-php-mount-failure-count', '6');

  const alpha = page.locator('#studio-alpha > kumwe-studio-contextual');
  const beta = page.locator('#studio-beta > kumwe-studio-contextual');
  await expect(alpha).toHaveCount(1);
  await expect(beta).toHaveCount(1);
  await expect(page.locator('#studio-refused > kumwe-studio-contextual')).toHaveCount(0);
  await expect(page.locator('#studio-refused > kumwe-studio-standalone')).toHaveCount(0);
  await expect(page.locator('#studio-refused [role="alert"]')).toContainText(
    'The PHP host refused this resource for authoring.',
  );
  const hostileMessages = new Map([
    ['missing-content-type', 'The host response could not be interpreted.'],
    ['wrong-content-type', 'The host response could not be interpreted.'],
    ['duplicate-json', 'The host response could not be interpreted.'],
    ['conflict', 'The PHP host reported an authoritative conflict for this resource.'],
    ['oversized', 'The host response exceeds the configured transport limit.'],
  ]);
  for (const [mount, message] of hostileMessages) {
    await expect(page.locator(`#studio-${mount} > kumwe-studio-contextual`)).toHaveCount(0);
    await expect(page.locator(`#studio-${mount} > kumwe-studio-standalone`)).toHaveCount(0);
    await expect(page.locator(`#studio-${mount} [role="alert"]`)).toContainText(message);
  }
  await Promise.all(hostileResponseReads);
  expect(hostileNetworkResponses.get('missing-content-type')?.status).toBe(200);
  expect(hostileNetworkResponses.get('missing-content-type')?.contentType).toBeUndefined();
  expect(hostileNetworkResponses.get('wrong-content-type')).toMatchObject({
    contentType: 'text/plain; charset=utf-8',
    status: 200,
  });
  expect(hostileNetworkResponses.get('duplicate-json')).toMatchObject({
    contentType: 'application/json; charset=utf-8',
    status: 200,
  });
  expect(hostileNetworkResponses.get('duplicate-json')?.body).toMatch(/^\{"value":null,"value":/u);
  expect(hostileNetworkResponses.get('oversized')?.contentLength).toBeGreaterThan(1_024);
  expect(hostileNetworkResponses.get('conflict')).toMatchObject({
    contentType: 'application/json; charset=utf-8',
    status: 409,
  });

  const mountFailures = await page.evaluate(() => {
    return JSON.parse(document.documentElement.dataset.phpMountFailures ?? '[]') as
      MountFailureObservation[] | undefined;
  });
  expect(mountFailures).toHaveLength(6);
  expect(mountFailures).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        category: 'forbidden',
        instanceId: 'php-e2e-refused',
        messageKey: 'studio.e2e/resource-forbidden',
        retryable: false,
      }),
      ...['missing-content-type', 'wrong-content-type', 'duplicate-json'].map((mount) =>
        expect.objectContaining({
          category: 'internal',
          instanceId: `php-e2e-${mount}`,
          messageKey: 'studio.transport/http-malformed-response',
          retryable: false,
        }),
      ),
      expect.objectContaining({
        category: 'conflict',
        instanceId: 'php-e2e-conflict',
        messageKey: 'studio.e2e/resource-conflict',
        retryable: false,
        revision: 'entry-conflict-authoritative-r9',
      }),
      expect.objectContaining({
        category: 'limit-exceeded',
        instanceId: 'php-e2e-oversized',
        messageKey: 'studio.transport/http-response-too-large',
        retryable: false,
      }),
    ]),
  );

  const cookies = await context.cookies(phpOrigin);
  expect(cookies).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        httpOnly: true,
        name: 'studio_php_browser_e2e',
        sameSite: 'Strict',
      }),
    ]),
  );
  expect(await page.evaluate(() => document.cookie)).not.toContain('studio_php_browser_e2e');

  const emitted = await page.evaluate(() => {
    const values: EmittedConfigurationObservation[] = [];
    for (const mount of [
      'alpha',
      'beta',
      'refused',
      'missing-content-type',
      'wrong-content-type',
      'duplicate-json',
      'conflict',
      'oversized',
    ]) {
      const script = document.querySelector(`#studio-config-${mount}`);
      if (!(script instanceof HTMLScriptElement)) throw new Error('Missing emitted Studio config.');
      const configuration = JSON.parse(script.textContent ?? '') as {
        instanceId: string;
        session: {
          resourceContext: { key: string };
          sessionGeneration: string;
          sessionId: string;
        };
        transport: {
          authentication: { csrf: { headerName: string; token: string } };
          routing: { endpoints: Record<string, string>; kind: 'operation-map' };
        };
      };
      const resolveRoute = configuration.transport.routing.endpoints['authoring/resolve-target'];
      if (resolveRoute === undefined) throw new Error('Missing resolve route.');
      values.push({
        csrfHeaderName: configuration.transport.authentication.csrf.headerName,
        csrfToken: configuration.transport.authentication.csrf.token,
        instanceId: configuration.instanceId,
        resourceContextKey: configuration.session.resourceContext.key,
        routePrefix: resolveRoute.replace(/\/authoring\/resolve-target$/u, ''),
        sessionGeneration: configuration.session.sessionGeneration,
        sessionId: configuration.session.sessionId,
      });
    }
    return values;
  });
  expect(new Set(emitted.map((entry) => entry.instanceId)).size).toBe(8);
  expect(new Set(emitted.map((entry) => entry.sessionId)).size).toBe(8);
  expect(new Set(emitted.map((entry) => entry.sessionGeneration)).size).toBe(8);
  expect(new Set(emitted.map((entry) => entry.resourceContextKey)).size).toBe(8);
  expect(new Set(emitted.map((entry) => entry.csrfHeaderName)).size).toBe(8);
  expect(new Set(emitted.map((entry) => entry.csrfToken)).size).toBe(8);
  expect(new Set(emitted.map((entry) => entry.routePrefix)).size).toBe(8);

  expect(await observe(alpha)).toMatchObject({
    dirty: { blueprint: false, entry: false, model: false },
    entryRevision: 'entry-alpha-r7',
    entryValues: { name: 'Alpha initial' },
    resourceContextKey: 'contexts/php-e2e-alpha',
    sessionGeneration: 'session-alpha-r1',
    sessionId: 'sessions/php-e2e-alpha',
  });
  expect(await observe(beta)).toMatchObject({
    entryRevision: 'entry-beta-r7',
    entryValues: { name: 'Beta initial' },
    resourceContextKey: 'contexts/php-e2e-beta',
    sessionGeneration: 'session-beta-r1',
    sessionId: 'sessions/php-e2e-beta',
  });

  if (alphaResolveRequestBody === undefined) {
    throw new Error('The browser did not expose its real alpha resolve request for replay.');
  }
  const alphaConfiguration = emitted.find((entry) => entry.instanceId === 'php-e2e-alpha');
  if (alphaConfiguration === undefined) throw new Error('Missing emitted alpha configuration.');
  const acceptedHeaders = {
    'Content-Type': 'application/json',
    Origin: phpOrigin,
    'Sec-Fetch-Site': 'same-origin',
  };
  const unauthenticatedResponse = await isolatedRequest.post(
    `${phpOrigin}/studio/alpha/ports/authoring/resolve-target`,
    {
      data: alphaResolveRequestBody,
      headers: {
        ...acceptedHeaders,
        [alphaConfiguration.csrfHeaderName]: alphaConfiguration.csrfToken,
      },
    },
  );
  expect(unauthenticatedResponse.status()).toBe(401);
  expect(unauthenticatedResponse.headers()['content-type']).toContain('application/json');
  expect(await unauthenticatedResponse.json()).toMatchObject({
    category: 'unauthenticated',
    kind: 'host-error',
    message: { key: 'studio.php/http-unauthenticated' },
    retryable: false,
  });
  const integrityAttempts = [
    { label: 'missing CSRF', headers: acceptedHeaders },
    {
      label: 'wrong CSRF',
      headers: { ...acceptedHeaders, [alphaConfiguration.csrfHeaderName]: 'wrong-token' },
    },
    {
      label: 'wrong Origin',
      headers: {
        ...acceptedHeaders,
        [alphaConfiguration.csrfHeaderName]: alphaConfiguration.csrfToken,
        Origin: 'https://attacker.invalid',
      },
    },
    {
      label: 'wrong Fetch Metadata',
      headers: {
        ...acceptedHeaders,
        [alphaConfiguration.csrfHeaderName]: alphaConfiguration.csrfToken,
        'Sec-Fetch-Site': 'cross-site',
      },
    },
  ];
  for (const attempt of integrityAttempts) {
    const refusedResponse = await context.request.post(
      `${phpOrigin}/studio/alpha/ports/authoring/resolve-target`,
      {
        data: alphaResolveRequestBody,
        headers: attempt.headers,
      },
    );
    expect(refusedResponse.status(), attempt.label).toBe(403);
    expect(refusedResponse.headers()['content-type'], attempt.label).toContain('application/json');
    expect(await refusedResponse.json(), attempt.label).toMatchObject({
      category: 'forbidden',
      kind: 'host-error',
      message: { key: 'studio.php/http-request-integrity-failed' },
      retryable: false,
    });
  }
  expect(await observe(alpha)).toMatchObject({ entryValues: { name: 'Alpha initial' } });
  expect(await observe(beta)).toMatchObject({ entryValues: { name: 'Beta initial' } });

  await alpha.getByRole('tab', { name: 'Content' }).click();
  const alphaName = alpha.getByRole('textbox', { name: 'Name' });
  await alphaName.fill('Alpha accepted by PHP');
  await alphaName.blur();
  await expect.poll(async () => (await observe(alpha)).dirty.entry).toBe(true);

  await alpha.getByRole('button', { name: 'Save item' }).click();
  const confirmation = page.locator('#studio-alpha').getByRole('alertdialog');
  await expect(confirmation).toBeVisible();
  await expect(confirmation).toContainText('Confirm the PHP-authoritative item save.');
  await confirmation.getByRole('button', { name: 'Confirm and save' }).click();
  await expect.poll(async () => (await observe(alpha)).entryRevision).toBe('entry-alpha-r8');
  expect(await observe(alpha)).toMatchObject({
    dirty: { blueprint: false, entry: false, model: false },
    entryValues: { name: 'Alpha accepted by PHP' },
  });
  expect(await observe(beta)).toMatchObject({
    entryRevision: 'entry-beta-r7',
    entryValues: { name: 'Beta initial' },
  });

  await page.getByRole('button', { name: 'Reopen alpha' }).click();
  await expect(page.locator('#studio-alpha > kumwe-studio-contextual')).toHaveCount(1);
  const reopenedAlpha = page.locator('#studio-alpha > kumwe-studio-contextual');
  await expect
    .poll(async () => (await observe(reopenedAlpha)).entryRevision)
    .toBe('entry-alpha-r8');
  expect(await observe(reopenedAlpha)).toMatchObject({
    dirty: { blueprint: false, entry: false, model: false },
    entryValues: { name: 'Alpha accepted by PHP' },
    resourceContextKey: 'contexts/php-e2e-alpha',
    sessionId: 'sessions/php-e2e-alpha',
  });

  await page.getByRole('button', { name: 'Dispose alpha' }).click();
  await expect(page.locator('#studio-alpha > kumwe-studio-contextual')).toHaveCount(0);
  await expect(beta).toHaveCount(1);
  expect(await observe(beta)).toMatchObject({ entryValues: { name: 'Beta initial' } });
  await page.getByRole('button', { name: 'Dispose beta' }).click();
  await expect(beta).toHaveCount(0);
  await expect(page.locator('#studio-refused > kumwe-studio-standalone')).toHaveCount(0);

  const audit = await page.evaluate(async (origin) => {
    const auditResponse = await fetch(`${origin}/e2e/audit`, {
      cache: 'no-store',
      credentials: 'same-origin',
    });
    if (!auditResponse.ok) throw new Error('PHP audit response failed.');
    return (await auditResponse.json()) as QualificationAudit;
  }, phpOrigin);
  expect(audit.mounts.alpha).toMatchObject({
    entryRevision: 'entry-alpha-r8',
    entryValues: { name: 'Alpha accepted by PHP' },
    resourceContextKey: 'contexts/php-e2e-alpha',
    routePrefix: '/studio/alpha/ports',
    sessionId: 'sessions/php-e2e-alpha',
  });
  expect(audit.mounts.beta).toMatchObject({
    entryRevision: 'entry-beta-r7',
    entryValues: { name: 'Beta initial' },
    resourceContextKey: 'contexts/php-e2e-beta',
    routePrefix: '/studio/beta/ports',
    sessionId: 'sessions/php-e2e-beta',
  });
  expect(audit.mounts['missing-content-type']?.responseAttack).toBe('missing-content-type');
  expect(audit.mounts['wrong-content-type']?.responseAttack).toBe('wrong-content-type');
  expect(audit.mounts['duplicate-json']?.responseAttack).toBe('duplicate-json-member');
  expect(audit.mounts.oversized?.responseAttack).toBe('oversized-json');
  const acceptedSecurity = audit.security.filter(
    (entry) =>
      entry.cookieAuthenticated &&
      entry.csrfMatched &&
      entry.originMatched &&
      entry.sameOriginFetch,
  );
  expect(acceptedSecurity.length).toBeGreaterThanOrEqual(14);
  expect(audit.security.filter((entry) => !entry.csrfMatched)).toHaveLength(2);
  expect(new Set(audit.security.map((entry) => entry.resourceRoutePrefix))).toEqual(
    new Set([
      '/studio/alpha/ports',
      '/studio/beta/ports',
      '/studio/refused/ports',
      '/studio/missing-content-type/ports',
      '/studio/wrong-content-type/ports',
      '/studio/duplicate-json/ports',
      '/studio/conflict/ports',
      '/studio/oversized/ports',
    ]),
  );

  const alphaOperations = audit.operations
    .filter((entry) => entry.mount === 'alpha')
    .map((entry) => entry.route);
  expect(alphaOperations).toEqual([
    'authoring/resolve-target',
    'authoring/start',
    'authoring/plan-save',
    'authoring/save-item',
    'authoring/resolve-target',
    'authoring/start',
  ]);
  expect(
    audit.operations.filter((entry) => entry.mount === 'beta').map((entry) => entry.route),
  ).toEqual(['authoring/resolve-target', 'authoring/start']);
  expect(
    audit.operations.filter((entry) => entry.mount === 'refused').map((entry) => entry.route),
  ).toEqual(['authoring/resolve-target']);
  for (const mount of hostileMessages.keys()) {
    expect(
      audit.operations.filter((entry) => entry.mount === mount).map((entry) => entry.route),
    ).toEqual(['authoring/resolve-target']);
  }
  expect(
    audit.operations
      .filter((entry) => entry.route === 'authoring/start' || entry.route === 'authoring/save-item')
      .every((entry) => entry.idempotencyKeyPresent),
  ).toBe(true);
  expect(
    audit.operations.every(
      (entry) =>
        entry.resourceContextKey === `contexts/php-e2e-${entry.mount}` &&
        entry.sessionGeneration === `session-${entry.mount}-r1`,
    ),
  ).toBe(true);

  expect(postUrls.every((url) => new URL(url).origin === phpOrigin)).toBe(true);
  const uniquePostPaths = [...new Set(postPaths)].sort();
  expect(uniquePostPaths).toEqual(
    [
      '/studio/alpha/ports/authoring/resolve-target',
      '/studio/alpha/ports/authoring/start',
      '/studio/alpha/ports/authoring/plan-save',
      '/studio/alpha/ports/authoring/save-item',
      '/studio/beta/ports/authoring/resolve-target',
      '/studio/beta/ports/authoring/start',
      '/studio/refused/ports/authoring/resolve-target',
      '/studio/missing-content-type/ports/authoring/resolve-target',
      '/studio/wrong-content-type/ports/authoring/resolve-target',
      '/studio/duplicate-json/ports/authoring/resolve-target',
      '/studio/conflict/ports/authoring/resolve-target',
      '/studio/oversized/ports/authoring/resolve-target',
    ].sort(),
  );
  expect(browserErrors).toEqual([]);
});

async function observe(studio: Locator): Promise<HostedObservation> {
  return studio.evaluate((element) => {
    const contextual = element as HTMLElement & {
      dirtyState: { blueprint: boolean; entry: boolean; model: boolean };
      snapshot?: {
        resourceContext: { key: string };
        sessionGeneration: string;
        sessionId: string;
        state: {
          entry: { revision: string; values: Record<string, unknown> };
        };
      };
    };
    const snapshot = contextual.snapshot;
    if (snapshot === undefined) throw new Error('Hosted Studio is not open.');
    return {
      dirty: structuredClone(contextual.dirtyState),
      entryRevision: snapshot.state.entry.revision,
      entryValues: structuredClone(snapshot.state.entry.values),
      resourceContextKey: snapshot.resourceContext.key,
      sessionGeneration: snapshot.sessionGeneration,
      sessionId: snapshot.sessionId,
    };
  });
}
