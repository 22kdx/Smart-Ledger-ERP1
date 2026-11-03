import assert from 'node:assert/strict';
import test from 'node:test';
import {
  ERP_STORAGE_KEY,
  loadERPData,
  saveERPData,
} from '../components/erp-storage.ts';

const defaultCurrencies = [
  { code: 'SAR', name: 'الريال السعودي', isActive: true },
  { code: 'YER', name: 'الريال اليمني', isActive: true },
  { code: 'USD', name: 'الدولار الأمريكي', isActive: true },
];

const fallbackData = {
  companyName: 'مؤسسة مدار للتجارة',
  countryCode: null,
  baseCurrency: 'SAR',
  currencies: defaultCurrencies,
  taxRules: [],
  exchangeRates: [],
  fiscalYearStartMonth: null,
  fiscalYearStartDay: null,
  taxRate: 0,
  invoices: [],
  products: [],
  entries: [],
  employees: [],
  contacts: [],
  accounts: [
    { id: '1000', code: '1000', name: 'النقدية', type: 'asset', isActive: true },
    { id: '1100', code: '1100', name: 'العملاء', type: 'asset', isActive: true },
    { id: '1200', code: '1200', name: 'المخزون', type: 'asset', isActive: true },
    { id: '2000', code: '2000', name: 'الموردون', type: 'liability', isActive: true },
    { id: '3000', code: '3000', name: 'رأس المال', type: 'equity', isActive: true },
    { id: '4000', code: '4000', name: 'إيرادات المبيعات', type: 'revenue', isActive: true },
    { id: '4100', code: '4100', name: 'إيرادات أخرى', type: 'revenue', isActive: true },
    { id: '5000', code: '5000', name: 'مصروفات تشغيلية', type: 'expense', isActive: true },
  ],
};

function createMemoryStorage(initialValue = null) {
  const values = new Map(initialValue === null ? [] : [[ERP_STORAGE_KEY, initialValue]]);
  const writes = [];
  return {
    values,
    writes,
    getItem: async (key) => values.get(key) ?? null,
    setItem: async (key, value) => {
      writes.push([key, value]);
      values.set(key, value);
    },
  };
}

function buildJournal(invoices, entries) {
  return invoices.map((invoice) => ({
    id: `rebuilt-${invoice.id}`,
    sourceId: entries[0]?.id,
    lines: [],
  }));
}

test('loads a legacy snapshot and migrates settings without rewriting stored data', async () => {
  const legacySnapshot = {
    companyName: 'شركة تجريبية',
    baseCurrency: 'SAR',
    taxRate: 15,
    invoices: [{
      id: 'invoice-legacy-1',
      number: 'INV-0099',
      customer: 'عميل قديم',
      amount: 1250,
      currency: 'YER',
      status: 'paid',
      date: '١ نوفمبر',
    }],
    products: [{
      id: 'product-legacy-1',
      name: 'صنف قديم',
      sku: 'OLD-1',
      category: 'عام',
      quantity: 4,
      price: 10,
      currency: 'OMR',
    }],
    entries: [{
      id: 'entry-legacy-1',
      title: 'تحصيل فاتورة INV-0099',
      category: 'تحصيل مبيعات',
      amount: 1250,
      currency: 'YER',
      type: 'income',
      date: '١ نوفمبر',
    }],
    employees: [],
    contacts: [],
  };
  const storedText = JSON.stringify(legacySnapshot);
  const storage = createMemoryStorage(storedText);
  let journalBuilderCalls = 0;

  const restored = await loadERPData(
    storage.getItem,
    fallbackData,
    defaultCurrencies,
    (invoices, entries) => {
      journalBuilderCalls += 1;
      return buildJournal(invoices, entries);
    },
  );

  assert.ok(restored);
  assert.equal(restored.companyName, 'شركة تجريبية');
  assert.deepEqual(restored.invoices, legacySnapshot.invoices);
  assert.deepEqual(restored.products, legacySnapshot.products);
  assert.deepEqual(restored.entries[0], {
    ...legacySnapshot.entries[0],
    invoiceId: 'invoice-legacy-1',
  });
  assert.deepEqual(restored.taxRules, [{
    id: 'legacy-tax-rule',
    name: 'ضريبة القيمة المضافة',
    rate: 15,
    countryCode: null,
    isActive: true,
  }]);
  assert.equal(restored.taxRate, 15);
  assert.ok(restored.currencies.some((currency) => currency.code === 'OMR'));
  assert.equal(journalBuilderCalls, 1);
  assert.deepEqual(restored.journalEntries, [{
    id: 'rebuilt-invoice-legacy-1',
    sourceId: 'entry-legacy-1',
    lines: [],
  }]);

  assert.deepEqual(storage.writes, []);
  assert.equal(storage.values.get(ERP_STORAGE_KEY), storedText);
});

test('saved settings and existing business records survive a simulated app reload', async () => {
  const storage = createMemoryStorage(JSON.stringify({
    ...fallbackData,
    invoices: [{
      id: 'invoice-keep-1',
      number: 'INV-0301',
      customer: 'عميل محفوظ',
      amount: 340,
      currency: 'SAR',
      status: 'pending',
      date: '٢ نوفمبر',
    }],
    products: [{
      id: 'product-keep-1',
      name: 'صنف محفوظ',
      sku: 'KEEP-1',
      category: 'عام',
      quantity: 8,
      price: 12,
      currency: 'SAR',
    }],
    entries: [],
    employees: [],
    contacts: [],
  }));

  const initial = await loadERPData(
    storage.getItem,
    fallbackData,
    defaultCurrencies,
    buildJournal,
  );
  assert.ok(initial);

  const updated = {
    ...initial,
    companyName: 'شركة اختبار الإعدادات',
    countryCode: 'YE',
    baseCurrency: 'YER',
    currencies: initial.currencies.map((currency) => ({
      ...currency,
      isActive: currency.code !== 'USD',
    })),
    taxRules: [{
      id: 'test-tax',
      name: 'ضريبة اختبار',
      rate: 8.5,
      countryCode: 'YE',
      isActive: true,
    }],
    taxRate: 8.5,
    exchangeRates: [{
      id: 'test-rate',
      fromCurrency: 'SAR',
      toCurrency: 'YER',
      rate: 140,
      effectiveDate: '2026-11-02',
      source: 'اختبار محلي',
    }],
    fiscalYearStartMonth: 1,
    fiscalYearStartDay: 1,
  };
  await saveERPData(storage.setItem, updated);

  const reopened = await loadERPData(
    storage.getItem,
    fallbackData,
    defaultCurrencies,
    buildJournal,
  );

  assert.ok(reopened);
  assert.equal(storage.writes.length, 1);
  assert.equal(storage.writes[0][0], ERP_STORAGE_KEY);
  assert.equal(reopened.companyName, updated.companyName);
  assert.equal(reopened.countryCode, 'YE');
  assert.equal(reopened.baseCurrency, 'YER');
  assert.equal(reopened.taxRules[0].rate, 8.5);
  assert.deepEqual(reopened.exchangeRates, updated.exchangeRates);
  assert.equal(reopened.fiscalYearStartMonth, 1);
  assert.equal(reopened.fiscalYearStartDay, 1);
  assert.deepEqual(reopened.invoices, updated.invoices);
  assert.deepEqual(reopened.products, updated.products);
});

test('does not overwrite malformed stored data during loading', async () => {
  const invalidValue = '{not valid json';
  const storage = createMemoryStorage(invalidValue);

  await assert.rejects(
    loadERPData(storage.getItem, fallbackData, defaultCurrencies, buildJournal),
    SyntaxError,
  );

  assert.deepEqual(storage.writes, []);
  assert.equal(storage.values.get(ERP_STORAGE_KEY), invalidValue);
});
