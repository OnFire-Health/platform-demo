import crypto from "node:crypto";
import { Router, type IRouter } from "express";
import { and, desc, eq } from "drizzle-orm";
import {
  db,
  connectionsTable,
  oauthStatesTable,
  invoicesTable,
  type Connection,
} from "@workspace/db";
import { CreateAuthorizeUrlBody, CreateInvoiceBody } from "@workspace/api-zod";
import { getConfig } from "../lib/config";
import { requireAuth } from "../middleware/auth";
import {
  onfireRequest,
  revokeToken,
  mapRateCards,
  mapInvoice,
  fetchInvoices,
} from "../lib/onfire";

const router: IRouter = Router();

function serializeConnection(c: Connection) {
  return {
    id: c.id,
    partnerPublicId: c.partnerPublicId,
    displayName: c.displayName,
    orgId: c.orgId,
    scope: c.scope,
    status: c.status,
    connectedAt: c.connectedAt,
    expiresAt: c.expiresAt,
  };
}

async function loadConnection(id: string): Promise<Connection | undefined> {
  const rows = await db
    .select()
    .from(connectionsTable)
    .where(eq(connectionsTable.id, id))
    .limit(1);
  return rows[0];
}

router.get("/connections", requireAuth, async (_req, res) => {
  const rows = await db
    .select()
    .from(connectionsTable)
    .orderBy(desc(connectionsTable.connectedAt));
  res.json(rows.map(serializeConnection));
});

router.post("/connections/authorize", requireAuth, async (req, res) => {
  const parsed = CreateAuthorizeUrlBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "displayName is required" });
    return;
  }
  const cfg = getConfig();
  if (!cfg.authorizeUrl || !cfg.clientId) {
    res
      .status(400)
      .json({ error: "OnFire is not configured. Set the required env vars first." });
    return;
  }

  const state = crypto.randomBytes(24).toString("hex");
  await db
    .insert(oauthStatesTable)
    .values({ state, displayName: parsed.data.displayName.trim() });

  const url = new URL(cfg.authorizeUrl);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", cfg.clientId);
  url.searchParams.set("redirect_uri", cfg.redirectUri);
  url.searchParams.set("scope", cfg.scopes);
  url.searchParams.set("state", state);

  res.json({ url: url.toString() });
});

router.get("/connections/:id", requireAuth, async (req, res) => {
  const connection = await loadConnection(String(req.params.id));
  if (!connection) {
    res.status(404).json({ error: "Connection not found" });
    return;
  }
  res.json(serializeConnection(connection));
});

router.post("/connections/:id/disconnect", requireAuth, async (req, res) => {
  const connection = await loadConnection(String(req.params.id));
  if (!connection) {
    res.status(404).json({ error: "Connection not found" });
    return;
  }
  if (connection.status === "active") {
    await revokeToken(connection.accessToken);
  }
  const [updated] = await db
    .update(connectionsTable)
    .set({ status: "revoked" })
    .where(eq(connectionsTable.id, connection.id))
    .returning();
  res.json(serializeConnection(updated ?? connection));
});

router.get("/connections/:id/rate-cards", requireAuth, async (req, res) => {
  const connection = await loadConnection(String(req.params.id));
  if (!connection) {
    res.status(404).json({ error: "Connection not found" });
    return;
  }
  try {
    const result = await onfireRequest(
      connection.id,
      "/meta/partner-rate-cards/",
    );
    if (!result.ok) {
      req.log.warn({ status: result.status }, "OnFire rate-cards error");
      res.status(502).json({ error: "Failed to fetch rate cards from OnFire" });
      return;
    }
    res.json(mapRateCards(result.data));
  } catch (err) {
    req.log.error({ err }, "rate-cards request failed");
    res.status(502).json({ error: "Failed to fetch rate cards from OnFire" });
  }
});

router.get("/connections/:id/invoices", requireAuth, async (req, res) => {
  const connection = await loadConnection(String(req.params.id));
  if (!connection) {
    res.status(404).json({ error: "Connection not found" });
    return;
  }
  const rows = await db
    .select()
    .from(invoicesTable)
    .where(eq(invoicesTable.connectionId, connection.id))
    .orderBy(desc(invoicesTable.createdAt));
  res.json(rows);
});

router.post("/connections/:id/invoices", requireAuth, async (req, res) => {
  const connection = await loadConnection(String(req.params.id));
  if (!connection) {
    res.status(404).json({ error: "Connection not found" });
    return;
  }
  if (connection.status !== "active") {
    res.status(400).json({ error: "Connection is revoked" });
    return;
  }
  const parsed = CreateInvoiceBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      error:
        "rateCardRefId, clientEmail, clientName, clientPhone and clientBillingAddress (line1, city, state, postalCode) are required",
    });
    return;
  }
  const input = parsed.data;

  // external_invoice_ref is the OnFire idempotency key. The caller may supply a
  // stable value so a re-POST is idempotent; otherwise we generate one.
  const externalInvoiceRef =
    input.externalInvoiceRef?.trim() || `pd_${crypto.randomBytes(12).toString("hex")}`;

  // Claim the (connection_id, external_invoice_ref) pair locally BEFORE calling
  // OnFire. The unique index makes this the idempotency gate: a re-POST with the
  // same ref conflicts, so we return the existing invoice and never call OnFire
  // (or create a duplicate) twice.
  const claimed = await db
    .insert(invoicesTable)
    .values({
      connectionId: connection.id,
      externalInvoiceRef,
      status: "pending",
      clientEmail: input.clientEmail,
      rateCardRefId: input.rateCardRefId,
    })
    .onConflictDoNothing({
      target: [invoicesTable.connectionId, invoicesTable.externalInvoiceRef],
    })
    .returning();

  if (claimed.length === 0) {
    const existingRows = await db
      .select()
      .from(invoicesTable)
      .where(
        and(
          eq(invoicesTable.connectionId, connection.id),
          eq(invoicesTable.externalInvoiceRef, externalInvoiceRef),
        ),
      )
      .limit(1);
    req.log.info({ externalInvoiceRef }, "Idempotent invoice re-POST");
    res.status(200).json(existingRows[0]);
    return;
  }

  const claimedRow = claimed[0]!;

  // Map to the OnFire contract (PartnerInvoiceCreate, extra=forbid): ref_id (not
  // rate_card_ref_id), single client_name, required phone + structured billing address
  // with snake_case postal_code.
  const addr = input.clientBillingAddress;
  const payload: Record<string, unknown> = {
    ref_id: input.rateCardRefId,
    client_email: input.clientEmail,
    client_name: input.clientName,
    client_phone: input.clientPhone,
    client_billing_address: {
      line1: addr.line1,
      ...(addr.line2 ? { line2: addr.line2 } : {}),
      city: addr.city,
      state: addr.state,
      postal_code: addr.postalCode,
      ...(addr.country ? { country: addr.country } : {}),
    },
    external_invoice_ref: externalInvoiceRef,
  };
  if (input.externalClientRef)
    payload["external_client_ref"] = input.externalClientRef;

  try {
    const result = await onfireRequest(connection.id, "/core/partner/invoices/", {
      method: "POST",
      body: JSON.stringify(payload),
    });
    if (!result.ok) {
      // Release the claim so the operator can retry cleanly.
      await db
        .delete(invoicesTable)
        .where(eq(invoicesTable.id, claimedRow.id));
      req.log.warn({ status: result.status, data: result.data }, "OnFire invoice error");
      res.status(502).json({ error: "Failed to create invoice in OnFire" });
      return;
    }
    const mapped = mapInvoice(result.data);
    const [row] = await db
      .update(invoicesTable)
      .set({
        invoicePublicId: mapped.invoicePublicId,
        status: mapped.status ?? "open",
        amount: mapped.amount,
        currency: mapped.currency,
      })
      .where(eq(invoicesTable.id, claimedRow.id))
      .returning();
    res.status(201).json(row ?? claimedRow);
  } catch (err) {
    await db.delete(invoicesTable).where(eq(invoicesTable.id, claimedRow.id));
    req.log.error({ err }, "invoice creation failed");
    res.status(502).json({ error: "Failed to create invoice in OnFire" });
  }
});

// Reconcile the local invoice mirror against OnFire (the source of truth). Webhook
// delivery is at-least-once and can be missed; this pulls the current invoice set from
// OnFire and upserts each row so the mirror re-converges. Matches on the
// (connection_id, external_invoice_ref) unique key — the same key the create + webhook
// paths write.
router.post("/connections/:id/invoices/reconcile", requireAuth, async (req, res) => {
  const connection = await loadConnection(String(req.params.id));
  if (!connection) {
    res.status(404).json({ error: "Connection not found" });
    return;
  }
  if (connection.status !== "active") {
    res.status(400).json({ error: "Connection is revoked" });
    return;
  }
  try {
    const result = await fetchInvoices(connection.id);
    if (!result.ok) {
      req.log.warn({ status: result.status }, "OnFire list-invoices error");
      res.status(502).json({ error: "Failed to fetch invoices from OnFire" });
      return;
    }
    let reconciled = 0;
    for (const inv of result.invoices) {
      // external_invoice_ref is the join key to our mirror; skip anything without it.
      if (!inv.externalInvoiceRef) continue;
      await db
        .insert(invoicesTable)
        .values({
          connectionId: connection.id,
          externalInvoiceRef: inv.externalInvoiceRef,
          invoicePublicId: inv.invoicePublicId,
          status: inv.status,
          amount: inv.amount,
          currency: inv.currency,
          clientEmail: inv.clientEmail,
          rateCardRefId: inv.rateCardRefId,
        })
        .onConflictDoUpdate({
          target: [invoicesTable.connectionId, invoicesTable.externalInvoiceRef],
          // OnFire is the source of truth — overwrite every mirrored field so a locally
          // edited row is corrected, not just the payment-lifecycle fields.
          set: {
            invoicePublicId: inv.invoicePublicId,
            status: inv.status,
            amount: inv.amount,
            currency: inv.currency,
            clientEmail: inv.clientEmail,
            rateCardRefId: inv.rateCardRefId,
          },
        });
      reconciled += 1;
    }
    const rows = await db
      .select()
      .from(invoicesTable)
      .where(eq(invoicesTable.connectionId, connection.id))
      .orderBy(desc(invoicesTable.createdAt));
    res.json({ reconciled, invoices: rows });
  } catch (err) {
    req.log.error({ err }, "invoice reconcile failed");
    res.status(502).json({ error: "Failed to reconcile invoices from OnFire" });
  }
});

export default router;
