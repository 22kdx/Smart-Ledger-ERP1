import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, useContext, useEffect, useState } from 'react';
import { Alert } from 'react-native';

export type Currency = string;
export type CurrencyOption = {
  code: Currency;
  name: string;
  isActive: boolean;
};
export type TaxRule = {
  id: string;
  name: string;
  rate: number;
  countryCode: string | null;
  isActive: boolean;
};
export type ExchangeRate = {
  id: string;
  fromCurrency: Currency;
  toCurrency: Currency;
  rate: number;
  effectiveDate: string;
  source: string;
};
export type InvoiceStatus = 'paid' | 'pending';
export type EntryType = 'income' | 'expense';
export type ContactKind = 'customer' | 'supplier';
export type AccountType = 'asset' | 'liability' | 'equity' | 'revenue' | 'expense';

export type Account = {
  id: string;
  code: string;
  name: string;
  type: AccountType;
};

export type JournalLine = {
  accountId: string;
  debit: number;
  credit: number;
  currency: Currency;
};

export type JournalEntry = {
  id: string;
  description: string;
  date: string;
  lines: JournalLine[];
  sourceType: 'invoice' | 'payment' | 'transaction' | 'manual';
  sourceId?: string;
};

export type Invoice = {
  id: string;
  number: string;
  customer: string;
  amount: number;
  currency: Currency;
  status: InvoiceStatus;
  date: string;
};

export type Product = {
  id: string;
  name: string;
  sku: string;
  category: string;
  quantity: number;
  price: number;
  currency: Currency;
};

export type Entry = {
  id: string;
  invoiceId?: string;
  title: string;
  category: string;
  amount: number;
  currency: Currency;
  type: EntryType;
  date: string;
};

export type Employee = {
  id: string;
  name: string;
  role: string;
  salary: number;
  currency: Currency;
};

export type Contact = {
  id: string;
  name: string;
  kind: ContactKind;
  phone: string;
  currency: Currency;
};

export type ERPData = {
  invoices: Invoice[];
  products: Product[];
  entries: Entry[];
  journalEntries: JournalEntry[];
  employees: Employee[];
  contacts: Contact[];
  companyName: string;
  countryCode: string | null;
  baseCurrency: Currency;
  currencies: CurrencyOption[];
  taxRules: TaxRule[];
  exchangeRates: ExchangeRate[];
  fiscalYearStartMonth: number | null;
  fiscalYearStartDay: number | null;
  /** Kept for compatibility with older app versions; taxRules is the source of truth. */
  taxRate: number;
};

export type InvoiceDraft = Omit<Invoice, 'id' | 'number' | 'date'>;
export type ProductDraft = Omit<Product, 'id'>;
export type EntryDraft = Omit<Entry, 'id' | 'date'>;
export type EmployeeDraft = Omit<Employee, 'id'>;
export type ContactDraft = Omit<Contact, 'id'>;
export type JournalEntryDraft = {
  description: string;
  debitAccountId: string;
  creditAccountId: string;
  amount: number;
  currency: Currency;
};

const STORAGE_KEY = '@midad-erp/local-v1';

export const DEFAULT_CURRENCIES: CurrencyOption[] = [
  { code: 'SAR', name: 'الريال السعودي', isActive: true },
  { code: 'YER', name: 'الريال اليمني', isActive: true },
  { code: 'USD', name: 'الدولار الأمريكي', isActive: true },
];

export const DEFAULT_ACCOUNTS: Account[] = [
  { id: '1000', code: '1000', name: 'النقدية', type: 'asset' },
  { id: '1100', code: '1100', name: 'العملاء', type: 'asset' },
  { id: '1200', code: '1200', name: 'المخزون', type: 'asset' },
  { id: '2000', code: '2000', name: 'الموردون', type: 'liability' },
  { id: '3000', code: '3000', name: 'رأس المال', type: 'equity' },
  { id: '4000', code: '4000', name: 'إيرادات المبيعات', type: 'revenue' },
  { id: '4100', code: '4100', name: 'إيرادات أخرى', type: 'revenue' },
  { id: '5000', code: '5000', name: 'مصروفات تشغيلية', type: 'expense' },
];

const seedData: Omit<ERPData, 'journalEntries'> = {
  companyName: 'مؤسسة مدار للتجارة',
  countryCode: null,
  baseCurrency: 'SAR',
  currencies: DEFAULT_CURRENCIES,
  taxRules: [],
  exchangeRates: [],
  fiscalYearStartMonth: null,
  fiscalYearStartDay: null,
  taxRate: 0,
  invoices: [
    { id: 'inv-01', number: 'INV-0248', customer: 'شركة الأفق', amount: 4850, currency: 'SAR', status: 'pending', date: 'اليوم' },
    { id: 'inv-02', number: 'INV-0247', customer: 'متجر النخبة', amount: 2160, currency: 'SAR', status: 'paid', date: 'أمس' },
    { id: 'inv-03', number: 'INV-0246', customer: 'مؤسسة الميناء', amount: 830000, currency: 'YER', status: 'paid', date: '١ نوفمبر' },
    { id: 'inv-04', number: 'INV-0245', customer: 'سامي للتوريدات', amount: 780, currency: 'USD', status: 'pending', date: '٣١ أكتوبر' },
    { id: 'inv-05', number: 'INV-0244', customer: 'شركة الأفق', amount: 3200, currency: 'SAR', status: 'paid', date: '٣٠ أكتوبر' },
  ],
  products: [
    { id: 'prd-01', name: 'ورق طباعة A4', sku: 'PAP-204', category: 'مستلزمات مكتبية', quantity: 38, price: 24, currency: 'SAR' },
    { id: 'prd-02', name: 'حبر طابعة أسود', sku: 'INK-110', category: 'مستلزمات مكتبية', quantity: 6, price: 89, currency: 'SAR' },
    { id: 'prd-03', name: 'دفتر قيود يومية', sku: 'BOK-031', category: 'قرطاسية', quantity: 24, price: 18, currency: 'SAR' },
    { id: 'prd-04', name: 'كرسي مكتبي', sku: 'FUR-052', category: 'أثاث', quantity: 3, price: 420, currency: 'SAR' },
    { id: 'prd-05', name: 'آلة حاسبة مكتبية', sku: 'CAL-018', category: 'أجهزة', quantity: 14, price: 56, currency: 'SAR' },
  ],
  entries: [
    { id: 'ent-01', title: 'تحصيل فاتورة INV-0247', category: 'تحصيل مبيعات', amount: 2160, currency: 'SAR', type: 'income', date: 'اليوم' },
    { id: 'ent-02', title: 'شراء مستلزمات مكتبية', category: 'مشتريات', amount: 680, currency: 'SAR', type: 'expense', date: 'اليوم' },
    { id: 'ent-03', title: 'خدمات استشارية', category: 'إيرادات خدمات', amount: 2450, currency: 'SAR', type: 'income', date: 'أمس' },
    { id: 'ent-04', title: 'إيجار المكتب', category: 'مصروفات تشغيلية', amount: 1250, currency: 'SAR', type: 'expense', date: '٣١ أكتوبر' },
    { id: 'ent-05', title: 'توريد محلي', category: 'مبيعات', amount: 455000, currency: 'YER', type: 'income', date: '٣٠ أكتوبر' },
    { id: 'ent-06', title: 'اشتراك برنامج', category: 'تقنية', amount: 45, currency: 'USD', type: 'expense', date: '٢٩ أكتوبر' },
  ],
  employees: [
    { id: 'emp-01', name: 'أحمد العريقي', role: 'مدير المبيعات', salary: 6500, currency: 'SAR' },
    { id: 'emp-02', name: 'سارة محمد', role: 'محاسبة', salary: 5200, currency: 'SAR' },
    { id: 'emp-03', name: 'خالد صالح', role: 'أمين مستودع', salary: 4300, currency: 'SAR' },
  ],
  contacts: [
    { id: 'con-01', name: 'شركة الأفق', kind: 'customer', phone: '+966 55 203 8410', currency: 'SAR' },
    { id: 'con-02', name: 'متجر النخبة', kind: 'customer', phone: '+967 73 516 2840', currency: 'YER' },
    { id: 'con-03', name: 'مؤسسة الإمداد', kind: 'supplier', phone: '+966 50 682 1914', currency: 'SAR' },
    { id: 'con-04', name: 'سامي للتوريدات', kind: 'supplier', phone: '+1 202 555 0118', currency: 'USD' },
  ],
};

type ERPContextValue = {
  data: ERPData;
  hydrated: boolean;
  addInvoice: (draft: InvoiceDraft) => void;
  addProduct: (draft: ProductDraft) => void;
  addEntry: (draft: EntryDraft) => void;
  addJournalEntry: (draft: JournalEntryDraft) => void;
  addEmployee: (draft: EmployeeDraft) => void;
  addContact: (draft: ContactDraft) => void;
  toggleInvoiceStatus: (id: string) => void;
  adjustProductStock: (id: string, amount: number) => void;
  updateBaseCurrency: (currency: Currency) => void;
  updateCompanyName: (name: string) => void;
  updateCompanyProfile: (
    companyName: string,
    countryCode: string | null,
    fiscalYearStartMonth: number | null,
    fiscalYearStartDay: number | null,
  ) => void;
  addCurrency: (currency: Omit<CurrencyOption, 'isActive'>) => void;
  setCurrencyActive: (code: Currency, isActive: boolean) => void;
  addTaxRule: (rule: Omit<TaxRule, 'id'>) => void;
  setTaxRuleActive: (id: string, isActive: boolean) => void;
  updateTaxRuleRate: (id: string, rate: number) => void;
  addExchangeRate: (rate: Omit<ExchangeRate, 'id'>) => void;
  removeExchangeRate: (id: string) => void;
};

const ERPContext = createContext<ERPContextValue | null>(null);

function createId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object';
}

function normalizeStoredCurrencies(
  stored: unknown,
  parsed: Partial<ERPData>,
  baseCurrency: Currency,
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
    : DEFAULT_CURRENCIES.map((currency) => ({ ...currency }));
  const normalized = currencies.length
    ? currencies
    : DEFAULT_CURRENCIES.map((currency) => ({ ...currency }));
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

function legacyTaxRateFor(rules: TaxRule[]) {
  return rules.find((rule) => rule.isActive)?.rate ?? 0;
}

function todayLabel() {
  return new Intl.DateTimeFormat('ar-SA-u-ca-gregory', {
    day: 'numeric',
    month: 'short',
  }).format(new Date());
}

function nextInvoiceNumber(invoices: Invoice[]) {
  const highestNumber = invoices.reduce((highest, invoice) => {
    const match = invoice.number.match(/^INV-(\d+)$/i);
    return match ? Math.max(highest, Number(match[1])) : highest;
  }, 0);
  return `INV-${String(highestNumber + 1).padStart(4, '0')}`;
}

function invoicePaymentEntry(invoice: Invoice): Entry {
  return {
    id: `payment-${invoice.id}`,
    invoiceId: invoice.id,
    title: `تحصيل فاتورة ${invoice.number}`,
    category: 'تحصيل مبيعات',
    amount: invoice.amount,
    currency: invoice.currency,
    type: 'income',
    date: invoice.date,
  };
}

function accountLine(accountId: string, amount: number, side: 'debit' | 'credit', currency: Currency): JournalLine {
  return {
    accountId,
    debit: side === 'debit' ? amount : 0,
    credit: side === 'credit' ? amount : 0,
    currency,
  };
}

function invoiceIssueJournal(invoice: Invoice): JournalEntry {
  return {
    id: `invoice-issue-${invoice.id}`,
    description: `إصدار فاتورة ${invoice.number}`,
    date: invoice.date,
    sourceType: 'invoice',
    sourceId: invoice.id,
    lines: [
      accountLine('1100', invoice.amount, 'debit', invoice.currency),
      accountLine('4000', invoice.amount, 'credit', invoice.currency),
    ],
  };
}

function invoicePaymentJournal(invoice: Invoice): JournalEntry {
  return {
    id: `invoice-payment-${invoice.id}`,
    description: `تحصيل فاتورة ${invoice.number}`,
    date: invoice.date,
    sourceType: 'payment',
    sourceId: invoice.id,
    lines: [
      accountLine('1000', invoice.amount, 'debit', invoice.currency),
      accountLine('1100', invoice.amount, 'credit', invoice.currency),
    ],
  };
}

function journalFromEntry(entry: Entry): JournalEntry {
  const isIncome = entry.type === 'income';
  const isSalesCollection = isIncome && entry.category === 'تحصيل مبيعات';
  return {
    id: `transaction-${entry.id}`,
    description: entry.title,
    date: entry.date,
    sourceType: 'transaction',
    sourceId: entry.id,
    lines: isIncome
      ? [
          accountLine('1000', entry.amount, 'debit', entry.currency),
          accountLine(isSalesCollection ? '1100' : '4100', entry.amount, 'credit', entry.currency),
        ]
      : [
          accountLine('5000', entry.amount, 'debit', entry.currency),
          accountLine('1000', entry.amount, 'credit', entry.currency),
        ],
  };
}

function findInvoicePayment(invoice: Invoice, entries: Entry[]) {
  return entries.find(
    (entry) =>
      entry.category === 'تحصيل مبيعات' &&
      (entry.invoiceId === invoice.id || entry.title.includes(invoice.number)),
  );
}

function attachInvoiceReferences(invoices: Invoice[], entries: Entry[]) {
  return entries.map((entry) => {
    if (entry.invoiceId || entry.category !== 'تحصيل مبيعات') return entry;
    const invoice = invoices.find((item) => entry.title.includes(item.number));
    return invoice ? { ...entry, invoiceId: invoice.id } : entry;
  });
}

function buildInitialJournal(invoices: Invoice[], entries: Entry[]) {
  const journalEntries: JournalEntry[] = [];
  const consumedEntryIds = new Set<string>();

  invoices.forEach((invoice) => {
    journalEntries.push(invoiceIssueJournal(invoice));
    const payment = findInvoicePayment(invoice, entries);
    if (payment) {
      journalEntries.push(journalFromEntry(payment));
      consumedEntryIds.add(payment.id);
    } else if (invoice.status === 'paid') {
      journalEntries.push(invoicePaymentJournal(invoice));
    }
  });

  entries.forEach((entry) => {
    if (!consumedEntryIds.has(entry.id)) journalEntries.push(journalFromEntry(entry));
  });

  return journalEntries;
}

export function getAccountBalances(journalEntries: JournalEntry[], currency: Currency) {
  const totals: Record<string, { debit: number; credit: number }> = {};
  DEFAULT_ACCOUNTS.forEach((account) => {
    totals[account.id] = { debit: 0, credit: 0 };
  });

  journalEntries.forEach((journal) => {
    journal.lines.forEach((line) => {
      if (line.currency !== currency || !totals[line.accountId]) return;
      totals[line.accountId].debit += line.debit;
      totals[line.accountId].credit += line.credit;
    });
  });

  return Object.fromEntries(
    DEFAULT_ACCOUNTS.map((account) => {
      const total = totals[account.id];
      const debitNormal = account.type === 'asset' || account.type === 'expense';
      const signed = total.debit - total.credit;
      const balance = debitNormal ? signed : -signed;
      return [
        account.id,
        {
          debit: Math.max(signed, 0),
          credit: Math.max(-signed, 0),
          balance,
        },
      ];
    }),
  ) as Record<string, { debit: number; credit: number; balance: number }>;
}

export function ERPProvider({ children }: { children: React.ReactNode }) {
  const [data, setData] = useState<ERPData>(() => ({
    ...seedData,
    journalEntries: buildInitialJournal(seedData.invoices, seedData.entries),
  }));
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    let mounted = true;
    AsyncStorage.getItem(STORAGE_KEY)
      .then((stored) => {
        if (!mounted || !stored) return;
        const parsed = JSON.parse(stored) as Partial<ERPData>;
        if (
          Array.isArray(parsed.invoices) &&
          Array.isArray(parsed.products) &&
          Array.isArray(parsed.entries) &&
          Array.isArray(parsed.employees) &&
          Array.isArray(parsed.contacts)
        ) {
          const entries = attachInvoiceReferences(parsed.invoices, parsed.entries);
          const baseCurrency =
            typeof parsed.baseCurrency === 'string' && parsed.baseCurrency.trim()
              ? parsed.baseCurrency
              : seedData.baseCurrency;
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
          setData({
            ...seedData,
            ...parsed,
            countryCode: typeof parsed.countryCode === 'string' ? parsed.countryCode : null,
            baseCurrency,
            currencies: normalizeStoredCurrencies(parsed.currencies, parsed, baseCurrency),
            taxRules,
            exchangeRates: normalizeStoredExchangeRates(parsed.exchangeRates),
            fiscalYearStartMonth: storedFiscalDay === null ? null : storedFiscalMonth,
            fiscalYearStartDay: storedFiscalDay,
            taxRate: legacyTaxRateFor(taxRules),
            entries,
            journalEntries: Array.isArray(parsed.journalEntries)
              ? parsed.journalEntries
              : buildInitialJournal(parsed.invoices, entries),
          });
        }
      })
      .catch(() => {
        if (mounted) {
          Alert.alert('تعذر تحميل البيانات', 'سيتم فتح التطبيق ببيانات البداية.');
        }
      })
      .finally(() => {
        if (mounted) setHydrated(true);
      });
    return () => {
      mounted = false;
    };
  }, []);

  const commit = (next: ERPData) => {
    setData(next);
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next)).catch(() => {
      Alert.alert('تعذر حفظ التغيير', 'تحقق من مساحة الجهاز ثم حاول مرة أخرى.');
    });
  };

  const value: ERPContextValue = {
    data,
    hydrated,
    addInvoice: (draft) => {
      const invoice: Invoice = {
        ...draft,
        id: createId(),
        number: nextInvoiceNumber(data.invoices),
        date: todayLabel(),
      };
      commit({
        ...data,
        invoices: [invoice, ...data.invoices],
        entries:
          invoice.status === 'paid'
            ? [invoicePaymentEntry(invoice), ...data.entries]
            : data.entries,
        journalEntries: [
          ...(invoice.status === 'paid' ? [invoicePaymentJournal(invoice)] : []),
          invoiceIssueJournal(invoice),
          ...data.journalEntries,
        ],
      });
    },
    addProduct: (draft) =>
      commit({ ...data, products: [{ ...draft, id: createId() }, ...data.products] }),
    addEntry: (draft) => {
      const entry: Entry = { ...draft, id: createId(), date: todayLabel() };
      commit({
        ...data,
        entries: [entry, ...data.entries],
        journalEntries: [journalFromEntry(entry), ...data.journalEntries],
      });
    },
    addJournalEntry: (draft) => {
      const id = createId();
      const date = todayLabel();
      commit({
        ...data,
        journalEntries: [
          {
            id: `manual-${id}`,
            description: draft.description,
            date,
            sourceType: 'manual',
            lines: [
              accountLine(draft.debitAccountId, draft.amount, 'debit', draft.currency),
              accountLine(draft.creditAccountId, draft.amount, 'credit', draft.currency),
            ],
          },
          ...data.journalEntries,
        ],
      });
    },
    addEmployee: (draft) =>
      commit({ ...data, employees: [{ ...draft, id: createId() }, ...data.employees] }),
    addContact: (draft) =>
      commit({ ...data, contacts: [{ ...draft, id: createId() }, ...data.contacts] }),
    toggleInvoiceStatus: (id) => {
      const invoice = data.invoices.find((item) => item.id === id);
      if (!invoice) return;

      const nextStatus: InvoiceStatus = invoice.status === 'paid' ? 'pending' : 'paid';
      const updatedInvoice = { ...invoice, status: nextStatus };
      const paymentEntry = findInvoicePayment(invoice, data.entries);
      const nextEntries =
        nextStatus === 'paid'
          ? paymentEntry
            ? data.entries
            : [invoicePaymentEntry(updatedInvoice), ...data.entries]
          : data.entries.filter((entry) => entry.invoiceId !== id);
      const paymentSourceId = paymentEntry?.id;
      const retainedJournalEntries = data.journalEntries.filter(
        (journal) =>
          !(
            (journal.sourceType === 'payment' && journal.sourceId === id) ||
            (journal.sourceType === 'transaction' && journal.sourceId === paymentSourceId)
          ),
      );
      const nextJournalEntries =
        nextStatus === 'paid'
          ? paymentEntry
            ? data.journalEntries
            : [invoicePaymentJournal(updatedInvoice), ...data.journalEntries]
          : retainedJournalEntries;

      commit({
        ...data,
        invoices: data.invoices.map((item) => (item.id === id ? updatedInvoice : item)),
        entries: nextEntries,
        journalEntries: nextJournalEntries,
      });
    },
    adjustProductStock: (id, amount) =>
      commit({
        ...data,
        products: data.products.map((product) =>
          product.id === id
            ? { ...product, quantity: Math.max(0, product.quantity + amount) }
            : product,
        ),
      }),
    updateBaseCurrency: (baseCurrency) => commit({ ...data, baseCurrency }),
    updateCompanyName: (companyName) => commit({ ...data, companyName }),
    updateCompanyProfile: (companyName, countryCode, fiscalYearStartMonth, fiscalYearStartDay) =>
      commit({ ...data, companyName, countryCode, fiscalYearStartMonth, fiscalYearStartDay }),
    addCurrency: (currency) =>
      commit({
        ...data,
        currencies: [...data.currencies, { ...currency, isActive: true }],
      }),
    setCurrencyActive: (code, isActive) => {
      if (!isActive && code === data.baseCurrency) return;
      commit({
        ...data,
        currencies: data.currencies.map((currency) =>
          currency.code === code ? { ...currency, isActive } : currency,
        ),
      });
    },
    addTaxRule: (rule) => {
      const taxRules = [{ ...rule, id: createId() }, ...data.taxRules];
      commit({ ...data, taxRules, taxRate: legacyTaxRateFor(taxRules) });
    },
    setTaxRuleActive: (id, isActive) => {
      const taxRules = data.taxRules.map((rule) =>
        rule.id === id ? { ...rule, isActive } : rule,
      );
      commit({ ...data, taxRules, taxRate: legacyTaxRateFor(taxRules) });
    },
    updateTaxRuleRate: (id, rate) => {
      const taxRules = data.taxRules.map((rule) =>
        rule.id === id ? { ...rule, rate } : rule,
      );
      commit({ ...data, taxRules, taxRate: legacyTaxRateFor(taxRules) });
    },
    addExchangeRate: (rate) =>
      commit({
        ...data,
        exchangeRates: [{ ...rate, id: createId() }, ...data.exchangeRates],
      }),
    removeExchangeRate: (id) =>
      commit({
        ...data,
        exchangeRates: data.exchangeRates.filter((rate) => rate.id !== id),
      }),
  };

  return <ERPContext.Provider value={value}>{children}</ERPContext.Provider>;
}

export function useERP() {
  const context = useContext(ERPContext);
  if (!context) throw new Error('useERP must be used inside ERPProvider');
  return context;
}
