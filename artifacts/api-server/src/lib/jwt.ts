/** Decode a JWT payload without verifying its signature (audit-only reads). */
export function decodeJwtPayload(token: string): Record<string, unknown> | null {
  const parts = token.split(".");
  if (parts.length < 2) return null;
  try {
    const json = Buffer.from(parts[1], "base64url").toString("utf8");
    const parsed = JSON.parse(json);
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

/** Read the stytch namespaced organization id from a decoded token payload. */
export function extractOrgId(payload: Record<string, unknown> | null): string | null {
  if (!payload) return null;
  const claim = payload["https://stytch.com/organization"];
  if (claim && typeof claim === "object") {
    const orgId = (claim as Record<string, unknown>)["organization_id"];
    if (typeof orgId === "string" && orgId) return orgId;
  }
  return null;
}

/** Recursively find the first value stored under any of the given key names. */
export function deepFindByKey(value: unknown, keys: string[]): string | null {
  if (value == null) return null;
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = deepFindByKey(item, keys);
      if (found) return found;
    }
    return null;
  }
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    for (const key of keys) {
      const candidate = record[key];
      if (typeof candidate === "string" && candidate) return candidate;
    }
    for (const nested of Object.values(record)) {
      const found = deepFindByKey(nested, keys);
      if (found) return found;
    }
  }
  return null;
}

/** Recursively find the first string value matching a predicate. */
export function deepFindString(
  value: unknown,
  predicate: (s: string) => boolean,
): string | null {
  if (value == null) return null;
  if (typeof value === "string") return predicate(value) ? value : null;
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = deepFindString(item, predicate);
      if (found) return found;
    }
    return null;
  }
  if (typeof value === "object") {
    for (const nested of Object.values(value as Record<string, unknown>)) {
      const found = deepFindString(nested, predicate);
      if (found) return found;
    }
  }
  return null;
}
