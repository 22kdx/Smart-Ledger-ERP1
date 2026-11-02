import {
  boolean,
  char,
  index,
  integer,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { membershipRoleEnum } from "./organization";

export const authUsers = pgTable(
  "auth_users",
  {
    id: uuid("id").primaryKey(),
    email: varchar("email", { length: 254 }).notNull(),
    displayName: varchar("display_name", { length: 120 }).notNull(),
    passwordHash: text("password_hash").notNull(),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [uniqueIndex("auth_users_email_unique").on(table.email)],
);

export const authRefreshTokens = pgTable(
  "auth_refresh_tokens",
  {
    id: uuid("id").primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => authUsers.id, { onDelete: "cascade" }),
    familyId: uuid("family_id").notNull(),
    tokenHash: char("token_hash", { length: 64 }).notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    replacedById: uuid("replaced_by_id"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("auth_refresh_tokens_hash_unique").on(table.tokenHash),
    index("auth_refresh_tokens_user_idx").on(table.userId),
    index("auth_refresh_tokens_family_idx").on(table.familyId),
  ],
);

export const authLoginThrottles = pgTable(
  "auth_login_throttles",
  {
    emailKey: char("email_key", { length: 64 }).notNull(),
    ipHash: char("ip_hash", { length: 64 }).notNull(),
    failedCount: integer("failed_count").notNull().default(0),
    windowStartedAt: timestamp("window_started_at", { withTimezone: true })
      .notNull(),
    lockedUntil: timestamp("locked_until", { withTimezone: true }),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [primaryKey({ columns: [table.emailKey, table.ipHash] })],
);

export const authAuditEvents = pgTable(
  "auth_audit_events",
  {
    id: uuid("id").primaryKey(),
    userId: uuid("user_id").references(() => authUsers.id, {
      onDelete: "set null",
    }),
    eventType: varchar("event_type", { length: 40 }).notNull(),
    emailKey: char("email_key", { length: 64 }).notNull(),
    ipHash: char("ip_hash", { length: 64 }).notNull(),
    userAgent: varchar("user_agent", { length: 256 }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("auth_audit_events_user_date_idx").on(table.userId, table.createdAt),
    index("auth_audit_events_date_idx").on(table.createdAt),
  ],
);

export const authRolePermissions = pgTable(
  "auth_role_permissions",
  {
    role: membershipRoleEnum("role").notNull(),
    permission: varchar("permission", { length: 80 }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.role, table.permission] }),
  ],
);
