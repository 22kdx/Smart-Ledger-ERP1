import type { Pool, PoolClient } from "pg";
import type {
  CompanyCurrencySetting,
  CompanySettings,
  CompanySettingsRepository,
  CompanySettingsUpdate,
} from "./types";
import { CompanySettingsError } from "./types";

type CompanySettingsRow = {
  id: string;
  name: string;
  country_code: string | null;
  base_currency: string | null;
  timezone: string;
  fiscal_year_start_month: number | null;
  fiscal_year_start_day: number | null;
};

type CurrencyRow = {
  currency_code: string;
  is_enabled: boolean;
};

export class PostgresCompanySettingsRepository
  implements CompanySettingsRepository
{
  constructor(private readonly pool: Pool) {}

  async get(companyId: string): Promise<CompanySettings | null> {
    return readSettings(this.pool, companyId);
  }

  async update(
    companyId: string,
    update: CompanySettingsUpdate,
  ): Promise<CompanySettings | null> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const currentResult = await client.query<CompanySettingsRow>(
        `SELECT id, name, country_code, base_currency, timezone,
                fiscal_year_start_month, fiscal_year_start_day
         FROM companies
         WHERE id = $1::uuid
         FOR UPDATE`,
        [companyId],
      );
      const current = currentResult.rows[0];
      if (!current) {
        await client.query("COMMIT");
        return null;
      }

      for (const currency of update.currencies ?? []) {
        await client.query(
          `INSERT INTO company_currencies
             (company_id, currency_code, is_enabled)
           VALUES ($1::uuid, $2, $3)
           ON CONFLICT (company_id, currency_code)
           DO UPDATE SET is_enabled = EXCLUDED.is_enabled,
                         updated_at = now()`,
          [companyId, currency.code, currency.isEnabled],
        );
      }

      const nextBaseCurrency = Object.hasOwn(update, "baseCurrency")
        ? update.baseCurrency
        : current.base_currency;
      if (nextBaseCurrency !== null && nextBaseCurrency !== undefined) {
        const baseCurrencyResult = await client.query(
          `SELECT 1
           FROM company_currencies
           WHERE company_id = $1::uuid
             AND currency_code = $2
             AND is_enabled = true`,
          [companyId, nextBaseCurrency],
        );
        if (baseCurrencyResult.rowCount === 0) {
          throw new CompanySettingsError(
            400,
            "base_currency_must_be_enabled",
          );
        }
      }

      const values: unknown[] = [companyId];
      const assignments: string[] = [];
      const set = (column: string, value: unknown) => {
        values.push(value);
        assignments.push(`${column} = $${values.length}`);
      };
      if (Object.hasOwn(update, "name")) set("name", update.name);
      if (Object.hasOwn(update, "countryCode")) {
        set("country_code", update.countryCode);
      }
      if (Object.hasOwn(update, "baseCurrency")) {
        set("base_currency", update.baseCurrency);
      }
      if (Object.hasOwn(update, "timezone")) set("timezone", update.timezone);
      if (Object.hasOwn(update, "fiscalYearStartMonth")) {
        set("fiscal_year_start_month", update.fiscalYearStartMonth);
        set("fiscal_year_start_day", update.fiscalYearStartDay);
      }

      if (assignments.length > 0) {
        assignments.push("updated_at = now()");
        await client.query(
          `UPDATE companies
           SET ${assignments.join(", ")}
           WHERE id = $1::uuid`,
          values,
        );
      }

      const result = await readSettings(client, companyId);
      await client.query("COMMIT");
      return result;
    } catch (error) {
      await rollbackQuietly(client);
      throw error;
    } finally {
      client.release();
    }
  }
}

async function readSettings(
  database: Pool | PoolClient,
  companyId: string,
): Promise<CompanySettings | null> {
  const companyResult = await database.query<CompanySettingsRow>(
    `SELECT id, name, country_code, base_currency, timezone,
            fiscal_year_start_month, fiscal_year_start_day
     FROM companies
     WHERE id = $1::uuid`,
    [companyId],
  );
  const company = companyResult.rows[0];
  if (!company) return null;

  const currencyResult = await database.query<CurrencyRow>(
    `SELECT currency_code, is_enabled
     FROM company_currencies
     WHERE company_id = $1::uuid
     ORDER BY currency_code`,
    [companyId],
  );

  return {
    companyId: company.id,
    name: company.name,
    countryCode: company.country_code,
    baseCurrency: company.base_currency,
    timezone: company.timezone,
    fiscalYearStartMonth: company.fiscal_year_start_month,
    fiscalYearStartDay: company.fiscal_year_start_day,
    currencies: currencyResult.rows.map(mapCurrency),
  };
}

function mapCurrency(row: CurrencyRow): CompanyCurrencySetting {
  return {
    code: row.currency_code,
    isEnabled: row.is_enabled,
  };
}

async function rollbackQuietly(client: PoolClient): Promise<void> {
  try {
    await client.query("ROLLBACK");
  } catch {
    // Preserve the original repository error.
  }
}
