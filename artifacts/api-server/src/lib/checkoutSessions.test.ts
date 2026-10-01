import assert from "node:assert/strict";
import crypto from "node:crypto";
import { once } from "node:events";
import { test } from "node:test";
import express, { type Request } from "express";
import { and, eq, inArray } from "drizzle-orm";
import { db, pool, connectionsTable, checkoutSessionsTable, invoicesTable, webhookEventsTable } from "@workspace/db";
import checkoutSessionsRouter from "../routes/checkoutSessions";
import webhooksRouter from "../routes/webhooks";
import { logger } from "./logger";

// Isolated process fixtures: no real provider credentials, payer data or network calls.
test("Checkout Session API, idempotency and tenant-routed signed webhooks", async () => {
  assert.notEqual(process.env["NODE_ENV"], "production", "Run against the development database only");
  const fixtureSecret = "checkout-test-signing-key-not-a-live-secret";
  process.env["ONFIRE_WEBHOOK_SIGNING_SECRET"] = fixtureSecret;
  process.env["ONFIRE_API_BASE"] = "https://onfire-fixture.invalid/api/v1";
  process.env["REPLIT_DOMAINS"] = "checkout-fixture.invalid";
  const suffix = crypto.randomBytes(6).toString("hex");
  const connectionIds = [crypto.randomUUID(), crypto.randomUUID()];
  const partnerIds = [`prt_fixture_a_${suffix}`, `prt_fixture_b_${suffix}`];
  const realFetch = globalThis.fetch;
  const wireRequests: { url: string; body: unknown }[] = [];
  let upstreamStatus = 201;
  let upstreamData: unknown;
  globalThis.fetch = (async (input, init) => {
    const url = String(input);
    assert.ok(url.startsWith("https://onfire-fixture.invalid/api/v1/core/partner/checkout-sessions"));
    wireRequests.push({ url, body: init?.body ? JSON.parse(String(init.body)) : null });
    return new Response(JSON.stringify(upstreamData), {
      status: upstreamStatus, headers: { "Content-Type": "application/json" },
    });
  }) as typeof fetch;

  const app = express();
  app.use((req, _res, next) => {
    req.log = logger;
    req.session = { authenticated: req.get("X-Test-Auth") === "yes" } as Request["session"];
    next();
  });
  app.use("/api/webhooks/onfire", express.raw({ type: "*/*" }));
  app.use(express.json());
  app.use("/api", checkoutSessionsRouter, webhooksRouter);
  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  const base = `http://127.0.0.1:${address.port}/api`;

  async function request(path: string, body?: unknown, authenticated = true) {
    const response = await realFetch(`${base}${path}`, {
      method: body === undefined ? "GET" : "POST",
      headers: { "Content-Type": "application/json", "X-Test-Auth": authenticated ? "yes" : "no" },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    // These routes have different response envelopes; individual fields and
    // production-generated response validation are asserted by each case below.
    return { status: response.status, data: await response.json() as any };
  }
  function upstreamCheckoutSession(connectionIndex: number, publicId: string, orderId: string) {
    return {
      id: crypto.randomUUID(), public_id: publicId,
      payer_url: `https://payment-fixture.invalid/checkout/${publicId}`,
      partner_public_id: partnerIds[connectionIndex], status: "open", payment_status: "unpaid",
      amount: "150.00", currency: "USD", client_reference_id: orderId,
      items: [{ ref_id: "fixture-rate-card", quantity: 1, position: 0 }],
      success_url: `https://checkout-fixture.invalid/checkout-return?connectionId=${connectionIds[connectionIndex]}`,
      cancel_url: `https://checkout-fixture.invalid/checkout-cancelled?connectionId=${connectionIds[connectionIndex]}`,
      metadata: { order_id: orderId, practitioner: "Test practitioner" },
      expires_at: "2026-12-01T14:00:00+00:00", completed_at: null as string | null,
    };
  }
  async function webhook(type: string, block: Record<string, unknown>, envelopeId = `evt_fixture_${crypto.randomUUID()}`) {
    const body = JSON.stringify({ id: envelopeId, type, data: {
      [type.startsWith("checkout_session.") ? "checkout_session" : "invoice"]: block,
    } });
    const timestamp = String(Math.floor(Date.now() / 1000));
    const signature = crypto.createHmac("sha256", fixtureSecret).update(`${timestamp}.${body}`).digest("hex");
    const response = await realFetch(`${base}/webhooks/onfire`, {
      method: "POST", headers: { "Content-Type": "application/json",
        "X-Onfire-Webhook-Signature": `t=${timestamp},v1=${signature}` }, body,
    });
    return { status: response.status, data: await response.json() as any };
  }
  const path = `/connections/${connectionIds[0]}/checkout-sessions`;
  try {
    await db.insert(connectionsTable).values(connectionIds.map((id, index) => ({
      id, partnerPublicId: partnerIds[index]!, displayName: `Checkout fixture ${suffix} ${index}`,
      accessToken: "fixture-token-not-a-real-credential", status: "active",
    })));
    assert.equal((await request(path, undefined, false)).status, 401);
    assert.equal((await request(path, {}, false)).status, 401);
    assert.equal((await request(`${path}/retrieve`, {}, false)).status, 401);
    assert.equal((await request(`${path}/${crypto.randomUUID()}/replay`, {}, false)).status, 401);

    const createdWire = upstreamCheckoutSession(0, `cs_fixture_${suffix}`, `pd_cs_${suffix}`);
    upstreamData = createdWire;
    const created = await request(path, {
      rateCardRefId: "fixture-rate-card", quantity: 1, clientReferenceId: createdWire.client_reference_id,
      metadata: createdWire.metadata,
    });
    assert.equal(created.status, 200);
    assert.equal(created.data.httpStatus, 201);
    const localId = created.data.checkoutSession.id;
    assert.equal(created.data.checkoutSession.amount, "150.00");
    const originalBody = wireRequests.at(-1)!.body;
    assert.deepEqual(originalBody, {
      items: [{ ref_id: "fixture-rate-card", quantity: 1 }], client_reference_id: createdWire.client_reference_id,
      success_url: createdWire.success_url, cancel_url: createdWire.cancel_url, metadata: createdWire.metadata,
    });
    assert.ok(wireRequests.at(-1)!.url.endsWith("/checkout-sessions"), "Create must not have a trailing slash");

    upstreamStatus = 200;
    const replayed = await request(`${path}/${localId}/replay`, {});
    assert.equal(replayed.data.httpStatus, 200);
    assert.equal(replayed.data.checkoutSession.publicId, createdWire.public_id);
    assert.deepEqual(wireRequests.at(-1)!.body, originalBody);
    assert.equal((await request(path)).data.length, 1);
    const beforeConflict = replayed.data.checkoutSession;
    upstreamStatus = 409;
    upstreamData = { detail: "client_reference_id already used with a different request body" };
    const conflict = await request(`${path}/${localId}/replay`, { change: "quantityPlusOne" });
    assert.equal(conflict.status, 200);
    assert.equal(conflict.data.httpStatus, 409);
    assert.match(conflict.data.error, /different request body/);
    assert.equal(conflict.data.checkoutSession.quantity, 1);
    assert.equal(conflict.data.checkoutSession.updatedAt, beforeConflict.updatedAt);
    assert.equal(conflict.data.checkoutSession.lastCreateHttpStatus, 409);
    assert.equal((wireRequests.at(-1)!.body as { items: { quantity: number }[] }).items[0]!.quantity, 2);

    for (const code of [404, 403, 422]) {
      upstreamStatus = code;
      upstreamData = { detail: code === 422 ? [{ loc: ["body", "items"], msg: "invalid items" }] : "fixture detail" };
      const outcome = await request(path, { rateCardRefId: "missing", quantity: 0 });
      assert.equal(outcome.status, 200);
      assert.equal(outcome.data.httpStatus, code);
      assert.ok(outcome.data.error.includes(code === 422 ? "invalid items" : "fixture detail"));
    }

    // A webhook can create the mirror before our create response is persisted.
    const earlyWire = upstreamCheckoutSession(0, `cs_early_${suffix}`, `pd_cs_early_${suffix}`);
    const earlyBlock: Record<string, unknown> = { ...earlyWire, status: "complete", payment_status: "paid",
      completed_at: "2026-10-01T15:00:00+00:00" };
    delete earlyBlock["success_url"]; delete earlyBlock["cancel_url"]; delete earlyBlock["payer_url"];
    const earlyEnvelopeId = `evt_fixture_early_${suffix}`;
    assert.equal((await webhook("checkout_session.payment_paid", earlyBlock, earlyEnvelopeId)).data.routed, true);
    upstreamStatus = 201; upstreamData = earlyWire;
    const afterEarlyEvent = await request(path, {
      rateCardRefId: "fixture-rate-card", clientReferenceId: earlyWire.client_reference_id, metadata: earlyWire.metadata,
    });
    assert.equal(afterEarlyEvent.data.checkoutSession.status, "complete");
    assert.equal(afterEarlyEvent.data.checkoutSession.paymentStatus, "paid");
    assert.equal(afterEarlyEvent.data.checkoutSession.payerUrl, earlyWire.payer_url);
    assert.equal(afterEarlyEvent.data.checkoutSession.lastEventType, "checkout_session.payment_paid");
    assert.equal((await webhook("checkout_session.payment_paid", earlyBlock, earlyEnvelopeId)).data.duplicate, true);
    assert.equal((await webhook("checkout_session.completed", { ...earlyBlock, payment_status: "unpaid" })).status, 200);
    const [paidRow] = await db.select().from(checkoutSessionsTable).where(eq(checkoutSessionsTable.publicId, earlyWire.public_id));
    assert.equal(paidRow?.paymentStatus, "paid");
    assert.equal(paidRow?.lastEventType, "checkout_session.completed");
    assert.equal(paidRow?.completedAt?.toISOString(), "2026-10-01T15:00:00.000Z");

    // Failed card remains open/unpaid; log-only agreements do not alter the mirror.
    assert.equal((await webhook("checkout_session.payment_failed", createdWire)).status, 200);
    await webhook("checkout_session.agreement_accepted", { public_id: createdWire.public_id,
      partner_public_id: partnerIds[0], metadata: { agreement: "fixture" } });
    const [failedRow] = await db.select().from(checkoutSessionsTable).where(eq(checkoutSessionsTable.id, localId));
    assert.equal(failedRow?.status, "open");
    assert.equal(failedRow?.paymentStatus, "unpaid");
    assert.equal(failedRow?.lastEventType, "checkout_session.payment_failed");

    const otherWire = upstreamCheckoutSession(1, `cs_other_${suffix}`, createdWire.client_reference_id);
    await webhook("checkout_session.completed", { ...otherWire, status: "complete", payment_status: "processing" });
    const firstList = (await request(path)).data;
    const secondList = (await request(`/connections/${connectionIds[1]}/checkout-sessions`)).data;
    assert.ok(firstList.every((row: { connectionId: string }) => row.connectionId === connectionIds[0]));
    assert.equal(secondList[0].publicId, otherWire.public_id);
    assert.equal(secondList[0].paymentStatus, "processing");
    upstreamStatus = 404; upstreamData = { detail: "Checkout Session not found" };
    const crossTenant = await request(`${path}/retrieve`, { checkoutSessionId: otherWire.public_id });
    assert.equal(crossTenant.status, 404);
    assert.equal(crossTenant.data.error, "Checkout Session not found");
    await webhook("checkout_session.payment_paid", { ...otherWire, status: "complete", payment_status: "paid",
      completed_at: "2026-10-01T15:00:00+00:00" });
    const [otherPaid] = await db.select().from(checkoutSessionsTable).where(eq(checkoutSessionsTable.publicId, otherWire.public_id));
    assert.equal(otherPaid?.paymentStatus, "paid", "completed then payment_paid must settle too");
    // Simulate a retrieve snapshot that was read before the webhook but persisted
    // after it. The old open/unpaid/null completion snapshot cannot undo payment.
    upstreamStatus = 200; upstreamData = earlyWire;
    const refreshed = await request(`${path}/retrieve`, { checkoutSessionId: earlyWire.public_id });
    assert.equal(refreshed.data.publicId, earlyWire.public_id);
    assert.deepEqual(refreshed.data.metadata, earlyWire.metadata);
    assert.equal(refreshed.data.status, "complete");
    assert.equal(refreshed.data.paymentStatus, "paid");
    assert.equal(refreshed.data.completedAt, "2026-10-01T15:00:00.000Z");

    await db.insert(invoicesTable).values({ connectionId: connectionIds[0]!, externalInvoiceRef: `inv_${suffix}`, status: "open" });
    await webhook("invoice.payment_paid", { partner_public_id: partnerIds[0],
      external_invoice_ref: `inv_${suffix}`, invoice_public_id: `invoice_${suffix}`, status: "paid", amount: "150.00" });
    const [invoice] = await db.select().from(invoicesTable).where(and(
      eq(invoicesTable.connectionId, connectionIds[0]!), eq(invoicesTable.externalInvoiceRef, `inv_${suffix}`)));
    assert.equal(invoice?.status, "paid");
    const checkoutEvents = await db.select().from(webhookEventsTable).where(and(
      eq(webhookEventsTable.connectionId, connectionIds[0]!),
      eq(webhookEventsTable.checkoutSessionPublicId, earlyWire.public_id)));
    assert.equal(checkoutEvents.length, 2);
    assert.deepEqual(checkoutEvents[0]?.metadata, earlyWire.metadata);
  } finally {
    globalThis.fetch = realFetch;
    await db.delete(webhookEventsTable).where(inArray(webhookEventsTable.connectionId, connectionIds));
    await db.delete(connectionsTable).where(inArray(connectionsTable.id, connectionIds));
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    await pool.end();
  }
});