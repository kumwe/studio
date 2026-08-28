/** Maximum serialized bearer/custom-header credential lifetime: fifteen minutes. */
export const STUDIO_TOKEN_MAXIMUM_LIFETIME_MILLISECONDS: number = 15 * 60 * 1000;

const rfc3339Instant =
  /^(\d{4})-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])T(?:[01]\d|2[0-3]):[0-5]\d:(?:[0-5]\d|60)(?:\.(\d{1,9}))?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/u;

interface ParsedTokenInstant {
  /** Whole Unix milliseconds, including the first three fractional digits. */
  readonly milliseconds: number;
  /** Exact nanoseconds after that millisecond, from zero through 999,999. */
  readonly nanosecondRemainder: number;
}

export interface StudioTokenLifetime {
  readonly expiresAt: unknown;
  readonly issuedAt: unknown;
}

/**
 * Validate one browser-visible token's closed lifetime interval. The exact
 * clock rule is `issuedAt <= now < expiresAt`; no implicit grace period turns
 * a future or expired serialized credential into a usable one.
 */
export function isStudioTokenLifetimeValid(
  lifetime: StudioTokenLifetime,
  currentTimeMilliseconds: number,
): boolean {
  if (!Number.isFinite(currentTimeMilliseconds)) {
    return false;
  }
  const issuedAt = parseRfc3339Instant(lifetime.issuedAt);
  const expiresAt = parseRfc3339Instant(lifetime.expiresAt);
  return (
    issuedAt !== undefined &&
    expiresAt !== undefined &&
    compareWithMilliseconds(issuedAt, currentTimeMilliseconds) <= 0 &&
    compareWithMilliseconds(expiresAt, currentTimeMilliseconds) > 0 &&
    isPositiveBoundedLifetime(issuedAt, expiresAt)
  );
}

/** Assert metadata and duration, optionally including current usability. */
export function assertStudioTokenLifetime(
  lifetime: StudioTokenLifetime,
  currentTimeMilliseconds?: number,
): void {
  const issuedAt = parseRfc3339Instant(lifetime.issuedAt);
  const expiresAt = parseRfc3339Instant(lifetime.expiresAt);
  if (issuedAt === undefined || expiresAt === undefined) {
    throw new TypeError('issuedAt and expiresAt must be RFC 3339 date-times.');
  }
  if (!isPositiveBoundedLifetime(issuedAt, expiresAt)) {
    throw authenticationLifetimeError();
  }
  if (currentTimeMilliseconds === undefined) {
    return;
  }
  if (!Number.isFinite(currentTimeMilliseconds)) {
    throw new TypeError('The configured transport clock returned an invalid time.');
  }
  if (
    compareWithMilliseconds(issuedAt, currentTimeMilliseconds) > 0 ||
    compareWithMilliseconds(expiresAt, currentTimeMilliseconds) <= 0
  ) {
    throw authenticationLifetimeError();
  }
}

export function isAuthenticationLifetimeFailure(reason: unknown): boolean {
  return (
    typeof reason === 'object' &&
    reason !== null &&
    'name' in reason &&
    reason.name === 'AuthenticationLifetimeError'
  );
}

function parseRfc3339Instant(value: unknown): ParsedTokenInstant | undefined {
  if (typeof value !== 'string' || value.length > 40) {
    return undefined;
  }
  const match = rfc3339Instant.exec(value);
  if (match === null) return undefined;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (day > daysInMonth(year, month)) return undefined;
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) return undefined;
  const fractionNanoseconds = Number((match[4] ?? '').padEnd(9, '0'));
  return {
    milliseconds: parsed,
    nanosecondRemainder: fractionNanoseconds % 1_000_000,
  };
}

function compareWithMilliseconds(instant: ParsedTokenInstant, milliseconds: number): number {
  return instant.milliseconds === milliseconds
    ? Math.sign(instant.nanosecondRemainder)
    : Math.sign(instant.milliseconds - milliseconds);
}

function isPositiveBoundedLifetime(
  issuedAt: ParsedTokenInstant,
  expiresAt: ParsedTokenInstant,
): boolean {
  const wholeMilliseconds = expiresAt.milliseconds - issuedAt.milliseconds;
  const remainder = expiresAt.nanosecondRemainder - issuedAt.nanosecondRemainder;
  const positive = wholeMilliseconds > 0 || (wholeMilliseconds === 0 && remainder > 0);
  const bounded =
    wholeMilliseconds < STUDIO_TOKEN_MAXIMUM_LIFETIME_MILLISECONDS ||
    (wholeMilliseconds === STUDIO_TOKEN_MAXIMUM_LIFETIME_MILLISECONDS && remainder <= 0);
  return positive && bounded;
}

function daysInMonth(year: number, month: number): number {
  if (month === 2) {
    return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0) ? 29 : 28;
  }
  return month === 4 || month === 6 || month === 9 || month === 11 ? 30 : 31;
}

function authenticationLifetimeError(): Error {
  const error = new Error('The configured HTTP authentication lifetime is not currently valid.');
  error.name = 'AuthenticationLifetimeError';
  return error;
}
