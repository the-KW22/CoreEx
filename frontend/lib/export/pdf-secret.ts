import { createHash, timingSafeEqual } from "node:crypto";

// Whether the header is the shared secret. Both sides are hashed first, so the comparison takes the same time whatever
// their lengths, and nothing is written anywhere. An unset secret, or an empty header, matches nothing.
export function sharedSecretMatches(given: string | null, expected: string | undefined): boolean {
  if (!given || !expected) return false;
  const a = createHash("sha256").update(given).digest();
  const b = createHash("sha256").update(expected).digest();
  return timingSafeEqual(a, b);
}
