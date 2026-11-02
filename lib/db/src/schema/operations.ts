import {
  boolean,
  date,
  index,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { companies, currencyCodeEnum } from "./organization";

export const contactTypeEnum = pgEnum("contact_type", ["customer", "supplier", "both"]);
export const invoiceStatusEnum = pgEnum("invoice_status", [
  "draft",
  "issued",
  "partially_paid",
  "paid",
  "void",
]);
export const stockMovementTypeEnum = pgEnum("stock_movement_type", [
  "opening",
  "purchase",
  "sale",
  "adjustment",
  "return",
]);
export const payrollStatusEnum = pgEnum("payroll_status", ["draft", "approved", "paid"]);

export const contacts = pgTable(
  "contacts",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    type: contactTypeEnum("type").notNull(),
    phone: text("phone"),
    email: text("email"),
    taxNumber: text("tax_number"),
    address: text("address"),
    currency: currencyCodeEnum("currency").notNull().default("YER"),
    openingBalance: numeric("opening_balance", { precision: 20, scale: 4 }).notNull().default("0"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("contacts_company_name_idx").on(table.companyId, table.name)],
);

export const products = pgTable(
  "products",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    sku: text("sku").notNull(),
    name: text("name").notNull(),
    category: text("category"),
    unit: text("unit").notNull().default("قطعة"),
    quantityOnHand: numeric("quantity_on_hand", { precision: 20, scale: 4 }).notNull().default("0"),
    reorderLevel: numeric("reorder_level", { precision: 20, scale: 4 }).notNull().default("0"),
    costPrice: numeric("cost_price", { precision: 20, scale: 4 }).notNull().default("0"),
    sellingPrice: numeric("selling_price", { precision: 20, scale: 4 }).notNull().default("0"),
    currency: currencyCodeEnum("currency").notNull().default("YER"),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("products_company_sku_idx").on(table.companyId, table.sku),
    index("products_company_name_idx").on(table.companyId, table.name),
  ],
);

export const invoices = pgTable(
  "invoices",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    contactId: uuid("contact_id")
      .notNull()
      .references(() => contacts.id, { onDelete: "restrict" }),
    number: text("number").notNull(),
    status: invoiceStatusEnum("status").notNull().default("draft"),
    issueDate: date("issue_date").notNull(),
    dueDate: date("due_date"),
    currency: currencyCodeEnum("currency").notNull().default("YER"),
    exchangeRate: numeric("exchange_rate", { precision: 20, scale: 8 }).notNull().default("1"),
    subtotal: numeric("subtotal", { precision: 20, scale: 4 }).notNull().default("0"),
    taxAmount: numeric("tax_amount", { precision: 20, scale: 4 }).notNull().default("0"),
    total: numeric("total", { precision: 20, scale: 4 }).notNull().default("0"),
    notes: text("notes"),
    createdBy: text("created_by").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("invoices_company_number_idx").on(table.companyId, table.number),
    index("invoices_company_date_idx").on(table.companyId, table.issueDate),
  ],
);

export const invoiceLines = pgTable("invoice_lines", {
  id: uuid("id").defaultRandom().primaryKey(),
  invoiceId: uuid("invoice_id")
    .notNull()
    .references(() => invoices.id, { onDelete: "cascade" }),
  productId: uuid("product_id").references(() => products.id, { onDelete: "set null" }),
  description: text("description").notNull(),
  quantity: numeric("quantity", { precision: 20, scale: 4 }).notNull(),
  unitPrice: numeric("unit_price", { precision: 20, scale: 4 }).notNull(),
  lineTotal: numeric("line_total", { precision: 20, scale: 4 }).notNull(),
});

export const stockMovements = pgTable(
  "stock_movements",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "restrict" }),
    type: stockMovementTypeEnum("type").notNull(),
    quantity: numeric("quantity", { precision: 20, scale: 4 }).notNull(),
    unitCost: numeric("unit_cost", { precision: 20, scale: 4 }).notNull().default("0"),
    reference: text("reference"),
    note: text("note"),
    createdBy: text("created_by").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("stock_movements_company_created_idx").on(table.companyId, table.createdAt)],
);

export const employees = pgTable(
  "employees",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    employeeNumber: text("employee_number").notNull(),
    name: text("name").notNull(),
    jobTitle: text("job_title").notNull(),
    phone: text("phone"),
    email: text("email"),
    startDate: date("start_date"),
    monthlySalary: numeric("monthly_salary", { precision: 20, scale: 4 }).notNull().default("0"),
    currency: currencyCodeEnum("currency").notNull().default("YER"),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("employees_company_number_idx").on(table.companyId, table.employeeNumber),
    index("employees_company_name_idx").on(table.companyId, table.name),
  ],
);

export const payrollRuns = pgTable(
  "payroll_runs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    periodStart: date("period_start").notNull(),
    periodEnd: date("period_end").notNull(),
    status: payrollStatusEnum("status").notNull().default("draft"),
    total: numeric("total", { precision: 20, scale: 4 }).notNull().default("0"),
    currency: currencyCodeEnum("currency").notNull().default("YER"),
    createdBy: text("created_by").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("payroll_runs_company_period_idx").on(table.companyId, table.periodStart)],
);

export const payrollItems = pgTable(
  "payroll_items",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    payrollRunId: uuid("payroll_run_id")
      .notNull()
      .references(() => payrollRuns.id, { onDelete: "cascade" }),
    employeeId: uuid("employee_id")
      .notNull()
      .references(() => employees.id, { onDelete: "restrict" }),
    baseSalary: numeric("base_salary", { precision: 20, scale: 4 }).notNull(),
    allowances: numeric("allowances", { precision: 20, scale: 4 }).notNull().default("0"),
    deductions: numeric("deductions", { precision: 20, scale: 4 }).notNull().default("0"),
    netPay: numeric("net_pay", { precision: 20, scale: 4 }).notNull(),
  },
  (table) => [index("payroll_items_run_idx").on(table.payrollRunId)],
);
