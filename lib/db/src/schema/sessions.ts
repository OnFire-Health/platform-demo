import { pgTable, varchar, json, timestamp, index } from "drizzle-orm/pg-core";

/**
 * Session store table for connect-pg-simple. The column shape (sid/sess/expire)
 * is dictated by connect-pg-simple — do not change it. We manage it via Drizzle
 * (instead of createTableIfMissing) because the bundled server cannot read the
 * package's table.sql at runtime.
 */
export const operatorSessionsTable = pgTable(
  "operator_sessions",
  {
    sid: varchar("sid").primaryKey(),
    sess: json("sess").notNull(),
    expire: timestamp("expire", { precision: 6 }).notNull(),
  },
  (table) => [index("IDX_operator_sessions_expire").on(table.expire)],
);
