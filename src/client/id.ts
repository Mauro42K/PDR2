/**
 * Generate an RFC 4122 UUID v4 for local project records.
 *
 * randomUUID() is restricted to secure contexts in some browsers. PDR is also
 * opened over HTTP on a private LAN address, so use getRandomValues(), which is
 * available there, and retain a non-secret fallback for older WebViews.
 */
export function createId(): string {
  const bytes = new Uint8Array(16);
  if (globalThis.crypto?.getRandomValues) {
    globalThis.crypto.getRandomValues(bytes);
  } else {
    // These identifiers are record keys, not credentials or security tokens.
    for (let index = 0; index < bytes.length; index++) bytes[index] = Math.floor(Math.random() * 256);
  }

  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
