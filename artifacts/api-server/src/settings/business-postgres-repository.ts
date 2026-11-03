import type { Pool } from "pg";
import type {
  CompanyBusinessSettingsRepository,
  CompanyExchangeRate,
  CompanyTaxRule,
  CompanyTaxRuleUpdate,
} from "./business-types";

type TaxRuleRow = {
  id: string;
  name: string;
  rate: string;
  country_code: string | null;
  is_active: boolean;
};

type ExchangeRateRow = {
  id: string;
  from_currency: string;
  to_currency: string;
  rate: string;
  effective_date: string;
  source: string;
};

const TAX_RULE_COLUMNS =
  "id, name, rate::text AS rate, country_code, is_active";
const EXCHANGE_RATE_COLUMNS =
  "id, from_currency, to_currency, rate::text AS rate, effective_date::text AS effective_date, source";

export class PostgresCompanyBusinessSettingsRepository
  implements CompanyBusinessSettingsRepository
{
  constructor(private readonly pool: Pool) {}

  async listTaxRules(companyId: string): Promise<CompanyTaxRule[]> {
    const result = await this.pool.query<TaxRuleRow>(
      `SELECT ${TAX_RULE_COLUMNS}
       FROM company_tax_rules
       WHERE company_id = $1::uuid
       ORDER BY created_at DESC, id`,
      [companyId],
    );
    return result.rows.map(mapTaxRule);
  }

  async createTaxRule(
    companyId: string,
    rule: CompanyTaxRule,
  ): Promise<CompanyTaxRule> {
    const result = await this.pool.query<TaxRuleRow>(
      `INSERT INTO company_tax_rules
         (id, company_id, name, rate, country_code, is_active)
       VALUES ($1::uuid, $2::uuid, $3, $4, $5, $6)
       RETURNING ${TAX_RULE_COLUMNS}`,
      [
        rule.id,
        companyId,
        rule.name,
        rule.rate,
        rule.countryCode,
        rule.isActive,
      ],
    );
    return mapTaxRule(result.rows[0]);
  }

  async updateTaxRule(
    companyId: string,
    taxRuleId: string,
    update: CompanyTaxRuleUpdate,
  ): Promise<CompanyTaxRule | null> {
    const values: unknown[] = [companyId, taxRuleId];
    const assignments: string[] = [];
    if (update.rate !== undefined) {
      values.push(update.rate);
      assignments.push(`rate = $${values.length}`);
    }
    if (update.isActive !== undefined) {
      values.push(update.isActive);
      assignments.push(`is_active = $${values.length}`);
    }
    assignments.push("updated_at = now()");

    const result = await this.pool.query<TaxRuleRow>(
      `UPDATE company_tax_rules
       SET ${assignments.join(", ")}
       WHERE company_id = $1::uuid AND id = $2::uuid
       RETURNING ${TAX_RULE_COLUMNS}`,
      values,
    );
    return result.rows[0] ? mapTaxRule(result.rows[0]) : null;
  }

  async listExchangeRates(companyId: string): Promise<CompanyExchangeRate[]> {
    const result = await this.pool.query<ExchangeRateRow>(
      `SELECT ${EXCHANGE_RATE_COLUMNS}
       FROM company_exchange_rates
       WHERE company_id = $1::uuid
       ORDER BY effective_date DESC, created_at DESC, id`,
      [companyId],
    );
    return result.rows.map(mapExchangeRate);
  }

  async createExchangeRate(
    companyId: string,
    rate: CompanyExchangeRate,
  ): Promise<CompanyExchangeRate> {
    const result = await this.pool.query<ExchangeRateRow>(
      `INSERT INTO company_exchange_rates
         (id, company_id, from_currency, to_currency, rate, effective_date, source)
       VALUES ($1::uuid, $2::uuid, $3, $4, $5, $6::date, $7)
       RETURNING ${EXCHANGE_RATE_COLUMNS}`,
      [
        rate.id,
        companyId,
        rate.fromCurrency,
        rate.toCurrency,
        rate.rate,
        rate.effectiveDate,
        rate.source,
      ],
    );
    return mapExchangeRate(result.rows[0]);
  }

  async deleteExchangeRate(
    companyId: string,
    exchangeRateId: string,
  ): Promise<boolean> {
    const result = await this.pool.query(
      `DELETE FROM company_exchange_rates
       WHERE company_id = $1::uuid AND id = $2::uuid`,
      [companyId, exchangeRateId],
    );
    return result.rowCount === 1;
  }
}

function mapTaxRule(row: TaxRuleRow): CompanyTaxRule {
  return {
    id: row.id,
    name: row.name,
    rate: Number(row.rate),
    countryCode: row.country_code,
    isActive: row.is_active,
  };
}

function mapExchangeRate(row: ExchangeRateRow): CompanyExchangeRate {
  return {
    id: row.id,
    fromCurrency: row.from_currency,
    toCurrency: row.to_currency,
    rate: Number(row.rate),
    effectiveDate: row.effective_date,
    source: row.source,
  };
}
