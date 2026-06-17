import crypto from "node:crypto";
import { Router, type IRouter } from "express";
import { desc, eq } from "drizzle-orm";
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
    res.status(400).json({ error: "rateCardRefId and clientEmail are required" });
    return;
  }
  const input = parsed.data;

  // Our id and the OnFire idempotency key. Stored before the upstream call so a
  // retry with the same row reuses the same external_invoice_ref.
  const externalInvoiceRef = `pd_${crypto.randomBytes(12).toString("hex")}`;

  const payload: Record<string, unknown> = {
    rate_card_ref_id: input.rateCardRefId,
    client_email: input.clientEmail,
    external_invoice_ref: externalInvoiceRef,
  };
  if (input.clientFirstName) payload["client_first_name"] = input.clientFirstName;
  if (input.clientLastName) payload["client_last_name"] = input.clientLastName;
  if (input.clientPhone) payload["client_phone"] = input.clientPhone;
  if (input.clientBillingAddress)
    payload["client_billing_address"] = input.clientBillingAddress;
  if (input.externalClientRef)
    payload["external_client_ref"] = input.externalClientRef;

  try {
    const result = await onfireRequest(connection.id, "/core/partner/invoices/", {
      method: "POST",
      body: JSON.stringify(payload),
    });
    if (!result.ok) {
      req.log.warn({ status: result.status, data: result.data }, "OnFire invoice error");
      res.status(502).json({ error: "Failed to create invoice in OnFire" });
      return;
    }
    const mapped = mapInvoice(result.data);
    const [row] = await db
      .insert(invoicesTable)
      .values({
        connectionId: connection.id,
        externalInvoiceRef,
        invoicePublicId: mapped.invoicePublicId,
        status: mapped.status ?? "open",
        amount: mapped.amount,
        currency: mapped.currency,
        clientEmail: input.clientEmail,
        rateCardRefId: input.rateCardRefId,
      })
      .returning();
    res.status(201).json(row);
  } catch (err) {
    req.log.error({ err }, "invoice creation failed");
    res.status(502).json({ error: "Failed to create invoice in OnFire" });
  }
});

export default router;
