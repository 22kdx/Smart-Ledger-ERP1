export type CompanyCurrencySetting = {
  code: string;
  isEnabled: boolean;
};

export type CompanySettings = {
  companyId: string;
  name: string;
  countryCode: string | null;
  baseCurrency: string | null;
  timezone: string;
  fiscalYearStartMonth: number | null;
  fiscalYearStartDay: number | null;
  currencies: CompanyCurrencySetting[];
};

export type CompanySettingsUpdate = {
  name?: string;
  countryCode?: string | null;
  baseCurrency?: string | null;
  timezone?: string;
  fiscalYearStartMonth?: number | null;
  fiscalYearStartDay?: number | null;
  currencies?: CompanyCurrencySetting[];
};

export interface CompanySettingsRepository {
  get(companyId: string): Promise<CompanySettings | null>;
  update(
    companyId: string,
    update: CompanySettingsUpdate,
  ): Promise<CompanySettings | null>;
}

export class CompanySettingsError extends Error {
  constructor(readonly statusCode: number, readonly code: string) {
    super(code);
    this.name = "CompanySettingsError";
  }
}
