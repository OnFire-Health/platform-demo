import { pgTable, uuid, text, timestamp, boolean, jsonb } from "drizzle-orm/pg-core";

export const webhookEventsTable = pgTable("webhook_events", {
  id: uuid("id").primaryKey().defaultRandom(),
  envelopeId: text("envelope_id").notNull().unique(),
  type: text("type"),
  partnerPublicId: text("partner_public_id"),
  externalInvoiceRef: text("external_invoice_ref"),
  invoicePublicId: text("invoice_public_id"),
  checkoutSessionPublicId: text("checkout_session_public_id"),
  metadata: jsonb("metadata").$type<Record<string, unknown>>(),
  status: text("status"),
  amount: text("amount"),
  currency: text("currency"),
  connectionId: uuid("connection_id"),
  connectionDisplayName: text("connection_display_name"),
  routed: boolean("routed").notNull().default(false),
  receivedAt: timestamp("received_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export type WebhookEvent = typeof webhookEventsTable.$inferSelect;
export type InsertWebhookEvent = typeof webhookEventsTable.$inferInsert;
