const FNV_OFFSET_BASIS = 0xcbf29ce484222325n;
const FNV_PRIME = 0x100000001b3n;

/**
 * FNV-1a 64-bit digest as 16 lowercase hex digits. Studio uses it only to derive deterministic
 * equality keys inside a host's trusted catalog (ADR 0038); it is not an integrity or security
 * primitive and is deliberately not part of the public package surface.
 */
export function fnv1a64Hex(bytes: Uint8Array): string {
  let hash = FNV_OFFSET_BASIS;
  for (const byte of bytes) {
    hash = BigInt.asUintN(64, (hash ^ BigInt(byte)) * FNV_PRIME);
  }
  return hash.toString(16).padStart(16, '0');
}
