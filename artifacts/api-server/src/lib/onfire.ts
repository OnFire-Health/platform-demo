import { eq } from "drizzle-orm";
import { db, connectionsTable, type Connection } from "@workspace/db";
import { getConfig } from "./config";
import {
  decodeJwtPayload,
  deepFindByKey,
  deepFindString,
} from "./jwt";
import { logger } from "./logger";

export interface TokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
  scope?: string;
}

function basicAuthHeader(): string {
  const { clientId, clientSecret } = getConfig();
  return "Basic " + Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
}

function tokenUrl(): string {
  const { projectDomain, projectId } = getConfig();
  return `${projectDomain}/v1/public/${projectId}/oauth2/token`;
}

async function postToken(params: Record<string, string>): Promise<TokenResponse> {
  const res = await fetch(tokenUrl(), {
    method: "POST",
    headers: {
      Authorization: basicAuthHeader(),
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body: new URLSearchParams(params).toString(),
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`Token endpoint ${res.status}: ${text.slice(0, 500)}`);
  }
  return JSON.parse(text) as TokenResponse;
}

export function exchangeCode(code: string): Promise<TokenResponse> {
  const { redirectUri } = getConfig();
  return postToken({
    grant_type: "authorization_code",
    code,
    redirect_uri: redirectUri,
  });
}

export function refreshAccessToken(refreshToken: string): Promise<TokenResponse> {
  return postToken({
    grant_type: "refresh_token",
    refresh_token: refreshToken,
  });
}

/** Best-effort token revocation. Tolerates upstream failure. */
export async function revokeToken(token: string): Promise<void> {
  const { projectDomain, projectId } = getConfig();
  try {
    await fetch(`${projectDomain}/v1/public/${projectId}/oauth2/revoke`, {
      method: "POST",
      headers: {
        Authorization: basicAuthHeader(),
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({ token }).toString(),
    });
  } catch (err) {
    logger.warn({ err }, "OnFire token revoke failed (continuing)");
  }
}

function expiresAtFrom(expiresIn?: number): Date | null {
  if (!expiresIn || Number.isNaN(expiresIn)) return null;
  return new Date(Date.now() + expiresIn * 1000);
}

function isPartnerPublicId(s: string): boolean {
  return /^prt_/.test(s);
}

/**
 * Resolve the practitioner's opaque OnFire partner_public_id (prt_…) — the
 * routing key for webhooks. Tries the token claims first, then a partner-info
 * endpoint, then falls back to the org id.
 */
export async function resolvePartnerPublicId(
  accessToken: string,
  orgId: string | null,
): Promise<string> {
  const payload = decodeJwtPayload(accessToken);
  const fromClaim =
    deepFindByKey(payload, ["partner_public_id"]) ??
    deepFindString(payload, isPartnerPublicId);
  if (fromClaim) return fromClaim;

  const { apiBase, partnerInfoPath } = getConfig();
  if (apiBase && partnerInfoPath) {
    try {
      const res = await fetch(`${apiBase}${partnerInfoPath}`, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: "application/json",
        },
      });
      if (res.ok) {
        const data = await res.json();
        const found =
          deepFindByKey(data, ["partner_public_id"]) ??
          deepFindString(data, isPartnerPublicId);
        if (found) return found;
      } else {
        logger.warn(
          { status: res.status, path: partnerInfoPath },
          "Partner-info lookup returned non-OK",
        );
      }
    } catch (err) {
      logger.warn({ err }, "Partner-info lookup failed");
    }
  }

  if (orgId) {
    logger.warn(
      { orgId },
      "Could not resolve partner_public_id from token claims or partner-info; " +
        "falling back to org id. Invoice webhooks routed by partner_public_id " +
        "may not match this connection.",
    );
    return orgId;
  }
  throw new Error("Unable to resolve partner_public_id for connection");
}

export interface OnFireResult {
  ok: boolean;
  status: number;
  data: unknown;
}

/**
 * Make an authenticated OnFire request for a specific connection, injecting that
 * connection's bearer token and lazily refreshing on a 401.
 */
export async function onfireRequest(
  connectionId: string,
  path: string,
  init: RequestInit = {},
): Promise<OnFireResult> {
  const rows = await db
    .select()
    .from(connectionsTable)
    .where(eq(connectionsTable.id, connectionId))
    .limit(1);
  const connection = rows[0];
  if (!connection) throw new Error("connection_not_found");
  if (connection.status !== "active") throw new Error("connection_revoked");

  let accessToken = connection.accessToken;
  let result = await rawOnfire(path, accessToken, init);

  if (result.status === 401 && connection.refreshToken) {
    logger.info({ connectionId }, "Refreshing OnFire token after 401");
    const refreshed = await refreshAccessToken(connection.refreshToken);
    accessToken = refreshed.access_token;
    await db
      .update(connectionsTable)
      .set({
        accessToken: refreshed.access_token,
        refreshToken: refreshed.refresh_token ?? connection.refreshToken,
        expiresAt: expiresAtFrom(refreshed.expires_in),
        scope: refreshed.scope ?? connection.scope,
      })
      .where(eq(connectionsTable.id, connectionId));
    result = await rawOnfire(path, accessToken, init);
  }

  return result;
}

async function rawOnfire(
  path: string,
  accessToken: string,
  init: RequestInit,
): Promise<OnFireResult> {
  const { apiBase } = getConfig();
  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${accessToken}`);
  headers.set("Accept", "application/json");
  if (init.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  const res = await fetch(`${apiBase}${path}`, { ...init, headers });
  const text = await res.text();
  let data: unknown = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
  }
  return { ok: res.ok, status: res.status, data };
}

function asArray(data: unknown): unknown[] {
  if (Array.isArray(data)) return data;
  if (data && typeof data === "object") {
    const record = data as Record<string, unknown>;
    for (const key of ["results", "data", "rate_cards", "items"]) {
      if (Array.isArray(record[key])) return record[key] as unknown[];
    }
  }
  return [];
}

function str(value: unknown): string | null {
  if (typeof value === "string") return value;
  if (typeof value === "number") return String(value);
  return null;
}

export interface MappedRateCard {
  refId: string;
  productName: string;
  company: string;
  type: string;
  duration: string | null;
  fullPrice: string | null;
  installmentsPrice: string | null;
  fullPriceOnly: boolean;
  payoutPlan: string | null;
  subTitle: string | null;
  details: string | null;
  active: boolean;
}

// Maps onfire-core PartnerRateCardResponse (snake_case) -> the camelCase RateCard the
// client expects. Prices are dollars; onfire sends no currency (defaults USD at invoice).
export function mapRateCards(data: unknown): MappedRateCard[] {
  return asArray(data)
    .map((raw): MappedRateCard | null => {
      if (!raw || typeof raw !== "object") return null;
      const r = raw as Record<string, unknown>;
      const refId =
        str(r["ref_id"]) ?? str(r["rate_card_ref_id"]) ?? str(r["id"]);
      if (!refId) return null;
      const active = r["active"] ?? r["is_active"];
      return {
        refId,
        productName: str(r["product_name"]) ?? str(r["name"]) ?? refId,
        company: str(r["company"]) ?? "",
        type: str(r["type"]) ?? "",
        duration: str(r["duration"]),
        fullPrice: str(r["full_price"]) ?? str(r["amount"]),
        installmentsPrice: str(r["installments_price"]),
        fullPriceOnly: Boolean(r["full_price_only"]),
        payoutPlan: str(r["payout_plan"]),
        subTitle: str(r["sub_title"]),
        details: str(r["details"]) ?? str(r["item_description"]),
        active: active === undefined ? true : Boolean(active),
      };
    })
    .filter((c): c is MappedRateCard => c !== null);
}

export interface MappedInvoice {
  invoicePublicId: string | null;
  status: string | null;
  amount: string | null;
  currency: string | null;
  externalInvoiceRef: string | null;
}

export function mapInvoice(data: unknown): MappedInvoice {
  const source =
    data && typeof data === "object" && "invoice" in (data as object)
      ? (data as Record<string, unknown>)["invoice"]
      : data;
  const r = (source ?? {}) as Record<string, unknown>;
  return {
    invoicePublicId: str(r["invoice_public_id"]) ?? str(r["public_id"]) ?? str(r["id"]),
    status: str(r["status"]),
    amount: str(r["amount"]) ?? str(r["total"]),
    currency: str(r["currency"]),
    externalInvoiceRef: str(r["external_invoice_ref"]),
  };
}

export function connectionExpiresAt(t: TokenResponse): Date | null {
  return expiresAtFrom(t.expires_in);
}

export type { Connection };
