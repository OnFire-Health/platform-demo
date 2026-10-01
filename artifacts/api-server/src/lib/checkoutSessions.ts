import { and, eq, sql } from "drizzle-orm";
import { db, checkoutSessionsTable, type CheckoutSession, type InsertCheckoutSession } from "@workspace/db";
import { appBaseUrl } from "./config";
import { onfireRequest } from "./onfire";

export function checkoutSessionReturnUrls(connectionId: string) {
  const base = appBaseUrl();
  if (!base) throw new Error("App origin is not configured");
  const successUrl = new URL("/checkout-return", base);
  const cancelUrl = new URL("/checkout-cancelled", base);
  successUrl.searchParams.set("connectionId", connectionId);
  cancelUrl.searchParams.set("connectionId", connectionId);
  return { successUrl: successUrl.toString(), cancelUrl: cancelUrl.toString() };
}

export function checkoutSessionRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown> : {};
}

function checkoutSessionString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function checkoutSessionDate(value: unknown): Date | null {
  if (value == null) return null;
  if (typeof value !== "string") throw new Error("Invalid Onfire Checkout Session timestamp");
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) throw new Error("Invalid Onfire Checkout Session timestamp");
  return date;
}

export function checkoutSessionDetail(data: unknown): string {
  const detail = checkoutSessionRecord(data)["detail"];
  if (typeof detail === "string") return detail;
  if (detail !== undefined) return JSON.stringify(detail);
  return typeof data === "string" ? data : "Onfire Checkout Session request failed";
}

export function checkoutSessionCreateBody(checkoutSession: Pick<CheckoutSession,
  "rateCardRefId" | "quantity" | "clientReferenceId" | "successUrl" | "cancelUrl" | "metadata"
>) {
  return {
    items: [{ ref_id: checkoutSession.rateCardRefId, quantity: checkoutSession.quantity }],
    client_reference_id: checkoutSession.clientReferenceId,
    success_url: checkoutSession.successUrl,
    cancel_url: checkoutSession.cancelUrl,
    ...(checkoutSession.metadata === null ? {} : { metadata: checkoutSession.metadata }),
  };
}

// Webhooks intentionally omit URLs/payer_url. Their insert uses our deterministic
// return URLs; an existing row keeps its original create URLs and payer link.
export function mapCheckoutSession(data: unknown, connectionId: string, webhook = false): InsertCheckoutSession {
  const block = checkoutSessionRecord(data);
  const firstItem = checkoutSessionRecord(Array.isArray(block["items"]) ? block["items"][0] : null);
  const publicId = checkoutSessionString(block["public_id"]);
  const clientReferenceId = checkoutSessionString(block["client_reference_id"]);
  const rateCardRefId = checkoutSessionString(firstItem["ref_id"]);
  const quantity = firstItem["quantity"];
  const status = checkoutSessionString(block["status"]);
  const paymentStatus = checkoutSessionString(block["payment_status"]);
  if (!publicId || !clientReferenceId || !rateCardRefId || !Number.isInteger(quantity) || !status || !paymentStatus) {
    throw new Error("Incomplete Onfire Checkout Session response");
  }
  const fallbackUrls = webhook ? checkoutSessionReturnUrls(connectionId) : null;
  const successUrl = checkoutSessionString(block["success_url"]) ?? fallbackUrls?.successUrl;
  const cancelUrl = checkoutSessionString(block["cancel_url"]) ?? fallbackUrls?.cancelUrl;
  if (!successUrl || !cancelUrl) throw new Error("Missing Onfire Checkout Session return URLs");
  const metadata = block["metadata"];
  if (metadata != null && (typeof metadata !== "object" || Array.isArray(metadata))) {
    throw new Error("Invalid Onfire Checkout Session metadata");
  }
  return {
    connectionId, clientReferenceId, publicId, rateCardRefId, quantity: quantity as number,
    onfireId: checkoutSessionString(block["id"]),
    payerUrl: checkoutSessionString(block["payer_url"]),
    status, paymentStatus,
    // Decimal strings stay strings at every boundary.
    amount: checkoutSessionString(block["amount"]),
    currency: checkoutSessionString(block["currency"]),
    successUrl, cancelUrl,
    metadata: metadata == null ? null : metadata as Record<string, unknown>,
    expiresAt: checkoutSessionDate(block["expires_at"]),
    completedAt: checkoutSessionDate(block["completed_at"]),
  };
}

export function checkoutSessionLifecycleUpdates(mapped: Pick<InsertCheckoutSession, "status" | "paymentStatus" | "completedAt">) {
  // Every upstream snapshot can race with settlement (including retrieve). Merge
  // forward lifecycle transitions atomically rather than resetting terminal state.
  return {
    status: sql`case when ${checkoutSessionsTable.status} = 'complete'
      or (${checkoutSessionsTable.status} in ('expired', 'cancelled') and ${mapped.status} = 'open')
      then ${checkoutSessionsTable.status} else ${mapped.status} end`,
    paymentStatus: sql`case when ${checkoutSessionsTable.paymentStatus} = 'paid' then 'paid'
      when ${checkoutSessionsTable.paymentStatus} = 'processing' and ${mapped.paymentStatus} = 'unpaid'
      then 'processing' else ${mapped.paymentStatus} end`,
    completedAt: sql`coalesce(${mapped.completedAt ?? null}::timestamptz, ${checkoutSessionsTable.completedAt})`,
  };
}

export async function persistCheckoutSession(data: unknown, connectionId: string, httpStatus?: number) {
  const mapped = mapCheckoutSession(data, connectionId);
  const set = {
    onfireId: mapped.onfireId, publicId: mapped.publicId, payerUrl: mapped.payerUrl,
    rateCardRefId: mapped.rateCardRefId, quantity: mapped.quantity,
    clientReferenceId: mapped.clientReferenceId, successUrl: mapped.successUrl, cancelUrl: mapped.cancelUrl,
    ...checkoutSessionLifecycleUpdates(mapped),
    amount: mapped.amount, currency: mapped.currency, metadata: mapped.metadata,
    expiresAt: mapped.expiresAt,
    ...(httpStatus === undefined ? {} : { lastCreateHttpStatus: httpStatus }),
  };
  const [checkoutSession] = await db.insert(checkoutSessionsTable)
    .values({ ...mapped, ...(httpStatus === undefined ? {} : { lastCreateHttpStatus: httpStatus }) })
    .onConflictDoUpdate({
      target: httpStatus === undefined ? checkoutSessionsTable.publicId
        : [checkoutSessionsTable.connectionId, checkoutSessionsTable.clientReferenceId],
      set,
      setWhere: eq(checkoutSessionsTable.connectionId, connectionId),
    }).returning();
  if (!checkoutSession) throw new Error("Checkout Session belongs to a different connection");
  return checkoutSession;
}

export async function createOnfireCheckoutSession(connectionId: string,
  input: Parameters<typeof checkoutSessionCreateBody>[0]) {
  // No local claim/short circuit: Onfire must answer 201 vs 200 vs 409 itself.
  const result = await onfireRequest(connectionId, "/core/partner/checkout-sessions", {
    method: "POST", body: JSON.stringify(checkoutSessionCreateBody(input)),
  });
  if (result.status === 201 || result.status === 200) {
    return {
      httpStatus: result.status,
      checkoutSession: await persistCheckoutSession(result.data, connectionId, result.status),
    };
  }
  let checkoutSession: CheckoutSession | undefined;
  if (result.status === 409) {
    // Only record the diagnostic. Never persist the conflicting request's fields
    // or change the business row's updatedAt.
    [checkoutSession] = await db.update(checkoutSessionsTable)
      .set({ lastCreateHttpStatus: 409, updatedAt: sql`${checkoutSessionsTable.updatedAt}` })
      .where(and(eq(checkoutSessionsTable.connectionId, connectionId),
        eq(checkoutSessionsTable.clientReferenceId, input.clientReferenceId))).returning();
  }
  return { httpStatus: result.status, ...(checkoutSession ? { checkoutSession } : {}),
    error: checkoutSessionDetail(result.data) };
}