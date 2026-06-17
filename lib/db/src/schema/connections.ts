import { pgTable, uuid, text, timestamp } from "drizzle-orm/pg-core";

export const connectionsTable = pgTable("connections", {
  id: uuid("id").primaryKey().defaultRandom(),
  partnerPublicId: text("partner_public_id").notNull().unique(),
  displayName: text("display_name").notNull(),
  orgId: text("org_id"),
  accessToken: text("access_token").notNull(),
  refreshToken: text("refresh_token"),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  scope: text("scope"),
  status: text("status").notNull().default("active"),
  connectedAt: timestamp("connected_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export type Connection = typeof connectionsTable.$inferSelect;
export type InsertConnection = typeof connectionsTable.$inferInsert;
