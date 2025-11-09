// Lightweight in-memory token blacklist to support logout flows.
// Keeps a map of revoked tokens until their JWT expiration to prevent reuse.
const revokedTokens = new Map();

function cleanup(now = Date.now()) {
  for (const [token, expiresAt] of revokedTokens.entries()) {
    if (!expiresAt || expiresAt <= now) {
      revokedTokens.delete(token);
    }
  }
}

export function revokeToken(token, expSeconds) {
  if (!token) return;
  const expiresAt = typeof expSeconds === "number" ? expSeconds * 1000 : undefined;
  revokedTokens.set(token, expiresAt || Date.now() + 1000 * 60 * 60 * 24 * 7);
}

export function isTokenRevoked(token) {
  if (!token) return false;
  cleanup();
  return revokedTokens.has(token);
}

export function clearRevokedTokens() {
  revokedTokens.clear();
}
