import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  date,
  index,
  numeric,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { companies } from "./organization";

export const companyTaxRules = pgTable(
  "company_tax_rules",
  {
    id: uuid("id").primaryKey(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    rate: numeric("rate", { precision: 7, scale: 4 }).notNull(),
    countryCode: text("country_code"),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    check(
      "company_tax_rules_name_check",
      sql`length(trim(${table.name})) BETWEEN 1 AND 120`,
    ),
    check(
      "company_tax_rules_rate_check",
      sql`${table.rate} BETWEEN 0 AND 100`,
    ),
    check(
      "company_tax_rules_country_check",
      sql`${table.countryCode} IS NULL OR ${table.countryCode} ~ '^[A-Z]{2}$'`,
    ),
    index("company_tax_rules_company_active_idx").on(
      table.companyId,
      table.isActive,
    ),
  ],
);

export const companyExchangeRates = pgTable(
  "company_exchange_rates",
  {
    id: uuid("id").primaryKey(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    fromCurrency: text("from_currency").notNull(),
    toCurrency: text("to_currency").notNull(),
    rate: numeric("rate", { precision: 20, scale: 8 }).notNull(),
    effectiveDate: date("effective_date").notNull(),
    source: text("source").notNull().default(""),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    check(
      "company_exchange_rates_from_code_check",
      sql`${table.fromCurrency} ~ '^[A-Z]{3}$'`,
    ),
    check(
      "company_exchange_rates_to_code_check",
      sql`${table.toCurrency} ~ '^[A-Z]{3}$'`,
    ),
    check(
      "company_exchange_rates_distinct_currencies_check",
      sql`${table.fromCurrency} <> ${table.toCurrency}`,
    ),
    check(
      "company_exchange_rates_positive_rate_check",
      sql`${table.rate} > 0`,
    ),
    uniqueIndex("company_exchange_rates_pair_date_idx").on(
      table.companyId,
      table.fromCurrency,
      table.toCurrency,
      table.effectiveDate,
    ),
    index("company_exchange_rates_company_date_idx").on(
      table.companyId,
      table.effectiveDate,
    ),
  ],
);
