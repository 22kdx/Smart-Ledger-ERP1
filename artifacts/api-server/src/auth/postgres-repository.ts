import type { Pool, PoolClient } from "pg";
import { randomUUID } from "node:crypto";
import type {
  AuthAuditEvent,
  AuthRepository,
  AuthUserRecord,
  AddCompanyMemberResult,
  CompanyAccessRecord,
  CompanyMemberRole,
  CompanySummary,
  LoginThrottleKey,
  RefreshRotationResult,
  RefreshTokenInput,
  RefreshTokenReplacement,
} from "./types";

type UserRow = {
  id: string;
  email: string;
  display_name: string;
  password_hash: string;
  is_active: boolean;
};

type RefreshRow = UserRow & {
  family_id: string;
  expires_at: Date;
  revoked_at: Date | null;
};

type ThrottleRow = {
  failed_count: number;
  window_started_at: Date;
  locked_until: Date | null;
};

type CompanyRow = {
  id: string;
  name: string;
  country_code: string | null;
  base_currency: string | null;
  tax_rate: string | null;
  role: CompanySummary["role"];
};

export class PostgresAuthRepository implements AuthRepository {
  constructor(private readonly pool: Pool) {}

  async findUserByEmail(email: string): Promise<AuthUserRecord | null> {
    const result = await this.pool.query<UserRow>(
      `SELECT id, email, display_name, password_hash, is_active
       FROM auth_users WHERE email = $1 LIMIT 1`,
      [email],
    );
    return result.rows[0] ? mapUser(result.rows[0]) : null;
  }

  async findUserById(id: string): Promise<AuthUserRecord | null> {
    const result = await this.pool.query<UserRow>(
      `SELECT id, email, display_name, password_hash, is_active
       FROM auth_users WHERE id = $1 LIMIT 1`,
      [id],
    );
    return result.rows[0] ? mapUser(result.rows[0]) : null;
  }

  async createUser(
    user: AuthUserRecord & { createdAt: Date },
  ): Promise<AuthUserRecord> {
    const result = await this.pool.query<UserRow>(
      `INSERT INTO auth_users
         (id, email, display_name, password_hash, is_active, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $6)
       RETURNING id, email, display_name, password_hash, is_active`,
      [
        user.id,
        user.email,
        user.displayName,
        user.passwordHash,
        user.isActive,
        user.createdAt,
      ],
    );
    return mapUser(result.rows[0]);
  }

  async isLoginLocked(
    key: LoginThrottleKey,
    now: Date,
  ): Promise<boolean> {
    const result = await this.pool.query<{ locked_until: Date | null }>(
      `SELECT locked_until FROM auth_login_throttles
       WHERE email_key = $1 AND ip_hash = $2`,
      [key.emailKey, key.ipHash],
    );
    const lockedUntil = result.rows[0]?.locked_until;
    return Boolean(lockedUntil && lockedUntil > now);
  }

  async recordFailedLogin(
    key: LoginThrottleKey,
    now: Date,
    windowMs: number,
    maxAttempts: number,
    lockMs: number,
  ): Promise<Date | null> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(
        `INSERT INTO auth_login_throttles
           (email_key, ip_hash, failed_count, window_started_at, locked_until, updated_at)
         VALUES ($1, $2, 0, $3, NULL, $3)
         ON CONFLICT (email_key, ip_hash) DO NOTHING`,
        [key.emailKey, key.ipHash, now],
      );

      const current = await client.query<ThrottleRow>(
        `SELECT failed_count, window_started_at, locked_until
         FROM auth_login_throttles
         WHERE email_key = $1 AND ip_hash = $2
         FOR UPDATE`,
        [key.emailKey, key.ipHash],
      );
      const row = current.rows[0];
      const windowExpired =
        row.window_started_at.getTime() + windowMs <= now.getTime();
      const failedCount = (windowExpired ? 0 : row.failed_count) + 1;
      const windowStartedAt = windowExpired ? now : row.window_started_at;
      const lockedUntil =
        row.locked_until && row.locked_until > now
          ? row.locked_until
          : failedCount >= maxAttempts
            ? new Date(now.getTime() + lockMs)
            : null;

      await client.query(
        `UPDATE auth_login_throttles
         SET failed_count = $3, window_started_at = $4,
             locked_until = $5, updated_at = $6
         WHERE email_key = $1 AND ip_hash = $2`,
        [key.emailKey, key.ipHash, failedCount, windowStartedAt, lockedUntil, now],
      );
      await client.query("COMMIT");
      return lockedUntil;
    } catch (error) {
      await rollbackQuietly(client);
      throw error;
    } finally {
      client.release();
    }
  }

  async clearLoginFailures(key: LoginThrottleKey): Promise<void> {
    await this.pool.query(
      `DELETE FROM auth_login_throttles WHERE email_key = $1 AND ip_hash = $2`,
      [key.emailKey, key.ipHash],
    );
  }

  async recordAuditEvent(event: AuthAuditEvent): Promise<void> {
    await this.pool.query(
      `INSERT INTO auth_audit_events
         (id, user_id, event_type, email_key, ip_hash, user_agent, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        event.id,
        event.userId,
        event.eventType,
        event.emailKey,
        event.ipHash,
        event.userAgent,
        event.createdAt,
      ],
    );
  }

  async createRefreshToken(token: RefreshTokenInput): Promise<void> {
    await this.pool.query(
      `INSERT INTO auth_refresh_tokens
         (id, user_id, family_id, token_hash, expires_at, created_at)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        token.id,
        token.userId,
        token.familyId,
        token.tokenHash,
        token.expiresAt,
        token.createdAt,
      ],
    );
  }

  async rotateRefreshToken(
    tokenHash: string,
    replacement: RefreshTokenReplacement,
    now: Date,
  ): Promise<RefreshRotationResult> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const found = await client.query<RefreshRow>(
        `SELECT
           rt.family_id, rt.expires_at, rt.revoked_at,
           u.id, u.email, u.display_name, u.password_hash, u.is_active
         FROM auth_refresh_tokens rt
         JOIN auth_users u ON u.id = rt.user_id
         WHERE rt.token_hash = $1
         FOR UPDATE OF rt`,
        [tokenHash],
      );
      const row = found.rows[0];
      if (!row) {
        await client.query("COMMIT");
        return { status: "invalid" };
      }

      if (row.revoked_at) {
        await revokeFamily(client, row.family_id, now);
        await client.query("COMMIT");
        return { status: "reused", userId: row.id };
      }

      if (row.expires_at <= now) {
        await client.query(
          `UPDATE auth_refresh_tokens SET revoked_at = $2
           WHERE token_hash = $1 AND revoked_at IS NULL`,
          [tokenHash, now],
        );
        await client.query("COMMIT");
        return { status: "expired" };
      }

      if (!row.is_active) {
        await revokeFamily(client, row.family_id, now);
        await client.query("COMMIT");
        return { status: "inactive" };
      }

      await client.query(
        `UPDATE auth_refresh_tokens
         SET revoked_at = $2, replaced_by_id = $3
         WHERE token_hash = $1 AND revoked_at IS NULL`,
        [tokenHash, now, replacement.id],
      );
      await client.query(
        `INSERT INTO auth_refresh_tokens
           (id, user_id, family_id, token_hash, expires_at, created_at)
         SELECT $1, rt.user_id, rt.family_id, $2, $3, $4
         FROM auth_refresh_tokens rt WHERE rt.token_hash = $5`,
        [
          replacement.id,
          replacement.tokenHash,
          replacement.expiresAt,
          replacement.createdAt,
          tokenHash,
        ],
      );
      await client.query("COMMIT");
      return { status: "rotated", user: mapUser(row) };
    } catch (error) {
      await rollbackQuietly(client);
      throw error;
    } finally {
      client.release();
    }
  }

  async revokeRefreshFamily(
    tokenHash: string,
    now: Date,
  ): Promise<string | null> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const found = await client.query<{ user_id: string; family_id: string }>(
        `SELECT user_id, family_id FROM auth_refresh_tokens
         WHERE token_hash = $1 FOR UPDATE`,
        [tokenHash],
      );
      const row = found.rows[0];
      if (!row) {
        await client.query("COMMIT");
        return null;
      }

      await revokeFamily(client, row.family_id, now);
      await client.query("COMMIT");
      return row.user_id;
    } catch (error) {
      await rollbackQuietly(client);
      throw error;
    } finally {
      client.release();
    }
  }

  async getCompanyAccess(
    userId: string,
    companyId: string,
  ): Promise<CompanyAccessRecord | null> {
    const result = await this.pool.query<{
      role: CompanyAccessRecord["role"];
      permission: string | null;
    }>(
      `SELECT cm.role, rp.permission
       FROM company_memberships cm
       LEFT JOIN auth_role_permissions rp ON rp.role = cm.role
       WHERE cm.company_id = $1::uuid AND cm.user_id = $2`,
      [companyId, userId],
    );
    if (result.rows.length === 0) return null;

    return {
      companyId,
      role: result.rows[0].role,
      permissions: [
        ...new Set(
          result.rows
            .map((row) => row.permission)
            .filter((permission): permission is string => Boolean(permission)),
        ),
      ],
    };
  }

  async listCompanies(userId: string): Promise<CompanySummary[]> {
    const result = await this.pool.query<CompanyRow>(
      `SELECT c.id, c.name, c.country_code, c.base_currency, c.tax_rate, cm.role
       FROM company_memberships cm
       JOIN companies c ON c.id = cm.company_id
       WHERE cm.user_id = $1
       ORDER BY c.name, c.id`,
      [userId],
    );
    return result.rows.map(mapCompany);
  }

  async createCompany(
    userId: string,
    input: {
      name: string;
      countryCode?: string;
      baseCurrency?: string | null;
      taxRate?: number | null;
    },
  ): Promise<CompanySummary> {
    const client = await this.pool.connect();
    const id = randomUUID();
    try {
      await client.query("BEGIN");
      const company = await client.query<Omit<CompanyRow, "role">>(
        `INSERT INTO companies
           (id, name, country_code, base_currency, tax_rate)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id, name, country_code, base_currency, tax_rate`,
        [
          id,
          input.name,
          input.countryCode ?? null,
          input.baseCurrency ?? null,
          input.taxRate ?? null,
        ],
      );
      await client.query(
        `INSERT INTO company_memberships (id, company_id, user_id, role)
         VALUES ($1, $2, $3, 'owner')`,
        [randomUUID(), id, userId],
      );
      await client.query("COMMIT");
      return mapCompany({ ...company.rows[0], role: "owner" });
    } catch (error) {
      await rollbackQuietly(client);
      throw error;
    } finally {
      client.release();
    }
  }

  async addCompanyMember(
    companyId: string,
    email: string,
    role: CompanyMemberRole,
  ): Promise<AddCompanyMemberResult> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const company = await client.query<{ id: string }>(
        `SELECT id FROM companies WHERE id = $1::uuid`,
        [companyId],
      );
      if (!company.rows[0]) {
        await client.query("COMMIT");
        return { status: "company_not_found" };
      }

      const user = await client.query<{ id: string; email: string }>(
        `SELECT id, email FROM auth_users
         WHERE email = $1 AND is_active = true`,
        [email],
      );
      if (!user.rows[0]) {
        await client.query("COMMIT");
        return { status: "user_not_found" };
      }

      try {
        await client.query(
          `INSERT INTO company_memberships (id, company_id, user_id, role)
           VALUES ($1, $2, $3, $4)`,
          [randomUUID(), companyId, user.rows[0].id, role],
        );
      } catch (error) {
        if (isUniqueViolation(error)) {
          await client.query("ROLLBACK");
          return { status: "already_member" };
        }
        throw error;
      }

      await client.query("COMMIT");
      return {
        status: "added",
        member: {
          userId: user.rows[0].id,
          email: user.rows[0].email,
          role,
        },
      };
    } catch (error) {
      await rollbackQuietly(client);
      throw error;
    } finally {
      client.release();
    }
  }
}

async function revokeFamily(
  client: PoolClient,
  familyId: string,
  now: Date,
): Promise<void> {
  await client.query(
    `UPDATE auth_refresh_tokens
     SET revoked_at = COALESCE(revoked_at, $2)
     WHERE family_id = $1`,
    [familyId, now],
  );
}

async function rollbackQuietly(client: PoolClient): Promise<void> {
  try {
    await client.query("ROLLBACK");
  } catch {
    // Preserve the original database error.
  }
}

function mapUser(row: UserRow): AuthUserRecord {
  return {
    id: row.id,
    email: row.email,
    displayName: row.display_name,
    passwordHash: row.password_hash,
    isActive: row.is_active,
  };
}

function mapCompany(row: CompanyRow): CompanySummary {
  return {
    id: row.id,
    name: row.name,
    countryCode: row.country_code,
    baseCurrency: row.base_currency,
    taxRate: row.tax_rate === null ? null : Number(row.tax_rate),
    role: row.role,
  };
}

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === "23505"
  );
}
