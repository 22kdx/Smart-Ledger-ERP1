import type {
  CompanySettings,
  CompanySettingsRepository,
  CompanySettingsUpdate,
} from "./types";
import { CompanySettingsError } from "./types";

export class CompanySettingsService {
  constructor(private readonly repository: CompanySettingsRepository) {}

  get(companyId: string): Promise<CompanySettings | null> {
    return this.repository.get(companyId);
  }

  update(
    companyId: string,
    input: CompanySettingsUpdate,
  ): Promise<CompanySettings | null> {
    if (Object.keys(input).length === 0) {
      throw new CompanySettingsError(400, "empty_settings_update");
    }

    const update: CompanySettingsUpdate = { ...input };

    if (input.name !== undefined) {
      const name = input.name.trim();
      if (name.length < 1 || name.length > 160) {
        throw new CompanySettingsError(400, "invalid_company_name");
      }
      update.name = name;
    }

    if (input.countryCode != null) {
      const countryCode = input.countryCode.trim().toUpperCase();
      if (!/^[A-Z]{2}$/.test(countryCode)) {
        throw new CompanySettingsError(400, "invalid_country_code");
      }
      update.countryCode = countryCode;
    }

    if (input.baseCurrency != null) {
      const baseCurrency = input.baseCurrency.trim().toUpperCase();
      if (!/^[A-Z]{3}$/.test(baseCurrency)) {
        throw new CompanySettingsError(400, "invalid_base_currency");
      }
      update.baseCurrency = baseCurrency;
    }

    if (input.timezone !== undefined) {
      const timezone = input.timezone.trim();
      try {
        if (!timezone || timezone.length > 64) throw new Error("invalid");
        new Intl.DateTimeFormat("en-US", { timeZone: timezone });
      } catch {
        throw new CompanySettingsError(400, "invalid_timezone");
      }
      update.timezone = timezone;
    }

    const hasMonth = Object.hasOwn(input, "fiscalYearStartMonth");
    const hasDay = Object.hasOwn(input, "fiscalYearStartDay");
    if (hasMonth !== hasDay) {
      throw new CompanySettingsError(400, "fiscal_year_start_requires_month_and_day");
    }
    if (
      hasMonth &&
      input.fiscalYearStartMonth != null &&
      input.fiscalYearStartDay != null
    ) {
      const referenceDate = new Date(
        Date.UTC(2000, input.fiscalYearStartMonth - 1, input.fiscalYearStartDay),
      );
      if (
        referenceDate.getUTCMonth() !== input.fiscalYearStartMonth - 1 ||
        referenceDate.getUTCDate() !== input.fiscalYearStartDay
      ) {
        throw new CompanySettingsError(400, "invalid_fiscal_year_start");
      }
    } else if (
      hasMonth &&
      (input.fiscalYearStartMonth !== null ||
        input.fiscalYearStartDay !== null)
    ) {
      throw new CompanySettingsError(400, "fiscal_year_start_requires_both_values");
    }

    if (input.currencies !== undefined) {
      const seen = new Set<string>();
      update.currencies = input.currencies.map(({ code, isEnabled }) => {
        const normalizedCode = code.trim().toUpperCase();
        if (!/^[A-Z]{3}$/.test(normalizedCode) || seen.has(normalizedCode)) {
          throw new CompanySettingsError(400, "invalid_or_duplicate_currency");
        }
        seen.add(normalizedCode);
        return { code: normalizedCode, isEnabled };
      });
    }

    return this.repository.update(companyId, update);
  }
}
