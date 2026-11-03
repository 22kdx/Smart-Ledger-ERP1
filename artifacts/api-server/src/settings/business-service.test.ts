import assert from "node:assert/strict";
import { test } from "node:test";
import type {
  CompanyBusinessSettingsRepository,
  CompanyExchangeRate,
  CompanyTaxRule,
  CompanyTaxRuleUpdate,
} from "./business-types";
import { CompanyBusinessSettingsError } from "./business-types";
import { CompanyBusinessSettingsService } from "./business-service";

class MemoryBusinessSettingsRepository
  implements CompanyBusinessSettingsRepository
{
  taxRules: Array<CompanyTaxRule & { companyId: string }> = [];
  exchangeRates: Array<CompanyExchangeRate & { companyId: string }> = [];

  async listTaxRules(companyId: string): Promise<CompanyTaxRule[]> {
    return this.taxRules
      .filter((rule) => rule.companyId === companyId)
      .map(toPublicTaxRule);
  }

  async createTaxRule(
    companyId: string,
    rule: CompanyTaxRule,
  ): Promise<CompanyTaxRule> {
    const stored = { ...rule, companyId };
    this.taxRules.unshift(stored);
    return toPublicTaxRule(stored);
  }

  async updateTaxRule(
    companyId: string,
    taxRuleId: string,
    update: CompanyTaxRuleUpdate,
  ): Promise<CompanyTaxRule | null> {
    const rule = this.taxRules.find(
      (item) => item.id === taxRuleId && item.companyId === companyId,
    );
    if (!rule) return null;
    Object.assign(rule, update);
    return toPublicTaxRule(rule);
  }

  async listExchangeRates(companyId: string): Promise<CompanyExchangeRate[]> {
    return this.exchangeRates
      .filter((rate) => rate.companyId === companyId)
      .map(toPublicExchangeRate);
  }

  async createExchangeRate(
    companyId: string,
    rate: CompanyExchangeRate,
  ): Promise<CompanyExchangeRate> {
    const duplicate = this.exchangeRates.some(
      (item) =>
        item.companyId === companyId &&
        item.fromCurrency === rate.fromCurrency &&
        item.toCurrency === rate.toCurrency &&
        item.effectiveDate === rate.effectiveDate,
    );
    if (duplicate) throw { code: "23505" };
    const stored = { ...rate, companyId };
    this.exchangeRates.unshift(stored);
    return toPublicExchangeRate(stored);
  }

  async deleteExchangeRate(
    companyId: string,
    exchangeRateId: string,
  ): Promise<boolean> {
    const index = this.exchangeRates.findIndex(
      (item) => item.id === exchangeRateId && item.companyId === companyId,
    );
    if (index < 0) return false;
    this.exchangeRates.splice(index, 1);
    return true;
  }
}

test("tax rules are normalized and remain company-scoped", async () => {
  const repository = new MemoryBusinessSettingsRepository();
  const service = new CompanyBusinessSettingsService(repository);

  const created = await service.createTaxRule("company-a", {
    name: " ضريبة القيمة المضافة ",
    rate: 15,
    countryCode: "sa",
    isActive: true,
  });

  assert.equal(created.name, "ضريبة القيمة المضافة");
  assert.equal(created.countryCode, "SA");
  assert.equal(created.rate, 15);
  assert.deepEqual(await service.listTaxRules("company-b"), []);

  const updated = await service.updateTaxRule("company-a", created.id, {
    isActive: false,
    rate: 8.5,
  });
  assert.equal(updated?.isActive, false);
  assert.equal(updated?.rate, 8.5);
  assert.equal(
    await service.updateTaxRule("company-b", created.id, { isActive: false }),
    null,
  );
});

test("tax rules reject invalid rates and empty updates", async () => {
  const service = new CompanyBusinessSettingsService(
    new MemoryBusinessSettingsRepository(),
  );

  await assert.rejects(
    service.createTaxRule("company-a", {
      name: "Tax",
      rate: 101,
      countryCode: null,
      isActive: true,
    }),
    (error: unknown) =>
      error instanceof CompanyBusinessSettingsError &&
      error.code === "invalid_tax_rule_rate",
  );
  assert.throws(
    () => service.updateTaxRule("company-a", "rule-id", {}),
    (error: unknown) =>
      error instanceof CompanyBusinessSettingsError &&
      error.code === "empty_tax_rule_update",
  );
});

test("exchange rates validate dates, currencies, and duplicate pairs", async () => {
  const service = new CompanyBusinessSettingsService(
    new MemoryBusinessSettingsRepository(),
  );
  const validRate = {
    fromCurrency: "sar",
    toCurrency: "yer",
    rate: 140,
    effectiveDate: "2026-11-03",
    source: "  manual  ",
  };

  const created = await service.createExchangeRate("company-a", validRate);
  assert.equal(created.fromCurrency, "SAR");
  assert.equal(created.toCurrency, "YER");
  assert.equal(created.source, "manual");
  await assert.rejects(
    service.createExchangeRate("company-a", validRate),
    (error: unknown) =>
      error instanceof CompanyBusinessSettingsError &&
      error.statusCode === 409 &&
      error.code === "duplicate_exchange_rate",
  );
  assert.equal(await service.deleteExchangeRate("company-a", created.id), true);
  assert.equal(await service.deleteExchangeRate("company-a", created.id), false);

  await assert.rejects(
    service.createExchangeRate("company-a", {
      ...validRate,
      effectiveDate: "2026-02-30",
    }),
    (error: unknown) =>
      error instanceof CompanyBusinessSettingsError &&
      error.code === "invalid_exchange_effective_date",
  );
  await assert.rejects(
    service.createExchangeRate("company-a", {
      ...validRate,
      fromCurrency: "SAR",
      toCurrency: "SAR",
    }),
    (error: unknown) =>
      error instanceof CompanyBusinessSettingsError &&
      error.code === "exchange_currencies_must_differ",
  );
});

function toPublicTaxRule(
  rule: CompanyTaxRule & { companyId: string },
): CompanyTaxRule {
  const { companyId: _companyId, ...publicRule } = rule;
  return publicRule;
}

function toPublicExchangeRate(
  rate: CompanyExchangeRate & { companyId: string },
): CompanyExchangeRate {
  const { companyId: _companyId, ...publicRate } = rate;
  return publicRate;
}
