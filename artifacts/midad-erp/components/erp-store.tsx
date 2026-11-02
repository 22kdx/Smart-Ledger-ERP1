import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, useContext, useEffect, useState } from 'react';
import { Alert } from 'react-native';

export type Currency = 'YER' | 'SAR' | 'USD';
export type InvoiceStatus = 'paid' | 'pending';
export type EntryType = 'income' | 'expense';
export type ContactKind = 'customer' | 'supplier';

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
  employees: Employee[];
  contacts: Contact[];
  companyName: string;
  baseCurrency: Currency;
  taxRate: number;
};

export type InvoiceDraft = Omit<Invoice, 'id' | 'number' | 'date'>;
export type ProductDraft = Omit<Product, 'id'>;
export type EntryDraft = Omit<Entry, 'id' | 'date'>;
export type EmployeeDraft = Omit<Employee, 'id'>;
export type ContactDraft = Omit<Contact, 'id'>;

const STORAGE_KEY = '@midad-erp/local-v1';

const seedData: ERPData = {
  companyName: 'مؤسسة مدار للتجارة',
  baseCurrency: 'SAR',
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
  addEmployee: (draft: EmployeeDraft) => void;
  addContact: (draft: ContactDraft) => void;
  toggleInvoiceStatus: (id: string) => void;
  adjustProductStock: (id: string, amount: number) => void;
  updateBaseCurrency: (currency: Currency) => void;
  updateTaxRate: (rate: number) => void;
  updateCompanyName: (name: string) => void;
};

const ERPContext = createContext<ERPContextValue | null>(null);

function createId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
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

export function ERPProvider({ children }: { children: React.ReactNode }) {
  const [data, setData] = useState<ERPData>(seedData);
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
          setData({ ...seedData, ...parsed });
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
      });
    },
    addProduct: (draft) =>
      commit({ ...data, products: [{ ...draft, id: createId() }, ...data.products] }),
    addEntry: (draft) =>
      commit({ ...data, entries: [{ ...draft, id: createId(), date: todayLabel() }, ...data.entries] }),
    addEmployee: (draft) =>
      commit({ ...data, employees: [{ ...draft, id: createId() }, ...data.employees] }),
    addContact: (draft) =>
      commit({ ...data, contacts: [{ ...draft, id: createId() }, ...data.contacts] }),
    toggleInvoiceStatus: (id) => {
      const invoice = data.invoices.find((item) => item.id === id);
      if (!invoice) return;

      const nextStatus: InvoiceStatus = invoice.status === 'paid' ? 'pending' : 'paid';
      const updatedInvoice = { ...invoice, status: nextStatus };
      const nextEntries =
        nextStatus === 'paid'
          ? data.entries.some((entry) => entry.invoiceId === id)
            ? data.entries
            : [invoicePaymentEntry(updatedInvoice), ...data.entries]
          : data.entries.filter((entry) => entry.invoiceId !== id);

      commit({
        ...data,
        invoices: data.invoices.map((item) => (item.id === id ? updatedInvoice : item)),
        entries: nextEntries,
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
    updateTaxRate: (taxRate) =>
      commit({ ...data, taxRate: Math.min(100, Math.max(0, taxRate)) }),
    updateCompanyName: (companyName) => commit({ ...data, companyName }),
  };

  return <ERPContext.Provider value={value}>{children}</ERPContext.Provider>;
}

export function useERP() {
  const context = useContext(ERPContext);
  if (!context) throw new Error('useERP must be used inside ERPProvider');
  return context;
}
