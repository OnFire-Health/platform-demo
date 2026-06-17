import { Router, type IRouter } from "express";
import { count, eq, sql } from "drizzle-orm";
import {
  db,
  connectionsTable,
  invoicesTable,
  webhookEventsTable,
} from "@workspace/db";
import {
  getConfig,
  isConfigured,
  missingConfig,
  webhookUrl,
} from "../lib/config";
import { requireAuth } from "../middleware/auth";

const router: IRouter = Router();

router.get("/platform/config", requireAuth, (_req, res) => {
  const cfg = getConfig();
  res.json({
    configured: isConfigured(),
    redirectUri: cfg.redirectUri,
    webhookUrl: webhookUrl(),
    scopes: cfg.scopes,
    authorizeUrl: cfg.authorizeUrl || null,
    missing: missingConfig(),
  });
});

router.get("/platform/summary", requireAuth, async (_req, res) => {
  const [connStats] = await db
    .select({
      total: count(),
      active: sql<number>`count(*) filter (where ${connectionsTable.status} = 'active')`,
    })
    .from(connectionsTable);

  const [invStats] = await db
    .select({
      total: count(),
      paid: sql<number>`count(*) filter (where ${invoicesTable.status} = 'paid')`,
      open: sql<number>`count(*) filter (where ${invoicesTable.status} is null or ${invoicesTable.status} not in ('paid','void','refunded'))`,
    })
    .from(invoicesTable);

  const [whStats] = await db
    .select({ total: count() })
    .from(webhookEventsTable);

  res.json({
    totalConnections: Number(connStats?.total ?? 0),
    activeConnections: Number(connStats?.active ?? 0),
    totalInvoices: Number(invStats?.total ?? 0),
    paidInvoices: Number(invStats?.paid ?? 0),
    openInvoices: Number(invStats?.open ?? 0),
    webhookEvents: Number(whStats?.total ?? 0),
  });
});

export default router;
