/**
 * OnFire / platform configuration sourced from environment variables.
 *
 * The single Connected App's client_id / client_secret are shared across every
 * connected practitioner — that is the whole platform model.
 */

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, "");
}

function appBaseUrl(): string {
  const domains = process.env["REPLIT_DOMAINS"];
  if (domains) {
    const first = domains.split(",")[0]?.trim();
    if (first) return `https://${first}`;
  }
  const dev = process.env["REPLIT_DEV_DOMAIN"];
  if (dev) return `https://${dev}`;
  return "";
}

export interface OnFireConfig {
  projectDomain: string;
  projectId: string;
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  scopes: string;
  authorizeUrl: string;
  apiBase: string;
  webhookSigningSecret: string;
  partnerInfoPath: string;
}

export function getConfig(): OnFireConfig {
  const base = appBaseUrl();
  return {
    projectDomain: trimTrailingSlash(process.env["ONFIRE_PROJECT_DOMAIN"] ?? ""),
    projectId: process.env["ONFIRE_PROJECT_ID"] ?? "",
    clientId: process.env["ONFIRE_OAUTH_CLIENT_ID"] ?? "",
    clientSecret: process.env["ONFIRE_OAUTH_CLIENT_SECRET"] ?? "",
    redirectUri:
      process.env["ONFIRE_REDIRECT_URI"] ||
      (base ? `${base}/api/oauth/callback` : ""),
    scopes: process.env["ONFIRE_OAUTH_SCOPES"] || "payment-connection offline_access",
    authorizeUrl: process.env["ONFIRE_AUTHORIZE_URL"] ?? "",
    apiBase: trimTrailingSlash(process.env["ONFIRE_API_BASE"] ?? ""),
    webhookSigningSecret: process.env["ONFIRE_WEBHOOK_SIGNING_SECRET"] ?? "",
    // OnFire's OAuth "current partner" endpoint — returns partner_public_id (the
    // webhook routing key). apiBase already includes /api/v1.
    partnerInfoPath: process.env["ONFIRE_PARTNER_INFO_PATH"] || "/meta/partners/me",
  };
}

/** The public webhook URL OnFire ops should register for this platform. */
export function webhookUrl(): string {
  const base = appBaseUrl();
  return base ? `${base}/api/webhooks/onfire` : "/api/webhooks/onfire";
}

/** Names of required env vars that are not currently set. */
export function missingConfig(): string[] {
  const missing: string[] = [];
  const checks: Array<[string, string]> = [
    ["ONFIRE_PROJECT_DOMAIN", process.env["ONFIRE_PROJECT_DOMAIN"] ?? ""],
    ["ONFIRE_PROJECT_ID", process.env["ONFIRE_PROJECT_ID"] ?? ""],
    ["ONFIRE_OAUTH_CLIENT_ID", process.env["ONFIRE_OAUTH_CLIENT_ID"] ?? ""],
    ["ONFIRE_OAUTH_CLIENT_SECRET", process.env["ONFIRE_OAUTH_CLIENT_SECRET"] ?? ""],
    ["ONFIRE_AUTHORIZE_URL", process.env["ONFIRE_AUTHORIZE_URL"] ?? ""],
    ["ONFIRE_API_BASE", process.env["ONFIRE_API_BASE"] ?? ""],
    ["ONFIRE_WEBHOOK_SIGNING_SECRET", process.env["ONFIRE_WEBHOOK_SIGNING_SECRET"] ?? ""],
  ];
  for (const [name, value] of checks) {
    if (!value) missing.push(name);
  }
  return missing;
}

export function isConfigured(): boolean {
  return missingConfig().length === 0;
}

export const operatorPassword = (): string =>
  process.env["PLATFORM_OPERATOR_PASSWORD"] || "demo";

export const sessionSecret = (): string =>
  process.env["SESSION_SECRET"] ||
  process.env["ONFIRE_SESSION_SECRET"] ||
  "platform-demo-dev-secret";
