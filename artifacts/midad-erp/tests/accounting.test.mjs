import assert from 'node:assert/strict';
import test from 'node:test';
import {
  getAccountBalances,
  countUndatedJournalEntries,
  getJournalEntriesInDateRange,
  getJournalEntriesThroughDate,
  getGeneralLedgerRows,
  getTrialBalanceTotals,
  isJournalBalanced,
  nextJournalNumber,
} from '../components/accounting-utils.ts';

const accounts = [
  { id: 'cash', code: '1000', name: 'النقدية', type: 'asset' },
  { id: 'revenue', code: '4000', name: 'الإيرادات', type: 'revenue' },
  { id: 'expense', code: '5000', name: 'المصروفات', type: 'expense' },
];

const postedEntries = [
  {
    id: 'sale',
    entryNumber: 'JE-00001',
    description: 'بيع نقدي',
    date: '2026-11-01',
    status: 'posted',
    sourceType: 'manual',
    lines: [
      { accountId: 'cash', debit: 100, credit: 0, currency: 'SAR' },
      { accountId: 'revenue', debit: 0, credit: 100, currency: 'SAR' },
    ],
  },
  {
    id: 'rent',
    entryNumber: 'JE-00002',
    description: 'دفع إيجار',
    date: '2026-11-02',
    status: 'posted',
    sourceType: 'manual',
    lines: [
      { accountId: 'expense', debit: 20, credit: 0, currency: 'SAR' },
      { accountId: 'cash', debit: 0, credit: 20, currency: 'SAR' },
    ],
  },
  {
    id: 'draft',
    entryNumber: 'JE-00003',
    description: 'مسودة لا تدخل التقارير',
    date: '2026-11-03',
    status: 'draft',
    sourceType: 'manual',
    lines: [
      { accountId: 'cash', debit: 50, credit: 0, currency: 'SAR' },
      { accountId: 'revenue', debit: 0, credit: 50, currency: 'SAR' },
    ],
  },
];

test('validates balanced multi-line journals in minor currency units', () => {
  assert.equal(isJournalBalanced([
    { accountId: 'cash', debit: 125.25, credit: 0, currency: 'SAR' },
    { accountId: 'expense', debit: 24.75, credit: 0, currency: 'SAR' },
    { accountId: 'revenue', debit: 0, credit: 150, currency: 'SAR' },
  ]), true);
  assert.equal(isJournalBalanced([
    { accountId: 'cash', debit: 10, credit: 0, currency: 'SAR' },
    { accountId: 'revenue', debit: 0, credit: 9.99, currency: 'SAR' },
  ]), false);
});

test('calculates posted balances and excludes drafts', () => {
  const balances = getAccountBalances(postedEntries, 'SAR', accounts);
  assert.deepEqual(balances, {
    cash: { debit: 80, credit: 0, balance: 80 },
    revenue: { debit: 0, credit: 100, balance: 100 },
    expense: { debit: 20, credit: 0, balance: 20 },
  });
  assert.deepEqual(getTrialBalanceTotals(balances), {
    debit: 100,
    credit: 100,
    isBalanced: true,
  });
  assert.equal(getAccountBalances(postedEntries, 'USD', accounts).cash.balance, 0);
});

test('builds a chronological account ledger with running balances', () => {
  const rows = getGeneralLedgerRows(postedEntries, 'cash', 'SAR', accounts[0]);
  assert.deepEqual(rows.map(({ entryNumber, debit, credit, runningBalance }) => ({
    entryNumber,
    debit,
    credit,
    runningBalance,
  })), [
    { entryNumber: 'JE-00001', debit: 100, credit: 0, runningBalance: 100 },
    { entryNumber: 'JE-00002', debit: 0, credit: 20, runningBalance: 80 },
  ]);
});

test('allocates the next journal number without collisions', () => {
  assert.equal(nextJournalNumber(postedEntries), 'JE-00004');
  assert.equal(nextJournalNumber([]), 'JE-00001');
});

test('filters reports by valid ISO dates while retaining all-history behavior', () => {
  const withUndated = [
    ...postedEntries,
    {
      id: 'legacy',
      entryNumber: 'JE-00004',
      description: 'سجل قديم بلا تاريخ معياري',
      date: 'أمس',
      status: 'posted',
      sourceType: 'manual',
      lines: [
        { accountId: 'cash', debit: 7, credit: 0, currency: 'SAR' },
        { accountId: 'revenue', debit: 0, credit: 7, currency: 'SAR' },
      ],
    },
  ];

  assert.deepEqual(
    getJournalEntriesInDateRange(withUndated, '2026-11-01', '2026-11-01').map((entry) => entry.id),
    ['sale'],
  );
  assert.deepEqual(
    getJournalEntriesThroughDate(withUndated, '2026-11-01').map((entry) => entry.id),
    ['sale'],
  );
  assert.equal(getJournalEntriesInDateRange(withUndated).length, withUndated.length);
  assert.equal(countUndatedJournalEntries(withUndated), 1);
  assert.equal(countUndatedJournalEntries(withUndated.filter((entry) => entry.id !== 'legacy')), 0);
});

test('rejects invalid dates and unsafe monetary values without throwing', () => {
  assert.equal(isJournalBalanced([
    { accountId: 'cash', debit: Number.MAX_VALUE, credit: 0, currency: 'SAR' },
    { accountId: 'revenue', debit: 0, credit: Number.MAX_VALUE, currency: 'SAR' },
  ]), false);
});
