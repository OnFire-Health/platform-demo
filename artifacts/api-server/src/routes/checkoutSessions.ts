import crypto from "node:crypto";
import { Router, type IRouter, type Request, type Response } from "express";
import { and, desc, eq } from "drizzle-orm";
import { db, connectionsTable, checkoutSessionsTable } from "@workspace/db";
import {
  ListCheckoutSessionsParams, ListCheckoutSessionsResponse,
  CreateCheckoutSessionBody, CreateCheckoutSessionResponse,
  ReplayCheckoutSessionBody, ReplayCheckoutSessionResponse,
  RetrieveCheckoutSessionBody, RetrieveCheckoutSessionResponse,
} from "@workspace/api-zod";
import { requireAuth } from "../middleware/auth";
import { onfireRequest } from "../lib/onfire";
import {
  checkoutSessionReturnUrls, checkoutSessionDetail, createOnfireCheckoutSession, persistCheckoutSession,
} from "../lib/checkoutSessions";

const router: IRouter = Router();
const localUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function loadActiveConnection(req: Request, res: Response) {
  const params = ListCheckoutSessionsParams.safeParse(req.params);
  if (!params.success || !localUuid.test(params.data.id)) {
    res.status(404).json({ error: "Connection not found" });
    return;
  }
  const [connection] = await db.select().from(connectionsTable)
    .where(eq(connectionsTable.id, params.data.id)).limit(1);
  if (!connection) {
    res.status(404).json({ error: "Connection not found" });
    return;
  }
  if (connection.status !== "active") {
    res.status(400).json({ error: "Connection is revoked" });
    return;
  }
  return connection;
}

router.get("/connections/:id/checkout-sessions", requireAuth, async (req, res): Promise<void> => {
  const connection = await loadActiveConnection(req, res);
  if (!connection) return;
  const checkoutSessions = await db.select().from(checkoutSessionsTable)
    .where(eq(checkoutSessionsTable.connectionId, connection.id))
    .orderBy(desc(checkoutSessionsTable.createdAt));
  res.json(ListCheckoutSessionsResponse.parse(checkoutSessions));
});

router.post("/connections/:id/checkout-sessions", requireAuth, async (req, res): Promise<void> => {
  const connection = await loadActiveConnection(req, res);
  if (!connection) return;
  const parsed = CreateCheckoutSessionBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const input = parsed.data;
  const clientReferenceId = input.clientReferenceId?.trim() || `pd_cs_${crypto.randomBytes(6).toString("hex")}`;
  try {
    const result = await createOnfireCheckoutSession(connection.id, {
      rateCardRefId: input.rateCardRefId, quantity: input.quantity ?? 1, clientReferenceId,
      ...checkoutSessionReturnUrls(connection.id),
      // Always send an object so an omitted metadata input and its replay have
      // the same canonical wire body, even if Onfire defaults metadata to {}.
      metadata: input.metadata ?? {},
    });
    res.json(CreateCheckoutSessionResponse.parse(result));
  } catch (err) {
    req.log.error({ err }, "Checkout Session creation failed");
    res.status(502).json({ error: "Failed to create Checkout Session in Onfire" });
  }
});

router.post("/connections/:id/checkout-sessions/:checkoutSessionId/replay", requireAuth, async (req, res): Promise<void> => {
  const connection = await loadActiveConnection(req, res);
  if (!connection) return;
  const parsed = ReplayCheckoutSessionBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const checkoutSessionId = String(req.params.checkoutSessionId);
  if (!localUuid.test(checkoutSessionId)) {
    res.status(404).json({ error: "Checkout Session not found" });
    return;
  }
  const [checkoutSession] = await db.select().from(checkoutSessionsTable)
    .where(and(eq(checkoutSessionsTable.id, checkoutSessionId),
      eq(checkoutSessionsTable.connectionId, connection.id))).limit(1);
  if (!checkoutSession) {
    res.status(404).json({ error: "Checkout Session not found" });
    return;
  }
  try {
    const result = await createOnfireCheckoutSession(connection.id, {
      ...checkoutSession, quantity: checkoutSession.quantity + (parsed.data.change === "quantityPlusOne" ? 1 : 0),
    });
    res.json(ReplayCheckoutSessionResponse.parse(result));
  } catch (err) {
    req.log.error({ err }, "Checkout Session replay failed");
    res.status(502).json({ error: "Failed to replay Checkout Session in Onfire" });
  }
});

router.post("/connections/:id/checkout-sessions/retrieve", requireAuth, async (req, res): Promise<void> => {
  const connection = await loadActiveConnection(req, res);
  if (!connection) return;
  const parsed = RetrieveCheckoutSessionBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  try {
    const result = await onfireRequest(connection.id,
      `/core/partner/checkout-sessions/${encodeURIComponent(parsed.data.checkoutSessionId)}`);
    if (!result.ok) {
      res.status(result.status).json({ error: checkoutSessionDetail(result.data) });
      return;
    }
    const checkoutSession = await persistCheckoutSession(result.data, connection.id);
    res.json(RetrieveCheckoutSessionResponse.parse(checkoutSession));
  } catch (err) {
    req.log.error({ err }, "Checkout Session retrieval failed");
    res.status(502).json({ error: "Failed to retrieve Checkout Session from Onfire" });
  }
});

export default router;