import type {
  Currency,
  CurrencyOption,
  Account,
  ERPData,
  Entry,
  ExchangeRate,
  Invoice,
  JournalEntry,
  TaxRule,
} from './erp-store';

export const ERP_STORAGE_KEY = '@midad-erp/local-v1';

export type ERPStorageReader = (key: string) => Promise<string | null>;
export type ERPStorageWriter = (key: string, value: string) => Promise<unknown>;
export type InitialJournalBuilder = (invoices: Invoice[], entries: Entry[]) => JournalEntry[];

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object';
}

function normalizeStoredCurrencies(
  stored: unknown,
  parsed: Partial<ERPData>,
  baseCurrency: Currency,
  defaultCurrencies: CurrencyOption[],
): CurrencyOption[] {
  const currencies: CurrencyOption[] = Array.isArray(stored)
    ? stored.flatMap((item): CurrencyOption[] => {
        if (
          !isRecord(item) ||
          typeof item.code !== 'string' ||
          !item.code.trim() ||
          typeof item.name !== 'string'
        ) {
          return [];
        }
        return [{
          code: item.code,
          name: item.name,
          isActive: item.isActive !== false,
        }];
      })
    : defaultCurrencies.map((currency) => ({ ...currency }));
  const normalized = currencies.length
    ? currencies
    : defaultCurrencies.map((currency) => ({ ...currency }));
  const usedCurrencies = new Set<Currency>([baseCurrency]);
  parsed.invoices?.forEach((item) => usedCurrencies.add(item.currency));
  parsed.products?.forEach((item) => usedCurrencies.add(item.currency));
  parsed.entries?.forEach((item) => usedCurrencies.add(item.currency));
  parsed.employees?.forEach((item) => usedCurrencies.add(item.currency));
  parsed.contacts?.forEach((item) => usedCurrencies.add(item.currency));
  parsed.journalEntries?.forEach((entry) =>
    entry.lines.forEach((line) => usedCurrencies.add(line.currency)),
  );

  usedCurrencies.forEach((code) => {
    const existing = normalized.find((currency) => currency.code === code);
    if (existing) {
      if (code === baseCurrency) existing.isActive = true;
      return;
    }
    normalized.push({ code, name: code, isActive: true });
  });
  return normalized;
}

function normalizeStoredTaxRules(stored: unknown, legacyTaxRate: number): TaxRule[] {
  if (Array.isArray(stored)) {
    return stored.flatMap((item): TaxRule[] => {
      if (
        !isRecord(item) ||
        typeof item.id !== 'string' ||
        typeof item.name !== 'string' ||
        typeof item.rate !== 'number' ||
        !Number.isFinite(item.rate)
      ) {
        return [];
      }
      return [{
        id: item.id,
        name: item.name,
        rate: Math.min(100, Math.max(0, item.rate)),
        countryCode: typeof item.countryCode === 'string' ? item.countryCode : null,
        isActive: item.isActive !== false,
      }];
    });
  }
  if (legacyTaxRate > 0) {
    return [{
      id: 'legacy-tax-rule',
      name: 'ضريبة القيمة المضافة',
      rate: Math.min(100, Math.max(0, legacyTaxRate)),
      countryCode: null,
      isActive: true,
    }];
  }
  return [];
}

function normalizeStoredExchangeRates(stored: unknown): ExchangeRate[] {
  if (!Array.isArray(stored)) return [];
  return stored.flatMap((item): ExchangeRate[] => {
    if (
      !isRecord(item) ||
      typeof item.id !== 'string' ||
      typeof item.fromCurrency !== 'string' ||
      typeof item.toCurrency !== 'string' ||
      typeof item.rate !== 'number' ||
      !Number.isFinite(item.rate) ||
      typeof item.effectiveDate !== 'string'
    ) {
      return [];
    }
    return [{
      id: item.id,
      fromCurrency: item.fromCurrency,
      toCurrency: item.toCurrency,
      rate: item.rate,
      effectiveDate: item.effectiveDate,
      source: typeof item.source === 'string' ? item.source : '',
    }];
  });
}

const accountTypes = new Set(['asset', 'liability', 'equity', 'revenue', 'expense']);

function normalizeStoredAccounts(stored: unknown, defaults: Account[]): Account[] {
  const accounts = Array.isArray(stored)
    ? stored.flatMap((item): Account[] => {
        if (
          !isRecord(item) ||
          typeof item.id !== 'string' ||
          typeof item.code !== 'string' ||
          typeof item.name !== 'string' ||
          typeof item.type !== 'string' ||
          !accountTypes.has(item.type)
        ) {
          return [];
        }
        return [{
          id: item.id,
          code: item.code,
          name: item.name,
          type: item.type as Account['type'],
          isActive: item.isActive !== false,
          parentAccountId:
            typeof item.parentAccountId === 'string' ? item.parentAccountId : null,
        }];
      })
    : [];
  const merged = new Map(defaults.map((account) => [account.id, { ...account }]));
  accounts.forEach((account) => merged.set(account.id, account));
  return [...merged.values()];
}

export function legacyTaxRateFor(rules: TaxRule[]) {
  return rules.find((rule) => rule.isActive)?.rate ?? 0;
}

function attachInvoiceReferences(invoices: Invoice[], entries: Entry[]) {
  return entries.map((entry) => {
    if (entry.invoiceId || entry.category !== 'تحصيل مبيعات') return entry;
    const invoice = invoices.find((item) => entry.title.includes(item.number));
    return invoice ? { ...entry, invoiceId: invoice.id } : entry;
  });
}

export async function loadERPData(
  getItem: ERPStorageReader,
  fallbackData: Omit<ERPData, 'journalEntries'>,
  defaultCurrencies: CurrencyOption[],
  buildInitialJournal: InitialJournalBuilder,
): Promise<ERPData | null> {
  const stored = await getItem(ERP_STORAGE_KEY);
  if (!stored) return null;

  const parsed = JSON.parse(stored) as Partial<ERPData>;
  if (
    !Array.isArray(parsed.invoices) ||
    !Array.isArray(parsed.products) ||
    !Array.isArray(parsed.entries) ||
    !Array.isArray(parsed.employees) ||
    !Array.isArray(parsed.contacts)
  ) {
    return null;
  }

  const entries = attachInvoiceReferences(parsed.invoices, parsed.entries);
  const baseCurrency =
    typeof parsed.baseCurrency === 'string' && parsed.baseCurrency.trim()
      ? parsed.baseCurrency
      : fallbackData.baseCurrency;
  const legacyTaxRate =
    typeof parsed.taxRate === 'number' && Number.isFinite(parsed.taxRate)
      ? parsed.taxRate
      : 0;
  const taxRules = normalizeStoredTaxRules(parsed.taxRules, legacyTaxRate);
  const storedFiscalMonth =
    Number.isInteger(parsed.fiscalYearStartMonth) &&
    parsed.fiscalYearStartMonth! >= 1 &&
    parsed.fiscalYearStartMonth! <= 12
      ? parsed.fiscalYearStartMonth!
      : null;
  const storedFiscalDay =
    storedFiscalMonth !== null &&
    Number.isInteger(parsed.fiscalYearStartDay) &&
    parsed.fiscalYearStartDay! >= 1 &&
    parsed.fiscalYearStartDay! <= new Date(2020, storedFiscalMonth, 0).getDate()
      ? parsed.fiscalYearStartDay!
      : null;

  return {
    ...fallbackData,
    ...parsed,
    accounts: normalizeStoredAccounts(parsed.accounts, fallbackData.accounts),
    countryCode: typeof parsed.countryCode === 'string' ? parsed.countryCode : null,
    baseCurrency,
    currencies: normalizeStoredCurrencies(
      parsed.currencies,
      parsed,
      baseCurrency,
      defaultCurrencies,
    ),
    taxRules,
    exchangeRates: normalizeStoredExchangeRates(parsed.exchangeRates),
    fiscalYearStartMonth: storedFiscalDay === null ? null : storedFiscalMonth,
    fiscalYearStartDay: storedFiscalDay,
    taxRate: legacyTaxRateFor(taxRules),
    entries,
    journalEntries: Array.isArray(parsed.journalEntries)
      ? (parsed.journalEntries.map((item, index) => {
          if (!isRecord(item)) return item;
          const status =
            item.status === 'draft' || item.status === 'reversed' || item.status === 'posted'
              ? item.status
              : 'posted';
          return {
            ...item,
            entryNumber:
              typeof item.entryNumber === 'string'
                ? item.entryNumber
                : `JE-${String(parsed.journalEntries!.length - index).padStart(5, '0')}`,
            status,
          };
        }) as JournalEntry[])
      : buildInitialJournal(parsed.invoices, entries),
  };
}

export function saveERPData(setItem: ERPStorageWriter, data: ERPData) {
  return setItem(ERP_STORAGE_KEY, JSON.stringify(data));
}
