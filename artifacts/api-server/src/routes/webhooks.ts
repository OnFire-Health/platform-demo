import crypto from "node:crypto";
import { Router, type IRouter } from "express";
import { and, desc, eq } from "drizzle-orm";
import {
  db,
  connectionsTable,
  invoicesTable,
  webhookEventsTable,
} from "@workspace/db";
import { getConfig } from "../lib/config";
import { requireAuth } from "../middleware/auth";

const router: IRouter = Router();

// Onfire signs with this header (see onfire-core webhooks/delivery.py). req.get is
// case-insensitive, so the exact casing here doesn't matter — only the name.
const SIGNATURE_HEADER =
  process.env["ONFIRE_WEBHOOK_SIGNATURE_HEADER"] || "X-Onfire-Webhook-Signature";
const TOLERANCE_SECONDS = 60 * 5;

function parseSignatureHeader(header: string): { t?: string; v1?: string } {
  const out: { t?: string; v1?: string } = {};
  for (const part of header.split(",")) {
    const [key, value] = part.split("=");
    if (key === "t") out.t = value?.trim();
    if (key === "v1") out.v1 = value?.trim();
  }
  return out;
}

function timingSafeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

function str(value: unknown): string | null {
  if (typeof value === "string") return value;
  if (typeof value === "number") return String(value);
  return null;
}

// Single public receiver for every practitioner. Raw body parsed upstream in
// app.ts (express.raw) so the HMAC is computed over the exact bytes.
router.post("/webhooks/onfire", async (req, res) => {
  const cfg = getConfig();
  const raw: Buffer = Buffer.isBuffer(req.body) ? req.body : Buffer.from("");
  const rawString = raw.toString("utf8");

  const header = req.get(SIGNATURE_HEADER) ?? "";
  if (!cfg.webhookSigningSecret) {
    req.log.error("Webhook signing secret not configured");
    res.status(500).json({ error: "Webhook not configured" });
    return;
  }
  const { t, v1 } = parseSignatureHeader(header);
  if (!t || !v1) {
    res.status(400).json({ error: "Missing signature" });
    return;
  }

  const timestamp = Number(t);
  if (Number.isNaN(timestamp)) {
    res.status(400).json({ error: "Invalid timestamp" });
    return;
  }
  const ageSeconds = Math.abs(Date.now() / 1000 - timestamp);
  if (ageSeconds > TOLERANCE_SECONDS) {
    res.status(400).json({ error: "Stale timestamp" });
    return;
  }

  const signedPayload = `${t}.${rawString}`;
  const expected = crypto
    .createHmac("sha256", cfg.webhookSigningSecret)
    .update(signedPayload)
    .digest("hex");
  if (!timingSafeEqual(expected, v1)) {
    req.log.warn("Webhook signature mismatch");
    res.status(400).json({ error: "Signature mismatch" });
    return;
  }

  let envelope: Record<string, unknown>;
  try {
    envelope = JSON.parse(rawString) as Record<string, unknown>;
  } catch {
    res.status(400).json({ error: "Invalid JSON" });
    return;
  }

  const envelopeId = str(envelope["id"]);
  if (!envelopeId) {
    res.status(400).json({ error: "Missing envelope id" });
    return;
  }
  const type = str(envelope["type"]);
  const data = (envelope["data"] ?? {}) as Record<string, unknown>;
  const invoice = (data["invoice"] ?? {}) as Record<string, unknown>;

  const partnerPublicId = str(invoice["partner_public_id"]);
  const externalInvoiceRef = str(invoice["external_invoice_ref"]);
  const invoicePublicId = str(invoice["invoice_public_id"]);
  const status = str(invoice["status"]);
  const amount = str(invoice["amount"]);
  const currency = str(invoice["currency"]);

  // Route by partner_public_id — the demonstration of multi-tenant separation.
  let connectionId: string | null = null;
  let connectionDisplayName: string | null = null;
  if (partnerPublicId) {
    const rows = await db
      .select()
      .from(connectionsTable)
      .where(eq(connectionsTable.partnerPublicId, partnerPublicId))
      .limit(1);
    const connection = rows[0];
    if (connection) {
      connectionId = connection.id;
      connectionDisplayName = connection.displayName;
    }
  }
  const routed = connectionId !== null;

  // Dedupe on the envelope id (at-least-once delivery).
  const inserted = await db
    .insert(webhookEventsTable)
    .values({
      envelopeId,
      type,
      partnerPublicId,
      externalInvoiceRef,
      invoicePublicId,
      status,
      amount,
      currency,
      connectionId,
      connectionDisplayName,
      routed,
    })
    .onConflictDoNothing({ target: webhookEventsTable.envelopeId })
    .returning();

  if (inserted.length === 0) {
    req.log.info({ envelopeId }, "Duplicate webhook ignored");
    res.json({ received: true, duplicate: true });
    return;
  }

  // Correlate to the local invoice mirror.
  if (connectionId && externalInvoiceRef) {
    await db
      .update(invoicesTable)
      .set({
        status: status ?? undefined,
        invoicePublicId: invoicePublicId ?? undefined,
        amount: amount ?? undefined,
        currency: currency ?? undefined,
      })
      .where(
        and(
          eq(invoicesTable.connectionId, connectionId),
          eq(invoicesTable.externalInvoiceRef, externalInvoiceRef),
        ),
      );
  }

  res.json({ received: true, routed });
});

router.get("/webhook-events", requireAuth, async (_req, res) => {
  const rows = await db
    .select()
    .from(webhookEventsTable)
    .orderBy(desc(webhookEventsTable.receivedAt))
    .limit(100);
  res.json(rows);
});

export default router;
