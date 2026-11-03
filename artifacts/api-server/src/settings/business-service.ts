import { randomUUID } from "node:crypto";
import type {
  CompanyBusinessSettingsRepository,
  CompanyExchangeRate,
  CompanyExchangeRateCreate,
  CompanyTaxRule,
  CompanyTaxRuleCreate,
  CompanyTaxRuleUpdate,
} from "./business-types";
import { CompanyBusinessSettingsError } from "./business-types";

export class CompanyBusinessSettingsService {
  constructor(private readonly repository: CompanyBusinessSettingsRepository) {}

  listTaxRules(companyId: string): Promise<CompanyTaxRule[]> {
    return this.repository.listTaxRules(companyId);
  }

  async createTaxRule(
    companyId: string,
    input: CompanyTaxRuleCreate,
  ): Promise<CompanyTaxRule> {
    const name = input.name.trim();
    if (!name || name.length > 120) {
      throw new CompanyBusinessSettingsError(400, "invalid_tax_rule_name");
    }
    if (!Number.isFinite(input.rate) || input.rate < 0 || input.rate > 100) {
      throw new CompanyBusinessSettingsError(400, "invalid_tax_rule_rate");
    }
    const countryCode =
      input.countryCode === null ? null : input.countryCode.trim().toUpperCase();
    if (countryCode !== null && !/^[A-Z]{2}$/.test(countryCode)) {
      throw new CompanyBusinessSettingsError(400, "invalid_tax_country_code");
    }
    return this.repository.createTaxRule(companyId, {
      id: randomUUID(),
      name,
      rate: input.rate,
      countryCode,
      isActive: input.isActive,
    });
  }

  updateTaxRule(
    companyId: string,
    taxRuleId: string,
    input: CompanyTaxRuleUpdate,
  ): Promise<CompanyTaxRule | null> {
    if (Object.keys(input).length === 0) {
      throw new CompanyBusinessSettingsError(400, "empty_tax_rule_update");
    }
    if (
      input.rate !== undefined &&
      (!Number.isFinite(input.rate) || input.rate < 0 || input.rate > 100)
    ) {
      throw new CompanyBusinessSettingsError(400, "invalid_tax_rule_rate");
    }
    return this.repository.updateTaxRule(companyId, taxRuleId, input);
  }

  listExchangeRates(companyId: string): Promise<CompanyExchangeRate[]> {
    return this.repository.listExchangeRates(companyId);
  }

  async createExchangeRate(
    companyId: string,
    input: CompanyExchangeRateCreate,
  ): Promise<CompanyExchangeRate> {
    const fromCurrency = input.fromCurrency.trim().toUpperCase();
    const toCurrency = input.toCurrency.trim().toUpperCase();
    if (!/^[A-Z]{3}$/.test(fromCurrency) || !/^[A-Z]{3}$/.test(toCurrency)) {
      throw new CompanyBusinessSettingsError(400, "invalid_exchange_currency");
    }
    if (fromCurrency === toCurrency) {
      throw new CompanyBusinessSettingsError(400, "exchange_currencies_must_differ");
    }
    if (!Number.isFinite(input.rate) || input.rate <= 0) {
      throw new CompanyBusinessSettingsError(400, "invalid_exchange_rate");
    }
    if (!isCalendarDate(input.effectiveDate)) {
      throw new CompanyBusinessSettingsError(400, "invalid_exchange_effective_date");
    }
    const source = input.source?.trim() ?? "";
    if (source.length > 120) {
      throw new CompanyBusinessSettingsError(400, "invalid_exchange_rate_source");
    }

    try {
      return await this.repository.createExchangeRate(companyId, {
        id: randomUUID(),
        fromCurrency,
        toCurrency,
        rate: input.rate,
        effectiveDate: input.effectiveDate,
        source,
      });
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new CompanyBusinessSettingsError(409, "duplicate_exchange_rate");
      }
      throw error;
    }
  }

  deleteExchangeRate(
    companyId: string,
    exchangeRateId: string,
  ): Promise<boolean> {
    return this.repository.deleteExchangeRate(companyId, exchangeRateId);
  }
}

function isCalendarDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "23505"
  );
}
