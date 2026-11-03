import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, useContext, useEffect, useState } from 'react';
import { Alert } from 'react-native';
import {
  Account,
  AccountType,
  getAccountBalances as calculateAccountBalances,
  isJournalBalanced,
  isValidIsoDate,
  JournalEntry,
  JournalLine,
  JournalStatus,
  nextJournalNumber,
} from './accounting-utils';
import {
  legacyTaxRateFor,
  loadERPData,
  saveERPData,
} from './erp-storage';

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
export type { Account, AccountType, JournalEntry, JournalLine, JournalStatus } from './accounting-utils';

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
  accounts: Account[];
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
  date: string;
  lines: Array<{
    accountId: string;
    side: 'debit' | 'credit';
    amount: number;
    memo?: string;
  }>;
  currency: Currency;
};
export type AccountDraft = Omit<Account, 'id' | 'isActive'>;

export const DEFAULT_CURRENCIES: CurrencyOption[] = [
  { code: 'SAR', name: 'الريال السعودي', isActive: true },
  { code: 'YER', name: 'الريال اليمني', isActive: true },
  { code: 'USD', name: 'الدولار الأمريكي', isActive: true },
];

export const DEFAULT_ACCOUNTS: Account[] = [
  { id: '1000', code: '1000', name: 'النقدية', type: 'asset', isActive: true },
  { id: '1100', code: '1100', name: 'العملاء', type: 'asset', isActive: true },
  { id: '1200', code: '1200', name: 'المخزون', type: 'asset', isActive: true },
  { id: '2000', code: '2000', name: 'الموردون', type: 'liability', isActive: true },
  { id: '3000', code: '3000', name: 'رأس المال', type: 'equity', isActive: true },
  { id: '4000', code: '4000', name: 'إيرادات المبيعات', type: 'revenue', isActive: true },
  { id: '4100', code: '4100', name: 'إيرادات أخرى', type: 'revenue', isActive: true },
  { id: '5000', code: '5000', name: 'مصروفات تشغيلية', type: 'expense', isActive: true },
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
    { id: 'inv-01', number: 'INV-0248', customer: 'شركة الأفق', amount: 4850, currency: 'SAR', status: 'pending', date: dateDaysAgo(0) },
    { id: 'inv-02', number: 'INV-0247', customer: 'متجر النخبة', amount: 2160, currency: 'SAR', status: 'paid', date: dateDaysAgo(1) },
    { id: 'inv-03', number: 'INV-0246', customer: 'مؤسسة الميناء', amount: 830000, currency: 'YER', status: 'paid', date: dateDaysAgo(2) },
    { id: 'inv-04', number: 'INV-0245', customer: 'سامي للتوريدات', amount: 780, currency: 'USD', status: 'pending', date: dateDaysAgo(3) },
    { id: 'inv-05', number: 'INV-0244', customer: 'شركة الأفق', amount: 3200, currency: 'SAR', status: 'paid', date: dateDaysAgo(4) },
  ],
  products: [
    { id: 'prd-01', name: 'ورق طباعة A4', sku: 'PAP-204', category: 'مستلزمات مكتبية', quantity: 38, price: 24, currency: 'SAR' },
    { id: 'prd-02', name: 'حبر طابعة أسود', sku: 'INK-110', category: 'مستلزمات مكتبية', quantity: 6, price: 89, currency: 'SAR' },
    { id: 'prd-03', name: 'دفتر قيود يومية', sku: 'BOK-031', category: 'قرطاسية', quantity: 24, price: 18, currency: 'SAR' },
    { id: 'prd-04', name: 'كرسي مكتبي', sku: 'FUR-052', category: 'أثاث', quantity: 3, price: 420, currency: 'SAR' },
    { id: 'prd-05', name: 'آلة حاسبة مكتبية', sku: 'CAL-018', category: 'أجهزة', quantity: 14, price: 56, currency: 'SAR' },
  ],
  entries: [
    { id: 'ent-01', title: 'تحصيل فاتورة INV-0247', category: 'تحصيل مبيعات', amount: 2160, currency: 'SAR', type: 'income', date: dateDaysAgo(0) },
    { id: 'ent-02', title: 'شراء مستلزمات مكتبية', category: 'مشتريات', amount: 680, currency: 'SAR', type: 'expense', date: dateDaysAgo(0) },
    { id: 'ent-03', title: 'خدمات استشارية', category: 'إيرادات خدمات', amount: 2450, currency: 'SAR', type: 'income', date: dateDaysAgo(1) },
    { id: 'ent-04', title: 'إيجار المكتب', category: 'مصروفات تشغيلية', amount: 1250, currency: 'SAR', type: 'expense', date: dateDaysAgo(3) },
    { id: 'ent-05', title: 'توريد محلي', category: 'مبيعات', amount: 455000, currency: 'YER', type: 'income', date: dateDaysAgo(4) },
    { id: 'ent-06', title: 'اشتراك برنامج', category: 'تقنية', amount: 45, currency: 'USD', type: 'expense', date: dateDaysAgo(5) },
  ],
  employees: [
    { id: 'emp-01', name: 'أحمد العريقي', role: 'مدير المبيعات', salary: 6500, currency: 'SAR' },
    { id: 'emp-02', name: 'سارة محمد', role: 'محاسبة', salary: 5200, currency: 'SAR' },
    { id: 'emp-03', name: 'خالد صالح', role: 'أمين مستودع', salary: 4300, currency: 'SAR' },
  ],
  accounts: DEFAULT_ACCOUNTS.map((account) => ({ ...account })),
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
  addAccount: (draft: AccountDraft) => void;
  setAccountActive: (id: string, isActive: boolean) => void;
  postJournalEntry: (id: string) => void;
  deleteJournalDraft: (id: string) => void;
  reverseJournalEntry: (id: string, reversalDate: string) => void;
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

function todayIso() {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function dateDaysAgo(daysAgo: number) {
  const date = new Date();
  date.setHours(12, 0, 0, 0);
  date.setDate(date.getDate() - daysAgo);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function nextInvoiceNumber(invoices: Invoice[]) {
  const highestNumber = invoices.reduce((highest, invoice) => {
    const match = invoice.number.match(/^INV-(\d+)$/i);
    return match ? Math.max(highest, Number(match[1])) : highest;
  }, 0);
  return `INV-${String(highestNumber + 1).padStart(4, '0')}`;
}

function numberedJournal(entry: JournalEntry, current: JournalEntry[]): JournalEntry {
  return { ...entry, entryNumber: nextJournalNumber(current) };
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
    status: 'posted',
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
    status: 'posted',
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
    status: 'posted',
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

  return journalEntries.map((entry, index) => ({
    ...entry,
    entryNumber: `JE-${String(journalEntries.length - index).padStart(5, '0')}`,
    status: 'posted' as const,
  }));
}

export function getAccountBalances(
  journalEntries: JournalEntry[],
  currency: Currency,
  accounts: Account[] = DEFAULT_ACCOUNTS,
) {
  return calculateAccountBalances(journalEntries, currency, accounts);
}

export function ERPProvider({ children }: { children: React.ReactNode }) {
  const [data, setData] = useState<ERPData>(() => ({
    ...seedData,
    journalEntries: buildInitialJournal(seedData.invoices, seedData.entries),
  }));
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    let mounted = true;
    loadERPData(
      (key) => AsyncStorage.getItem(key),
      seedData,
      DEFAULT_CURRENCIES,
      buildInitialJournal,
    )
      .then((restored) => {
        if (mounted && restored) setData(restored);
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
    saveERPData((key, value) => AsyncStorage.setItem(key, value), next).catch(() => {
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
        date: todayIso(),
      };
      const issueJournal = numberedJournal(
        invoiceIssueJournal(invoice),
        data.journalEntries,
      );
      const paymentJournal =
        invoice.status === 'paid'
          ? numberedJournal(invoicePaymentJournal(invoice), [
              issueJournal,
              ...data.journalEntries,
            ])
          : null;
      commit({
        ...data,
        invoices: [invoice, ...data.invoices],
        entries:
          invoice.status === 'paid'
            ? [invoicePaymentEntry(invoice), ...data.entries]
            : data.entries,
        journalEntries: [
          ...(paymentJournal ? [paymentJournal] : []),
          issueJournal,
          ...data.journalEntries,
        ],
      });
    },
    addProduct: (draft) =>
      commit({ ...data, products: [{ ...draft, id: createId() }, ...data.products] }),
    addEntry: (draft) => {
      const entry: Entry = { ...draft, id: createId(), date: todayIso() };
      commit({
        ...data,
        entries: [entry, ...data.entries],
        journalEntries: [
          numberedJournal(journalFromEntry(entry), data.journalEntries),
          ...data.journalEntries,
        ],
      });
    },
    addJournalEntry: (draft) => {
      const lines: JournalLine[] = draft.lines.map((line) => ({
        accountId: line.accountId,
        debit: line.side === 'debit' ? line.amount : 0,
        credit: line.side === 'credit' ? line.amount : 0,
        currency: draft.currency,
        memo: line.memo?.trim() || undefined,
      }));
      if (
        !draft.description.trim() ||
        !isValidIsoDate(draft.date) ||
        !isJournalBalanced(lines) ||
        lines.some((line) =>
          !data.accounts.some(
            (account) => account.id === line.accountId && account.isActive !== false,
          ),
        )
      ) {
        Alert.alert('تعذر حفظ القيد', 'راجع التاريخ والحسابات وتأكد من توازن المدين والدائن.');
        return;
      }
      const entry: JournalEntry = {
        id: createId(),
        entryNumber: nextJournalNumber(data.journalEntries),
        description: draft.description.trim(),
        date: draft.date,
        sourceType: 'manual',
        status: 'draft',
        lines,
      };
      commit({
        ...data,
        journalEntries: [entry, ...data.journalEntries],
      });
    },
    addAccount: (draft) => {
      const code = draft.code.trim();
      const name = draft.name.trim();
      if (
        !code ||
        code.length > 32 ||
        !name ||
        data.accounts.some(
          (account) => account.code.toLowerCase() === code.toLowerCase(),
        )
      ) {
        Alert.alert('تعذر إضافة الحساب', 'أدخل رمزًا واسمًا صحيحين، وتأكد أن الرمز غير مستخدم.');
        return;
      }
      commit({
        ...data,
        accounts: [
          ...data.accounts,
          { ...draft, id: createId(), code, name, isActive: true },
        ],
      });
    },
    setAccountActive: (id, isActive) => {
      if (
        !isActive &&
        data.journalEntries.some(
          (entry) =>
            entry.status !== 'draft' &&
            entry.lines.some((line) => line.accountId === id),
        )
      ) {
        Alert.alert(
          'لا يمكن إيقاف الحساب',
          'الحساب مستخدم في قيود مرحلة. أبقه نشطًا للمحافظة على السجل المحاسبي.',
        );
        return;
      }
      commit({
        ...data,
        accounts: data.accounts.map((account) =>
          account.id === id ? { ...account, isActive } : account,
        ),
      });
    },
    postJournalEntry: (id) => {
      const entry = data.journalEntries.find((item) => item.id === id);
      if (!entry || entry.status !== 'draft') return;
      if (
        !isValidIsoDate(entry.date) ||
        !isJournalBalanced(entry.lines) ||
        entry.lines.some((line) =>
          !data.accounts.some(
            (account) => account.id === line.accountId && account.isActive !== false,
          ),
        )
      ) {
        Alert.alert('لا يمكن ترحيل القيد', 'راجع توازن القيد وحالة الحسابات المستخدمة.');
        return;
      }
      commit({
        ...data,
        journalEntries: data.journalEntries.map((item) =>
          item.id === id ? { ...item, status: 'posted' } : item,
        ),
      });
    },
    deleteJournalDraft: (id) => {
      const entry = data.journalEntries.find((item) => item.id === id);
      if (!entry || entry.status !== 'draft') return;
      commit({
        ...data,
        journalEntries: data.journalEntries.filter((item) => item.id !== id),
      });
    },
    reverseJournalEntry: (id, reversalDate) => {
      const original = data.journalEntries.find((item) => item.id === id);
      if (
        !original ||
        original.status !== 'posted' ||
        !isValidIsoDate(reversalDate)
      ) {
        Alert.alert('تعذر عكس القيد', 'اختر قيدًا مرحلًا وأدخل تاريخًا صحيحًا للعكس.');
        return;
      }
      if (
        data.journalEntries.some(
          (item) => item.reversalOfId === original.id,
        )
      ) {
        Alert.alert('القيد معكوس مسبقًا', 'لا يمكن إنشاء أكثر من قيد عكسي للقيد نفسه.');
        return;
      }
      const reversal: JournalEntry = {
        id: createId(),
        entryNumber: nextJournalNumber(data.journalEntries),
        description: `عكس ${original.entryNumber ?? original.description}`,
        date: reversalDate,
        sourceType: 'reversal',
        sourceId: original.id,
        reversalOfId: original.id,
        status: 'posted',
        lines: original.lines.map((line) => ({
          ...line,
          debit: line.credit,
          credit: line.debit,
        })),
      };
      commit({
        ...data,
        journalEntries: [
          reversal,
          ...data.journalEntries.map((item) =>
            item.id === id ? { ...item, status: 'reversed' as const } : item,
          ),
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
      const paymentJournal = data.journalEntries.find(
        (journal) =>
          journal.status !== 'reversed' &&
          ((journal.sourceType === 'payment' && journal.sourceId === id) ||
            (journal.sourceType === 'transaction' && journal.sourceId === paymentEntry?.id)),
      );
      let nextEntries = data.entries;
      let nextJournalEntries = data.journalEntries;

      if (nextStatus === 'paid') {
        const createdPaymentEntry = paymentEntry ?? invoicePaymentEntry(updatedInvoice);
        nextEntries = paymentEntry ? data.entries : [createdPaymentEntry, ...data.entries];
        if (!paymentJournal) {
          const createdPaymentJournal = numberedJournal(
            paymentEntry
              ? journalFromEntry(createdPaymentEntry)
              : invoicePaymentJournal(updatedInvoice),
            data.journalEntries,
          );
          nextJournalEntries = [createdPaymentJournal, ...data.journalEntries];
        }
      } else {
        nextEntries = data.entries.filter(
          (entry) => entry.invoiceId !== id && entry.id !== paymentEntry?.id,
        );
        if (paymentJournal) {
          const reversal: JournalEntry = {
            id: createId(),
            entryNumber: nextJournalNumber(data.journalEntries),
            description: `عكس تحصيل فاتورة ${invoice.number}`,
            date: todayIso(),
            sourceType: 'reversal',
            sourceId: paymentJournal.id,
            reversalOfId: paymentJournal.id,
            status: 'posted',
            lines: paymentJournal.lines.map((line) => ({
              ...line,
              debit: line.credit,
              credit: line.debit,
            })),
          };
          nextJournalEntries = [
            reversal,
            ...data.journalEntries.map((journal) =>
              journal.id === paymentJournal.id
                ? { ...journal, status: 'reversed' as const }
                : journal,
            ),
          ];
        }
      }

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
