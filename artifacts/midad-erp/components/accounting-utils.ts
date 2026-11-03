export type AccountType = 'asset' | 'liability' | 'equity' | 'revenue' | 'expense';

export type Account = {
  id: string;
  code: string;
  name: string;
  type: AccountType;
  isActive?: boolean;
  parentAccountId?: string | null;
};

export type JournalLine = {
  accountId: string;
  debit: number;
  credit: number;
  currency: string;
  memo?: string;
};

export type JournalStatus = 'draft' | 'posted' | 'reversed';

export type JournalEntry = {
  id: string;
  entryNumber?: string;
  description: string;
  date: string;
  lines: JournalLine[];
  sourceType: 'invoice' | 'payment' | 'transaction' | 'manual' | 'reversal';
  sourceId?: string;
  status?: JournalStatus;
  reversalOfId?: string;
};

export type AccountBalance = {
  debit: number;
  credit: number;
  balance: number;
};

export type GeneralLedgerRow = {
  entryId: string;
  entryNumber: string;
  description: string;
  date: string;
  debit: number;
  credit: number;
  runningBalance: number;
};

export function toMinorUnits(amount: number): number {
  if (!Number.isFinite(amount) || Math.abs(amount) > Number.MAX_SAFE_INTEGER / 100) {
    throw new Error('invalid_amount');
  }
  return Math.round((amount + Math.sign(amount) * Number.EPSILON) * 100);
}

export function isJournalBalanced(lines: JournalLine[]): boolean {
  if (lines.length < 2) return false;

  let debit = 0;
  let credit = 0;
  const accounts = new Set<string>();
  const currency = lines[0]?.currency;
  if (!currency) return false;
  for (const line of lines) {
    if (
      !line.accountId ||
      line.currency !== currency ||
      !Number.isFinite(line.debit) ||
      !Number.isFinite(line.credit) ||
      line.debit < 0 ||
      line.credit < 0 ||
      (line.debit > 0 && line.credit > 0) ||
      (line.debit === 0 && line.credit === 0)
    ) {
      return false;
    }
    debit += toMinorUnits(line.debit);
    credit += toMinorUnits(line.credit);
    accounts.add(line.accountId);
  }
  return accounts.size >= 2 && debit === credit;
}

export function isValidIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

export function getAccountBalances(
  journalEntries: JournalEntry[],
  currency: string,
  accounts: Account[],
): Record<string, AccountBalance> {
  const totals = new Map<string, { debit: number; credit: number }>();
  accounts.forEach((account) => totals.set(account.id, { debit: 0, credit: 0 }));

  journalEntries.forEach((journal) => {
    if (journal.status === 'draft') return;
    journal.lines.forEach((line) => {
      if (line.currency !== currency) return;
      const total = totals.get(line.accountId);
      if (!total) return;
      total.debit += toMinorUnits(line.debit);
      total.credit += toMinorUnits(line.credit);
    });
  });

  return Object.fromEntries(
    accounts.map((account) => {
      const total = totals.get(account.id) ?? { debit: 0, credit: 0 };
      const signed = total.debit - total.credit;
      const debitNormal = account.type === 'asset' || account.type === 'expense';
      return [
        account.id,
        {
          debit: Math.max(signed, 0) / 100,
          credit: Math.max(-signed, 0) / 100,
          balance: (debitNormal ? signed : -signed) / 100,
        },
      ];
    }),
  );
}

export function getTrialBalanceTotals(balances: Record<string, AccountBalance>) {
  const totals = Object.values(balances).reduce(
    (result, balance) => ({
      debit: result.debit + toMinorUnits(balance.debit),
      credit: result.credit + toMinorUnits(balance.credit),
    }),
    { debit: 0, credit: 0 },
  );
  return {
    debit: totals.debit / 100,
    credit: totals.credit / 100,
    isBalanced: totals.debit === totals.credit,
  };
}

export function getGeneralLedgerRows(
  journalEntries: JournalEntry[],
  accountId: string,
  currency: string,
  account: Account,
): GeneralLedgerRow[] {
  const rows = journalEntries.flatMap((entry, index) => {
    if (entry.status === 'draft') return [];
    return entry.lines.flatMap((line) =>
      line.accountId === accountId && line.currency === currency
        ? [{
            entryId: entry.id,
            entryNumber: entry.entryNumber ?? `JE-${String(index + 1).padStart(5, '0')}`,
            description: entry.description,
            date: entry.date,
            debit: line.debit,
            credit: line.credit,
          }]
        : [],
    );
  });

  rows.sort((a, b) => {
    const aHasIsoDate = /^\d{4}-\d{2}-\d{2}$/.test(a.date);
    const bHasIsoDate = /^\d{4}-\d{2}-\d{2}$/.test(b.date);
    if (aHasIsoDate && bHasIsoDate && a.date !== b.date) {
      return a.date.localeCompare(b.date);
    }
    return a.entryNumber.localeCompare(b.entryNumber);
  });

  let runningUnits = 0;
  const debitNormal = account.type === 'asset' || account.type === 'expense';
  return rows.map((row) => {
    runningUnits += toMinorUnits(row.debit) - toMinorUnits(row.credit);
    return {
      ...row,
      runningBalance: (debitNormal ? runningUnits : -runningUnits) / 100,
    };
  });
}

export function nextJournalNumber(journalEntries: JournalEntry[]): string {
  const next = journalEntries.reduce((highest, entry) => {
    const match = entry.entryNumber?.match(/^JE-(\d+)$/i);
    return match ? Math.max(highest, Number(match[1])) : highest;
  }, 0) + 1;
  return `JE-${String(next).padStart(5, '0')}`;
}
