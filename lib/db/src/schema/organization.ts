import { sql } from "drizzle-orm";
import {
  integer,
  numeric,
  pgEnum,
  pgTable,
  check,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

export const membershipRoleEnum = pgEnum("membership_role", [
  "owner",
  "admin",
  "accountant",
  "sales",
  "purchasing",
  "inventory",
  "hr",
  "viewer",
]);

export const companies = pgTable("companies", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name").notNull(),
  countryCode: text("country_code"),
  baseCurrency: text("base_currency"),
  taxRate: numeric("tax_rate", { precision: 7, scale: 4 }),
  timezone: text("timezone").notNull().default("UTC"),
  fiscalYearStartMonth: integer("fiscal_year_start_month"),
  fiscalYearStartDay: integer("fiscal_year_start_day"),
  nextJournalNumber: integer("next_journal_number").notNull().default(1),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  check(
    "companies_fiscal_year_start_month_check",
    sql`${table.fiscalYearStartMonth} IS NULL OR ${table.fiscalYearStartMonth} BETWEEN 1 AND 12`,
  ),
  check(
    "companies_fiscal_year_start_day_check",
    sql`${table.fiscalYearStartDay} IS NULL OR ${table.fiscalYearStartDay} BETWEEN 1 AND 31`,
  ),
  check(
    "companies_fiscal_year_start_pair_check",
    sql`(${table.fiscalYearStartMonth} IS NULL) = (${table.fiscalYearStartDay} IS NULL)`,
  ),
]);

export const companyMemberships = pgTable(
  "company_memberships",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    userId: text("user_id").notNull(),
    role: membershipRoleEnum("role").notNull().default("viewer"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("company_memberships_company_user_idx").on(table.companyId, table.userId),
  ],
);
