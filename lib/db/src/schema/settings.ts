import {
  boolean,
  check,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { companies } from "./organization";

export const companyCurrencies = pgTable(
  "company_currencies",
  {
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    currencyCode: text("currency_code").notNull(),
    isEnabled: boolean("is_enabled").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    primaryKey({
      name: "company_currencies_pk",
      columns: [table.companyId, table.currencyCode],
    }),
    check(
      "company_currencies_code_check",
      sql`${table.currencyCode} ~ '^[A-Z]{3}$'`,
    ),
  ],
);
