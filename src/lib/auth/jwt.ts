/**
 * Minimal, dependency-free JWT *reading* (never verification — the server verifies).
 * Used only to schedule a proactive refresh before the access token expires, so a
 * wrong or unreadable payload must degrade to "unknown", never throw.
 */

function base64UrlDecode(segment: string): string {
  const base64 = segment.replace(/-/g, '+').replace(/_/g, '/');
  const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
  return atob(padded);
}

/** Expiry as epoch seconds, or null when the token isn't a readable JWT with a numeric `exp`. */
export function getJwtExpiry(token: string): number | null {
  const payload = token.split('.')[1];
  if (!payload || typeof atob !== 'function') return null;
  try {
    const { exp } = JSON.parse(base64UrlDecode(payload)) as { exp?: unknown };
    return typeof exp === 'number' && Number.isFinite(exp) ? exp : null;
  } catch {
    return null;
  }
}

/** True when the token expires within `skewSeconds`. Unknown expiry reads as "not expiring" — the 401 path still covers it. */
export function isTokenExpiring(token: string, skewSeconds: number, nowMs = Date.now()): boolean {
  const exp = getJwtExpiry(token);
  if (exp === null) return false;
  return exp * 1000 - nowMs <= skewSeconds * 1000;
}
