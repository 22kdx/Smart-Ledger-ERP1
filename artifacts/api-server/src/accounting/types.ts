export type AccountType =
  | "asset"
  | "liability"
  | "equity"
  | "income"
  | "expense";

export type Account = {
  id: string;
  code: string;
  name: string;
  type: AccountType;
  parentAccountId: string | null;
  isSystem: boolean;
  isActive: boolean;
  createdAt: string;
};

export type AccountCreate = {
  code: string;
  name: string;
  type: AccountType;
  parentAccountId?: string | null;
};

export type AccountUpdate = {
  name?: string;
  parentAccountId?: string | null;
  isActive?: boolean;
};

export type JournalSide = "debit" | "credit";
export type JournalStatus = "draft" | "posted" | "reversed";

export type JournalLineInput = {
  accountId: string;
  side: JournalSide;
  amount: string;
  currency: string;
  memo?: string | null;
};

export type JournalLine = {
  id: string;
  lineNumber: number;
  accountId: string;
  accountCode: string;
  accountName: string;
  side: JournalSide;
  amount: string;
  currency: string;
  memo: string | null;
};

export type JournalEntryInput = {
  entryDate: string;
  description: string;
  reference?: string | null;
  lines: JournalLineInput[];
};

export type JournalEntryUpdate = Partial<JournalEntryInput>;

export type JournalEntry = {
  id: string;
  entryNumber: string;
  entryDate: string;
  description: string;
  reference: string | null;
  status: JournalStatus;
  baseCurrency: string | null;
  reversalOfId: string | null;
  createdBy: string;
  createdAt: string;
  postedAt: string | null;
  lines: JournalLine[];
};

export type JournalListFilters = {
  status?: JournalStatus;
  fromDate?: string;
  toDate?: string;
  limit: number;
  offset: number;
};

export type JournalReversalInput = {
  entryDate: string;
  description?: string;
  reference?: string | null;
};

export type AccountingPeriod = {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
  status: "open" | "closed";
  closedAt: string | null;
};

export type AccountingPeriodCreate = {
  name: string;
  startDate: string;
  endDate: string;
};

export type LedgerLine = {
  journalEntryId: string;
  entryNumber: string;
  entryDate: string;
  description: string;
  debit: string;
  credit: string;
  runningBalance: string;
};

export type GeneralLedger = {
  account: Account;
  currency: string;
  fromDate: string | null;
  toDate: string | null;
  openingBalance: string;
  closingBalance: string;
  totalLines: number;
  nextOffset: number | null;
  lines: LedgerLine[];
};

export type TrialBalanceAccount = {
  account: Account;
  debit: string;
  credit: string;
  balance: string;
};

export type TrialBalance = {
  asOfDate: string;
  currency: string;
  accounts: TrialBalanceAccount[];
  totalDebit: string;
  totalCredit: string;
  isBalanced: boolean;
};

export class AccountingError extends Error {
  constructor(
    readonly statusCode: number,
    readonly code: string,
  ) {
    super(code);
    this.name = "AccountingError";
  }
}

export interface AccountingRepository {
  getCompanyBaseCurrency(companyId: string): Promise<string | null>;
  listAccounts(companyId: string, includeInactive: boolean): Promise<Account[]>;
  createAccount(
    companyId: string,
    actorUserId: string,
    accountId: string,
    input: AccountCreate,
  ): Promise<Account>;
  updateAccount(
    companyId: string,
    actorUserId: string,
    accountId: string,
    update: AccountUpdate,
  ): Promise<Account | null>;
  listJournalEntries(
    companyId: string,
    filters: JournalListFilters,
  ): Promise<JournalEntry[]>;
  getJournalEntry(
    companyId: string,
    journalEntryId: string,
  ): Promise<JournalEntry | null>;
  createDraft(
    companyId: string,
    actorUserId: string,
    entryId: string,
    baseCurrency: string,
    input: JournalEntryInput,
  ): Promise<JournalEntry>;
  updateDraft(
    companyId: string,
    actorUserId: string,
    journalEntryId: string,
    input: JournalEntryInput,
  ): Promise<JournalEntry | null>;
  deleteDraft(
    companyId: string,
    actorUserId: string,
    journalEntryId: string,
  ): Promise<boolean>;
  postDraft(
    companyId: string,
    actorUserId: string,
    journalEntryId: string,
  ): Promise<JournalEntry | null>;
  reverseJournalEntry(
    companyId: string,
    actorUserId: string,
    journalEntryId: string,
    reversalId: string,
    input: Required<Pick<JournalReversalInput, "entryDate">> &
      Omit<JournalReversalInput, "entryDate">,
  ): Promise<JournalEntry | null>;
  listPeriods(companyId: string): Promise<AccountingPeriod[]>;
  createPeriod(
    companyId: string,
    actorUserId: string,
    periodId: string,
    input: AccountingPeriodCreate,
  ): Promise<AccountingPeriod>;
  closePeriod(
    companyId: string,
    actorUserId: string,
    periodId: string,
  ): Promise<AccountingPeriod | null>;
  getGeneralLedger(
    companyId: string,
    accountId: string,
    currency: string,
    fromDate: string | null,
    toDate: string | null,
    limit: number,
    offset: number,
  ): Promise<GeneralLedger | null>;
  getTrialBalance(
    companyId: string,
    asOfDate: string,
    currency: string,
  ): Promise<TrialBalance>;
}
