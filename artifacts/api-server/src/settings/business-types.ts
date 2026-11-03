export type CompanyTaxRule = {
  id: string;
  name: string;
  rate: number;
  countryCode: string | null;
  isActive: boolean;
};

export type CompanyTaxRuleCreate = Omit<CompanyTaxRule, "id">;

export type CompanyTaxRuleUpdate = Partial<
  Pick<CompanyTaxRule, "rate" | "isActive">
>;

export type CompanyExchangeRate = {
  id: string;
  fromCurrency: string;
  toCurrency: string;
  rate: number;
  effectiveDate: string;
  source: string;
};

export type CompanyExchangeRateCreate = Omit<
  CompanyExchangeRate,
  "id" | "source"
> & { source?: string };

export interface CompanyBusinessSettingsRepository {
  listTaxRules(companyId: string): Promise<CompanyTaxRule[]>;
  createTaxRule(
    companyId: string,
    rule: CompanyTaxRule,
  ): Promise<CompanyTaxRule>;
  updateTaxRule(
    companyId: string,
    taxRuleId: string,
    update: CompanyTaxRuleUpdate,
  ): Promise<CompanyTaxRule | null>;
  listExchangeRates(companyId: string): Promise<CompanyExchangeRate[]>;
  createExchangeRate(
    companyId: string,
    rate: CompanyExchangeRate,
  ): Promise<CompanyExchangeRate>;
  deleteExchangeRate(
    companyId: string,
    exchangeRateId: string,
  ): Promise<boolean>;
}

export class CompanyBusinessSettingsError extends Error {
  constructor(readonly statusCode: number, readonly code: string) {
    super(code);
    this.name = "CompanyBusinessSettingsError";
  }
}
