import {
  pgTable,
  uuid,
  text,
  timestamp,
  unique,
} from "drizzle-orm/pg-core";
import { connectionsTable } from "./connections";

export const invoicesTable = pgTable(
  "invoices",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    connectionId: uuid("connection_id")
      .notNull()
      .references(() => connectionsTable.id, { onDelete: "cascade" }),
    externalInvoiceRef: text("external_invoice_ref").notNull(),
    invoicePublicId: text("invoice_public_id"),
    status: text("status"),
    amount: text("amount"),
    currency: text("currency"),
    clientEmail: text("client_email"),
    rateCardRefId: text("rate_card_ref_id"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    unique("invoices_connection_external_ref_unique").on(
      table.connectionId,
      table.externalInvoiceRef,
    ),
  ],
);

export type Invoice = typeof invoicesTable.$inferSelect;
export type InsertInvoice = typeof invoicesTable.$inferInsert;
