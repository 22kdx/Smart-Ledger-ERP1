import {
  integer,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

export const currencyCodeEnum = pgEnum("currency_code", ["YER", "SAR", "USD"]);
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
  baseCurrency: currencyCodeEnum("base_currency").notNull().default("YER"),
  taxRate: numeric("tax_rate", { precision: 7, scale: 4 }).notNull().default("0"),
  timezone: text("timezone").notNull().default("UTC"),
  nextJournalNumber: integer("next_journal_number").notNull().default(1),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

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
