import {
  boolean,
  date,
  index,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  type AnyPgColumn,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { companies, currencyCodeEnum } from "./organization";

export const accountTypeEnum = pgEnum("account_type", [
  "asset",
  "liability",
  "equity",
  "income",
  "expense",
]);
export const journalStatusEnum = pgEnum("journal_status", ["posted", "reversed"]);

export const chartAccounts = pgTable(
  "chart_accounts",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    code: text("code").notNull(),
    name: text("name").notNull(),
    type: accountTypeEnum("type").notNull(),
    parentAccountId: uuid("parent_account_id").references(
      (): AnyPgColumn => chartAccounts.id,
      { onDelete: "set null" },
    ),
    isSystem: boolean("is_system").notNull().default(false),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("chart_accounts_company_code_idx").on(table.companyId, table.code),
    index("chart_accounts_company_type_idx").on(table.companyId, table.type),
  ],
);

export const journalEntries = pgTable(
  "journal_entries",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    entryNumber: text("entry_number").notNull(),
    entryDate: date("entry_date").notNull(),
    description: text("description").notNull(),
    reference: text("reference"),
    status: journalStatusEnum("status").notNull().default("posted"),
    createdBy: text("created_by").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    reversedAt: timestamp("reversed_at", { withTimezone: true }),
  },
  (table) => [
    uniqueIndex("journal_entries_company_number_idx").on(table.companyId, table.entryNumber),
    index("journal_entries_company_date_idx").on(table.companyId, table.entryDate),
  ],
);

export const journalLines = pgTable(
  "journal_lines",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    journalEntryId: uuid("journal_entry_id")
      .notNull()
      .references(() => journalEntries.id, { onDelete: "cascade" }),
    accountId: uuid("account_id")
      .notNull()
      .references(() => chartAccounts.id, { onDelete: "restrict" }),
    memo: text("memo"),
    debit: numeric("debit", { precision: 20, scale: 4 }).notNull().default("0"),
    credit: numeric("credit", { precision: 20, scale: 4 }).notNull().default("0"),
    transactionCurrency: currencyCodeEnum("transaction_currency").notNull().default("YER"),
    transactionAmount: numeric("transaction_amount", { precision: 20, scale: 4 })
      .notNull()
      .default("0"),
    exchangeRate: numeric("exchange_rate", { precision: 20, scale: 8 }).notNull().default("1"),
  },
  (table) => [index("journal_lines_entry_idx").on(table.journalEntryId)],
);

export const auditEvents = pgTable(
  "audit_events",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    actorUserId: text("actor_user_id").notNull(),
    action: text("action").notNull(),
    entityType: text("entity_type").notNull(),
    entityId: text("entity_id").notNull(),
    details: jsonb("details").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("audit_events_company_created_idx").on(table.companyId, table.createdAt)],
);
