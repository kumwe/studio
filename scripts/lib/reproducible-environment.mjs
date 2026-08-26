import { join } from 'node:path';

import { isCredentialBearingUrl } from './secret-detector.mjs';

export function buildReproducibleEnvironment(
  passRoot,
  userConfig,
  globalConfig,
  processEnvironment = process.env,
) {
  const passthrough = [
    'ALL_PROXY',
    'COMSPEC',
    'HTTPS_PROXY',
    'HTTP_PROXY',
    'LANG',
    'LC_ALL',
    'NO_PROXY',
    'PATH',
    'PATHEXT',
    'SSL_CERT_DIR',
    'SSL_CERT_FILE',
    'SYSTEMROOT',
    'TZ',
    'all_proxy',
    'https_proxy',
    'http_proxy',
    'no_proxy',
  ];
  const temporaryDirectory = join(passRoot, 'tmp');
  const homeDirectory = join(passRoot, 'home');
  return {
    ...Object.fromEntries(
      passthrough
        .filter(
          (key) =>
            processEnvironment[key] !== undefined &&
            !isCredentialBearingUrl(processEnvironment[key]),
        )
        .map((key) => [key, processEnvironment[key]]),
    ),
    CI: '1',
    HOME: homeDirectory,
    NPM_CONFIG_CACHE: join(passRoot, 'npm-cache'),
    NPM_CONFIG_GLOBALCONFIG: globalConfig,
    NPM_CONFIG_REGISTRY: 'https://registry.npmjs.org/',
    NPM_CONFIG_USERCONFIG: userConfig,
    SOURCE_DATE_EPOCH: '0',
    TEMP: temporaryDirectory,
    TMP: temporaryDirectory,
    TMPDIR: temporaryDirectory,
    USERPROFILE: homeDirectory,
    XDG_CACHE_HOME: join(passRoot, 'xdg-cache'),
    XDG_CONFIG_HOME: join(passRoot, 'xdg-config'),
  };
}
