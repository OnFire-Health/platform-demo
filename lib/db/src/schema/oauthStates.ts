import { pgTable, text, timestamp } from "drizzle-orm/pg-core";

export const oauthStatesTable = pgTable("oauth_states", {
  state: text("state").primaryKey(),
  displayName: text("display_name").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export type OAuthState = typeof oauthStatesTable.$inferSelect;
export type InsertOAuthState = typeof oauthStatesTable.$inferInsert;
