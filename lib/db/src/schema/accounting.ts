import {
  boolean,
  check,
  date,
  index,
  integer,
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
import { sql } from "drizzle-orm";
import { companies } from "./organization";

export const accountTypeEnum = pgEnum("account_type", [
  "asset",
  "liability",
  "equity",
  "income",
  "expense",
]);
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
    status: text("status").notNull().default("draft"),
    createdBy: text("created_by").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    baseCurrency: text("base_currency"),
    postedAt: timestamp("posted_at", { withTimezone: true }),
    postedBy: text("posted_by"),
    reversalOfId: uuid("reversal_of_id"),
    reversedAt: timestamp("reversed_at", { withTimezone: true }),
  },
  (table) => [
    uniqueIndex("journal_entries_company_number_idx").on(table.companyId, table.entryNumber),
    index("journal_entries_company_date_idx").on(table.companyId, table.entryDate),
    uniqueIndex("journal_entries_reversal_of_unique_idx")
      .on(table.reversalOfId)
      .where(sql`${table.reversalOfId} IS NOT NULL`),
    check(
      "journal_entries_status_check",
      sql`${table.status} IN ('draft', 'posted', 'reversed')`,
    ),
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
    lineNumber: integer("line_number").notNull().default(1),
    memo: text("memo"),
    debit: numeric("debit", { precision: 20, scale: 4 }).notNull().default("0"),
    credit: numeric("credit", { precision: 20, scale: 4 }).notNull().default("0"),
    transactionCurrency: text("transaction_currency").notNull(),
    transactionAmount: numeric("transaction_amount", { precision: 20, scale: 4 })
      .notNull()
      .default("0"),
    exchangeRate: numeric("exchange_rate", { precision: 20, scale: 8 }).notNull(),
  },
  (table) => [
    index("journal_lines_entry_idx").on(table.journalEntryId, table.lineNumber),
    uniqueIndex("journal_lines_entry_number_idx").on(
      table.journalEntryId,
      table.lineNumber,
    ),
  ],
);

export const accountingPeriods = pgTable(
  "accounting_periods",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    startDate: date("start_date").notNull(),
    endDate: date("end_date").notNull(),
    status: text("status").notNull().default("open"),
    createdBy: text("created_by").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    closedBy: text("closed_by"),
    closedAt: timestamp("closed_at", { withTimezone: true }),
  },
  (table) => [
    index("accounting_periods_company_date_idx").on(
      table.companyId,
      table.startDate,
      table.endDate,
    ),
    check(
      "accounting_periods_date_order_check",
      sql`${table.startDate} <= ${table.endDate}`,
    ),
    check(
      "accounting_periods_status_check",
      sql`${table.status} IN ('open', 'closed')`,
    ),
  ],
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
