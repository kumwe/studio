/**
 * Canonical policy for external resource URLs (remote media imports, embeds).
 * Studio never fetches author-supplied URLs itself; hosts that do MUST apply
 * this validator before any fetch. The policy is purely lexical and
 * deterministic — it classifies the WHATWG-parsed URL without network access,
 * DNS resolution, clocks, or locale sensitivity. DNS-rebinding defence,
 * redirect re-validation, and response verification therefore remain host
 * runtime obligations of the hardened fetcher.
 */

/**
 * Core compiles against pure ECMAScript libs, so the WHATWG `URL` global —
 * provided by every supported JavaScript runtime — is declared here with the
 * minimal surface the policy reads. The declaration is erased at compile time
 * and resolves to the runtime's own implementation.
 */
declare class URL {
  public constructor(input: string, base?: string);
  public hostname: string;
  public href: string;
  public password: string;
  public protocol: string;
  public username: string;
}

export type ExternalUrlRejectionReason =
  'credentials-in-url' | 'host-not-allowed' | 'malformed' | 'scheme-not-allowed' | 'url-too-long';

export type ExternalUrlValidationResult =
  { ok: false; reason: ExternalUrlRejectionReason } | { ok: true; url: string };

export interface ExternalUrlPolicy {
  /**
   * Schemes admitted for fetching, compared against the parsed URL's
   * lowercase protocol including its trailing colon (for example `https:`).
   */
  allowedSchemes: readonly string[];
  /**
   * Whether loopback, private, link-local, carrier-grade NAT, unspecified,
   * broadcast, and special-use (`localhost`, `.local`, `.internal`,
   * `.home.arpa`) hosts are admitted. An empty host is rejected regardless.
   */
  allowPrivateHosts: boolean;
  /** Maximum accepted length of the raw candidate string, in code units. */
  maxLength: number;
}

export const STUDIO_DEFAULT_URL_POLICY: Readonly<ExternalUrlPolicy> = Object.freeze({
  allowedSchemes: Object.freeze<string[]>(['https:']),
  allowPrivateHosts: false,
  maxLength: 2_048,
});

/**
 * Validate one external resource URL against the policy. The candidate is
 * parsed with the WHATWG URL parser and classification operates on the parsed
 * `hostname`, so decimal, octal, hexadecimal, and dotted-partial IPv4
 * spellings (`2130706433`, `0x7f000001`, `017700000001`, `127.1`) are
 * normalized before range checks and cannot smuggle a private address past
 * the policy. Punycode and IDN hosts that name none of the disallowed ranges
 * are accepted lexically; whether such a name ultimately resolves to a
 * private address is a DNS-time question the host fetcher must re-check.
 */
export function validateExternalUrl(
  candidate: string,
  policy: ExternalUrlPolicy = STUDIO_DEFAULT_URL_POLICY,
): ExternalUrlValidationResult {
  if (candidate.length > policy.maxLength) {
    return { ok: false, reason: 'url-too-long' };
  }
  let parsed: URL;
  try {
    parsed = new URL(candidate);
  } catch {
    return { ok: false, reason: 'malformed' };
  }
  if (!policy.allowedSchemes.includes(parsed.protocol)) {
    return { ok: false, reason: 'scheme-not-allowed' };
  }
  if (parsed.username.length > 0 || parsed.password.length > 0) {
    return { ok: false, reason: 'credentials-in-url' };
  }
  if (!isPermittedHost(parsed.hostname, policy.allowPrivateHosts)) {
    return { ok: false, reason: 'host-not-allowed' };
  }
  return { ok: true, url: parsed.href };
}

function isPermittedHost(hostname: string, allowPrivateHosts: boolean): boolean {
  if (hostname.length === 0) {
    return false;
  }
  if (allowPrivateHosts) {
    return true;
  }
  const trimmed = hostname.endsWith('.') ? hostname.slice(0, -1) : hostname;
  if (trimmed.length === 0) {
    return false;
  }
  if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
    const groups = parseIpv6Groups(trimmed.slice(1, -1));
    return groups !== undefined && !isDisallowedIpv6(groups);
  }
  const host = trimmed.toLowerCase();
  if (host === 'localhost' || host.endsWith('.localhost')) {
    return false;
  }
  if (host.endsWith('.local') || host.endsWith('.internal') || host.endsWith('.home.arpa')) {
    return false;
  }
  const address = parseIpv4Host(host);
  if (address !== undefined) {
    return !isDisallowedIpv4(address);
  }
  return true;
}

function isDisallowedIpv4(address: number): boolean {
  const octet1 = Math.floor(address / 16_777_216) % 256;
  const octet2 = Math.floor(address / 65_536) % 256;
  return (
    address === 0 || // 0.0.0.0 unspecified
    address === 4_294_967_295 || // 255.255.255.255 broadcast
    octet1 === 127 || // 127.0.0.0/8 loopback
    octet1 === 10 || // 10.0.0.0/8 private
    (octet1 === 172 && octet2 >= 16 && octet2 <= 31) || // 172.16.0.0/12 private
    (octet1 === 192 && octet2 === 168) || // 192.168.0.0/16 private
    (octet1 === 169 && octet2 === 254) || // 169.254.0.0/16 link-local
    (octet1 === 100 && octet2 >= 64 && octet2 <= 127) // 100.64.0.0/10 CGNAT
  );
}

function isDisallowedIpv6(groups: readonly number[]): boolean {
  const group = (index: number): number => groups[index] ?? 0;
  if (groups.every((piece) => piece === 0)) {
    return true; // :: unspecified
  }
  if (groups.slice(0, 7).every((piece) => piece === 0) && group(7) === 1) {
    return true; // ::1 loopback
  }
  if ((group(0) & 0xff_c0) === 0xfe_80) {
    return true; // fe80::/10 link-local
  }
  if ((group(0) & 0xfe_00) === 0xfc_00) {
    return true; // fc00::/7 unique-local
  }
  if (
    groups.slice(0, 5).every((piece) => piece === 0) &&
    (group(5) === 0xff_ff || group(5) === 0)
  ) {
    // ::ffff:0:0/96 IPv4-mapped and the deprecated ::/96 IPv4-compatible
    // block classify as their embedded IPv4 address.
    return isDisallowedIpv4(group(6) * 65_536 + group(7));
  }
  return false;
}

/**
 * Interpret a hostname the way the WHATWG IPv4 host parser does: up to four
 * dot-separated numbers in decimal, octal (leading `0`), or hexadecimal
 * (leading `0x`), where the final number may span the remaining octets.
 * Returns the 32-bit address, or `undefined` when the host is not an IPv4
 * candidate and must be treated as a name.
 */
function parseIpv4Host(host: string): number | undefined {
  if (!/^[0-9A-Fa-fXx.]+$/u.test(host)) {
    return undefined;
  }
  const parts = host.split('.');
  if (parts.length > 4) {
    return undefined;
  }
  const numbers: number[] = [];
  for (const part of parts) {
    const value = parseIpv4Number(part);
    if (value === undefined) {
      return undefined;
    }
    numbers.push(value);
  }
  const last = numbers[numbers.length - 1];
  if (last === undefined) {
    return undefined;
  }
  const prefix = numbers.slice(0, -1);
  if (prefix.some((octet) => octet > 255) || last > 256 ** (4 - prefix.length) - 1) {
    return undefined;
  }
  let address = last;
  for (let index = 0; index < prefix.length; index += 1) {
    address += (prefix[index] ?? 0) * 256 ** (3 - index);
  }
  return address;
}

function parseIpv4Number(part: string): number | undefined {
  if (part.length === 0) {
    return undefined;
  }
  let digits = part;
  let radix = 10;
  if (digits.length >= 2 && (digits.startsWith('0x') || digits.startsWith('0X'))) {
    digits = digits.slice(2);
    radix = 16;
    if (digits.length === 0) {
      return 0;
    }
  } else if (digits.length >= 2 && digits.startsWith('0')) {
    digits = digits.slice(1);
    radix = 8;
  }
  const pattern = radix === 16 ? /^[0-9A-Fa-f]+$/u : radix === 8 ? /^[0-7]+$/u : /^[0-9]+$/u;
  if (!pattern.test(digits)) {
    return undefined;
  }
  const value = Number.parseInt(digits, radix);
  return value > 4_294_967_295 ? undefined : value;
}

/**
 * Parse a bracket-stripped IPv6 literal into its eight 16-bit groups,
 * expanding one `::` compression and accepting a trailing dotted-quad
 * (IPv4-in-IPv6) suffix. Returns `undefined` for anything else so callers
 * fail closed on hosts this parser cannot classify.
 */
function parseIpv6Groups(literal: string): number[] | undefined {
  if (literal.length === 0 || literal.includes('%')) {
    return undefined;
  }
  const marker = literal.indexOf('::');
  if (marker === -1) {
    const pieces = parseIpv6Pieces(literal, true);
    return pieces?.length === 8 ? pieces : undefined;
  }
  if (literal.includes('::', marker + 1)) {
    return undefined;
  }
  const head = parseIpv6Pieces(literal.slice(0, marker), false);
  const tail = parseIpv6Pieces(literal.slice(marker + 2), true);
  if (head === undefined || tail === undefined) {
    return undefined;
  }
  const missing = 8 - head.length - tail.length;
  if (missing < 1) {
    return undefined;
  }
  const zeros: number[] = [];
  for (let index = 0; index < missing; index += 1) {
    zeros.push(0);
  }
  return [...head, ...zeros, ...tail];
}

function parseIpv6Pieces(text: string, allowIpv4Suffix: boolean): number[] | undefined {
  if (text.length === 0) {
    return [];
  }
  const parts = text.split(':');
  const pieces: number[] = [];
  for (let index = 0; index < parts.length; index += 1) {
    const part = parts[index];
    if (part === undefined || part.length === 0) {
      return undefined;
    }
    if (allowIpv4Suffix && index === parts.length - 1 && part.includes('.')) {
      const embedded = parseDottedQuad(part);
      if (embedded === undefined) {
        return undefined;
      }
      pieces.push(Math.floor(embedded / 65_536), embedded % 65_536);
      continue;
    }
    if (!/^[0-9A-Fa-f]{1,4}$/u.test(part)) {
      return undefined;
    }
    pieces.push(Number.parseInt(part, 16));
  }
  return pieces;
}

function parseDottedQuad(text: string): number | undefined {
  const parts = text.split('.');
  if (parts.length !== 4) {
    return undefined;
  }
  let address = 0;
  for (const part of parts) {
    if (!/^(?:0|[1-9][0-9]{0,2})$/u.test(part)) {
      return undefined;
    }
    const octet = Number(part);
    if (octet > 255) {
      return undefined;
    }
    address = address * 256 + octet;
  }
  return address;
}
