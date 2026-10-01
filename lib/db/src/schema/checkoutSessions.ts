import { pgTable, uuid, text, integer, jsonb, timestamp, unique } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { connectionsTable } from "./connections";

export const checkoutSessionsTable = pgTable(
  "checkout_sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    connectionId: uuid("connection_id").notNull().references(() => connectionsTable.id, { onDelete: "cascade" }),
    clientReferenceId: text("client_reference_id").notNull(),
    onfireId: text("onfire_id"),
    publicId: text("public_id").unique("checkout_sessions_public_id_unique"),
    payerUrl: text("payer_url"),
    rateCardRefId: text("rate_card_ref_id").notNull(),
    quantity: integer("quantity").notNull().default(1),
    status: text("status").notNull(),
    paymentStatus: text("payment_status").notNull(),
    amount: text("amount"),
    currency: text("currency"),
    successUrl: text("success_url").notNull(),
    cancelUrl: text("cancel_url").notNull(),
    metadata: jsonb("metadata").$type<Record<string, unknown>>(),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    lastEventType: text("last_event_type"),
    lastCreateHttpStatus: integer("last_create_http_status"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
  },
  (table) => [
    unique("checkout_sessions_connection_client_reference_unique").on(table.connectionId, table.clientReferenceId),
  ],
);

export const insertCheckoutSessionSchema = createInsertSchema(checkoutSessionsTable).omit({
  id: true, createdAt: true, updatedAt: true,
});
export type CheckoutSession = typeof checkoutSessionsTable.$inferSelect;
export type InsertCheckoutSession = typeof checkoutSessionsTable.$inferInsert;