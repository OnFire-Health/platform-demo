const ALLOWED_PATHS = ["/checkout-return", "/checkout-cancelled"];

/** Returns a safe local app path (+query) or null. */
export function safeReturnTarget(raw: string | null | undefined): string | null {
  if (!raw || !raw.startsWith("/") || raw.startsWith("//") || raw.includes("\\")) return null;
  if (/[\u0000-\u001f]/.test(raw)) return null;
  let url: URL;
  try {
    url = new URL(raw, "http://local.invalid");
  } catch {
    return null;
  }
  if (url.origin !== "http://local.invalid") return null;
  if (!ALLOWED_PATHS.includes(url.pathname)) return null;
  return `${url.pathname}${url.search}`;
}
