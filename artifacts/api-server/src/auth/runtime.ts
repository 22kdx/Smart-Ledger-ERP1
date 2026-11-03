import pg from "pg";
import { AuthService } from "./service";
import { PostgresAuthRepository } from "./postgres-repository";
import { logger } from "../lib/logger";
import { CompanySettingsService } from "../settings/service";
import { PostgresCompanySettingsRepository } from "../settings/postgres-repository";

const { Pool } = pg;

export type AuthRuntime = {
  service: AuthService | null;
  companySettingsService: CompanySettingsService | null;
  close: () => Promise<void>;
};

export function createAuthRuntime(): AuthRuntime {
  const missing: string[] = [];
  const databaseUrl = process.env.DATABASE_URL;
  const accessTokenSecret = process.env.AUTH_ACCESS_TOKEN_SECRET;

  if (!databaseUrl) missing.push("DATABASE_URL");
  if (!accessTokenSecret) missing.push("AUTH_ACCESS_TOKEN_SECRET");
  if (missing.length > 0) {
    logger.warn(
      { missingVariables: missing },
      "Internal authentication is disabled until server configuration is complete",
    );
    return {
      service: null,
      companySettingsService: null,
      close: async () => undefined,
    };
  }

  if (!databaseUrl || !accessTokenSecret) {
    throw new Error("Internal auth configuration validation failed.");
  }

  const pool = new Pool({
    connectionString: databaseUrl,
    max: 5,
    connectionTimeoutMillis: 5_000,
    idleTimeoutMillis: 30_000,
  });
  const repository = new PostgresAuthRepository(pool);
  const service = new AuthService(repository, {
    accessTokenSecret,
    issuer: process.env.AUTH_TOKEN_ISSUER ?? "midad-erp-api",
    audience: process.env.AUTH_TOKEN_AUDIENCE ?? "midad-erp-mobile",
  });
  const companySettingsService = new CompanySettingsService(
    new PostgresCompanySettingsRepository(pool),
  );

  return {
    service,
    companySettingsService,
    close: async () => {
      await pool.end();
    },
  };
}
