import { describe, expect, it } from 'vitest';
import {
  STUDIO_DEFAULT_URL_POLICY,
  validateExternalUrl,
  type ExternalUrlPolicy,
  type ExternalUrlRejectionReason,
} from '../src/index.js';

function reasonOf(
  candidate: string,
  policy?: ExternalUrlPolicy,
): ExternalUrlRejectionReason | undefined {
  const result =
    policy === undefined ? validateExternalUrl(candidate) : validateExternalUrl(candidate, policy);
  return result.ok ? undefined : result.reason;
}

function acceptedUrl(candidate: string, policy?: ExternalUrlPolicy): string {
  const result =
    policy === undefined ? validateExternalUrl(candidate) : validateExternalUrl(candidate, policy);
  if (!result.ok) {
    throw new Error(`Expected acceptance, got ${result.reason}.`);
  }
  return result.url;
}

describe('STUDIO_DEFAULT_URL_POLICY', () => {
  it('is frozen and carries the documented defaults', () => {
    expect(STUDIO_DEFAULT_URL_POLICY).toEqual({
      allowedSchemes: ['https:'],
      allowPrivateHosts: false,
      maxLength: 2_048,
    });
    expect(Object.isFrozen(STUDIO_DEFAULT_URL_POLICY)).toBe(true);
    expect(Object.isFrozen(STUDIO_DEFAULT_URL_POLICY.allowedSchemes)).toBe(true);
  });
});

describe('validateExternalUrl acceptance', () => {
  it('accepts ordinary https URLs and returns the WHATWG-normalized form', () => {
    expect(acceptedUrl('https://example.com/')).toBe('https://example.com/');
    expect(acceptedUrl('https://example.com')).toBe('https://example.com/');
    expect(acceptedUrl('HTTPS://EXAMPLE.COM/Mixed/Case?q=1')).toBe(
      'https://example.com/Mixed/Case?q=1',
    );
    expect(acceptedUrl('https://cdn.example.com:8443/media/a.png?w=100&h=50#top')).toBe(
      'https://cdn.example.com:8443/media/a.png?w=100&h=50#top',
    );
  });

  it('accepts punycode and IDN hosts lexically', () => {
    expect(acceptedUrl('https://xn--nxasmq6b.example/asset')).toBe(
      'https://xn--nxasmq6b.example/asset',
    );
    expect(acceptedUrl('https://bücher.example/cover.png')).toBe(
      'https://xn--bcher-kva.example/cover.png',
    );
  });

  it('accepts public IP literals in both families', () => {
    expect(reasonOf('https://93.184.216.34/')).toBeUndefined();
    expect(reasonOf('https://[2001:db8::1]/')).toBeUndefined();
    expect(reasonOf('https://[::ffff:808:808]/')).toBeUndefined(); // IPv4-mapped 8.8.8.8
  });

  it('accepts hosts adjacent to every rejected IPv4 range boundary', () => {
    for (const candidate of [
      'https://9.255.255.255/',
      'https://11.0.0.0/',
      'https://126.255.255.255/',
      'https://128.0.0.1/',
      'https://172.15.255.255/',
      'https://172.32.0.0/',
      'https://192.167.255.255/',
      'https://192.169.0.0/',
      'https://169.253.0.1/',
      'https://169.255.0.1/',
      'https://100.63.255.255/',
      'https://100.128.0.0/',
    ]) {
      expect(reasonOf(candidate)).toBeUndefined();
    }
  });

  it('accepts candidates exactly at the length limit', () => {
    const prefix = 'https://example.com/';
    const candidate = `${prefix}${'a'.repeat(2_048 - prefix.length)}`;
    expect(candidate).toHaveLength(2_048);
    expect(reasonOf(candidate)).toBeUndefined();
  });
});

describe('validateExternalUrl rejection: malformed', () => {
  it('rejects strings the WHATWG parser cannot parse', () => {
    for (const candidate of [
      '',
      'not a url',
      'https://',
      'https://exa mple.com/',
      '//example.com/protocol-relative',
      '/relative/path',
      'https://[::1',
    ]) {
      expect(reasonOf(candidate), candidate).toBe('malformed');
    }
  });
});

describe('validateExternalUrl rejection: scheme-not-allowed', () => {
  it('rejects every non-https scheme under the default policy', () => {
    for (const candidate of [
      'http://example.com/',
      'javascript:alert(1)',
      'data:text/html;base64,PHNjcmlwdD4=',
      'file:///etc/passwd',
      'blob:https://example.com/9115d58c',
      'ftp://example.com/archive.tar',
      'ws://example.com/socket',
      'wss://example.com/socket',
      'ssh://example.com/',
      'kumwe-custom://example.com/',
    ]) {
      expect(reasonOf(candidate), candidate).toBe('scheme-not-allowed');
    }
  });
});

describe('validateExternalUrl rejection: credentials-in-url', () => {
  it('rejects any userinfo, in every spelling', () => {
    for (const candidate of [
      ['https://user:', 'password@example.com/'].join(''),
      'https://user@example.com/',
      'https://:password@example.com/',
      'https://user%40inner@example.com/',
      ['https://user:', 'password@127.0.0.1/'].join(''),
    ]) {
      expect(reasonOf(candidate), candidate).toBe('credentials-in-url');
    }
  });
});

describe('validateExternalUrl rejection: host-not-allowed', () => {
  it('rejects loopback and private IPv4 in canonical dotted form', () => {
    for (const candidate of [
      'https://127.0.0.1/',
      'https://127.255.255.254/',
      'https://10.0.0.8/',
      'https://172.16.0.1/',
      'https://172.31.255.255/',
      'https://192.168.0.1/',
      'https://169.254.169.254/latest/meta-data/',
      'https://100.64.3.9/',
      'https://0.0.0.0/',
      'https://255.255.255.255/',
    ]) {
      expect(reasonOf(candidate), candidate).toBe('host-not-allowed');
    }
  });

  it('rejects decimal, octal, hexadecimal, and dotted-partial IPv4 spellings', () => {
    for (const candidate of [
      'https://2130706433/', // decimal 127.0.0.1
      'https://0x7f000001/', // hex 127.0.0.1
      'https://0X7F000001/', // uppercase hex 127.0.0.1
      'https://017700000001/', // octal 127.0.0.1
      'https://127.1/', // dotted-partial 127.0.0.1
      'https://127.0.1/', // dotted-partial 127.0.0.1
      'https://0300.0250.0.01/', // octal dotted 192.168.0.1
      'https://0xc0.0xa8.0x0.0x1/', // hex dotted 192.168.0.1
      'https://0/', // 0.0.0.0
      'https://0xffffffff/', // 255.255.255.255
      'https://169.254.43518/', // dotted-partial 169.254.169.254
    ]) {
      expect(reasonOf(candidate), candidate).toBe('host-not-allowed');
    }
  });

  it('rejects loopback, link-local, unique-local, unspecified, and mapped IPv6', () => {
    for (const candidate of [
      'https://[::1]/',
      'https://[fe80::1]/',
      'https://[febf::1]/',
      'https://[fc00::1]/',
      'https://[fdff::1]/',
      'https://[::]/',
      'https://[::ffff:127.0.0.1]/',
      'https://[::ffff:7f00:1]/', // parser-normalized mapped loopback
      'https://[::ffff:c0a8:1]/', // mapped 192.168.0.1
      'https://[::ffff:a9fe:a9fe]/', // mapped 169.254.169.254
    ]) {
      expect(reasonOf(candidate), candidate).toBe('host-not-allowed');
    }
  });

  it('rejects localhost and special-use name suffixes', () => {
    for (const candidate of [
      'https://localhost/',
      'https://LOCALHOST/',
      'https://localhost./',
      'https://sub.localhost/',
      'https://a.b.localhost/',
      'https://printer.local/',
      'https://vault.internal/',
      'https://router.home.arpa/',
      'https://nas.home.arpa./',
    ]) {
      expect(reasonOf(candidate), candidate).toBe('host-not-allowed');
    }
  });

  it('classifies opaque numeric hosts of non-special schemes without parser help', () => {
    const policy: ExternalUrlPolicy = {
      allowedSchemes: ['kumwe:'],
      allowPrivateHosts: false,
      maxLength: 2_048,
    };
    expect(reasonOf('kumwe://2130706433/asset', policy)).toBe('host-not-allowed');
    expect(reasonOf('kumwe://0x7f000001/asset', policy)).toBe('host-not-allowed');
    expect(reasonOf('kumwe://192.168.0.1/asset', policy)).toBe('host-not-allowed');
    expect(reasonOf('kumwe://example.com/asset', policy)).toBeUndefined();
  });
});

describe('validateExternalUrl rejection: url-too-long', () => {
  it('rejects candidates beyond the configured length before parsing', () => {
    expect(reasonOf(`https://example.com/${'a'.repeat(2_048)}`)).toBe('url-too-long');
    const policy: ExternalUrlPolicy = {
      allowedSchemes: ['https:'],
      allowPrivateHosts: false,
      maxLength: 30,
    };
    expect(reasonOf('https://example.com/1234567890x', policy)).toBe('url-too-long');
    expect(reasonOf('https://example.com/123456789', policy)).toBeUndefined();
  });
});

describe('validateExternalUrl policy overrides', () => {
  const permissive: ExternalUrlPolicy = {
    allowedSchemes: ['https:'],
    allowPrivateHosts: true,
    maxLength: 2_048,
  };

  it('admits the private host set when allowPrivateHosts is true', () => {
    for (const candidate of [
      'https://127.0.0.1/',
      'https://2130706433/',
      'https://10.0.0.8/',
      'https://192.168.0.1/',
      'https://169.254.169.254/',
      'https://[::1]/',
      'https://[fe80::1]/',
      'https://localhost/',
      'https://vault.internal/',
    ]) {
      expect(reasonOf(candidate, permissive), candidate).toBeUndefined();
    }
  });

  it('never admits malformed, credentialed, or scheme-violating URLs', () => {
    expect(reasonOf('https://exa mple.com/', permissive)).toBe('malformed');
    expect(reasonOf(['https://user:', 'password@127.0.0.1/'].join(''), permissive)).toBe(
      'credentials-in-url',
    );
    expect(reasonOf('http://127.0.0.1/', permissive)).toBe('scheme-not-allowed');
    expect(reasonOf('javascript:alert(1)', permissive)).toBe('scheme-not-allowed');
  });

  it('keeps host classification active for every explicitly allowed scheme', () => {
    const policy: ExternalUrlPolicy = {
      allowedSchemes: ['http:', 'https:'],
      allowPrivateHosts: false,
      maxLength: 2_048,
    };
    expect(reasonOf('http://example.com/', policy)).toBeUndefined();
    expect(reasonOf('http://2130706433/', policy)).toBe('host-not-allowed');
    expect(reasonOf('http://localhost/', policy)).toBe('host-not-allowed');
  });
});

describe('validateExternalUrl determinism', () => {
  it('returns identical results for repeated evaluation', () => {
    const candidates = [
      'https://example.com/a?b=c',
      'https://127.0.0.1/',
      'https://user@example.com/',
      'not a url',
      'ftp://example.com/',
      `https://example.com/${'a'.repeat(3_000)}`,
    ];
    for (const candidate of candidates) {
      expect(validateExternalUrl(candidate)).toEqual(validateExternalUrl(candidate));
    }
  });
});
