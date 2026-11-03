import { randomUUID } from "node:crypto";
import {
  formatAmount,
  isAmountBalanced,
  isCalendarDate,
  parseAmount,
} from "./amount";
import type {
  Account,
  AccountCreate,
  AccountUpdate,
  AccountingPeriod,
  AccountingPeriodCreate,
  AccountingRepository,
  GeneralLedger,
  JournalEntry,
  JournalEntryInput,
  JournalEntryUpdate,
  JournalListFilters,
  JournalReversalInput,
  TrialBalance,
} from "./types";
import { AccountingError } from "./types";

export class AccountingService {
  constructor(private readonly repository: AccountingRepository) {}

  listAccounts(companyId: string, includeInactive = false): Promise<Account[]> {
    return this.repository.listAccounts(companyId, includeInactive);
  }

  async createAccount(
    companyId: string,
    actorUserId: string,
    input: AccountCreate,
  ): Promise<Account> {
    const normalized = normalizeAccount(input);
    try {
      return await this.repository.createAccount(
        companyId,
        actorUserId,
        randomUUID(),
        normalized,
      );
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new AccountingError(409, "duplicate_account_code");
      }
      throw error;
    }
  }

  async updateAccount(
    companyId: string,
    actorUserId: string,
    accountId: string,
    input: AccountUpdate,
  ): Promise<Account | null> {
    if (Object.keys(input).length === 0) {
      throw new AccountingError(400, "empty_account_update");
    }
    const update: AccountUpdate = {};
    if (input.name !== undefined) {
      const name = input.name.trim();
      if (!name || name.length > 160) {
        throw new AccountingError(400, "invalid_account_name");
      }
      update.name = name;
    }
    if (input.parentAccountId !== undefined) {
      update.parentAccountId = input.parentAccountId;
    }
    if (input.isActive !== undefined) update.isActive = input.isActive;
    return this.repository.updateAccount(
      companyId,
      actorUserId,
      accountId,
      update,
    );
  }

  listJournalEntries(
    companyId: string,
    filters: Partial<JournalListFilters>,
  ): Promise<JournalEntry[]> {
    const normalized: JournalListFilters = {
      ...filters,
      limit: filters.limit ?? 50,
      offset: filters.offset ?? 0,
    };
    if (
      !Number.isInteger(normalized.limit) ||
      normalized.limit < 1 ||
      normalized.limit > 100 ||
      !Number.isInteger(normalized.offset) ||
      normalized.offset < 0
    ) {
      throw new AccountingError(400, "invalid_journal_pagination");
    }
    if (normalized.fromDate && !isCalendarDate(normalized.fromDate)) {
      throw new AccountingError(400, "invalid_journal_from_date");
    }
    if (normalized.toDate && !isCalendarDate(normalized.toDate)) {
      throw new AccountingError(400, "invalid_journal_to_date");
    }
    if (
      normalized.fromDate &&
      normalized.toDate &&
      normalized.fromDate > normalized.toDate
    ) {
      throw new AccountingError(400, "journal_date_range_reversed");
    }
    return this.repository.listJournalEntries(companyId, normalized);
  }

  getJournalEntry(
    companyId: string,
    journalEntryId: string,
  ): Promise<JournalEntry | null> {
    return this.repository.getJournalEntry(companyId, journalEntryId);
  }

  async createJournalDraft(
    companyId: string,
    actorUserId: string,
    input: JournalEntryInput,
  ): Promise<JournalEntry> {
    const normalized = normalizeJournalInput(input);
    const baseCurrency = await this.requireBaseCurrency(companyId);
    validateLines(normalized.lines, baseCurrency, false);
    return this.repository.createDraft(
      companyId,
      actorUserId,
      randomUUID(),
      baseCurrency,
      normalized,
    );
  }

  async updateJournalDraft(
    companyId: string,
    actorUserId: string,
    journalEntryId: string,
    input: JournalEntryUpdate,
  ): Promise<JournalEntry | null> {
    if (Object.keys(input).length === 0) {
      throw new AccountingError(400, "empty_journal_update");
    }
    const existing = await this.repository.getJournalEntry(
      companyId,
      journalEntryId,
    );
    if (!existing) return null;
    if (existing.status !== "draft") {
      throw new AccountingError(409, "posted_journal_is_immutable");
    }

    const merged = normalizeJournalInput({
      entryDate: input.entryDate ?? existing.entryDate,
      description: input.description ?? existing.description,
      reference: input.reference === undefined ? existing.reference : input.reference,
      lines: input.lines ?? existing.lines.map((line) => ({
        accountId: line.accountId,
        side: line.side,
        amount: line.amount,
        currency: line.currency,
        memo: line.memo,
      })),
    });
    validateLines(merged.lines, existing.baseCurrency ?? "", false);
    return this.repository.updateDraft(
      companyId,
      actorUserId,
      journalEntryId,
      merged,
    );
  }

  deleteJournalDraft(
    companyId: string,
    actorUserId: string,
    journalEntryId: string,
  ): Promise<boolean> {
    return this.repository.deleteDraft(companyId, actorUserId, journalEntryId);
  }

  async postJournalDraft(
    companyId: string,
    actorUserId: string,
    journalEntryId: string,
  ): Promise<JournalEntry | null> {
    const entry = await this.repository.getJournalEntry(
      companyId,
      journalEntryId,
    );
    if (!entry) return null;
    if (entry.status !== "draft") {
      throw new AccountingError(409, "journal_entry_not_draft");
    }
    if (!entry.baseCurrency) {
      throw new AccountingError(409, "company_base_currency_required");
    }
    validateLines(entry.lines, entry.baseCurrency, true);
    return this.repository.postDraft(companyId, actorUserId, journalEntryId);
  }

  async reverseJournalEntry(
    companyId: string,
    actorUserId: string,
    journalEntryId: string,
    input: JournalReversalInput,
  ): Promise<JournalEntry | null> {
    if (!isCalendarDate(input.entryDate)) {
      throw new AccountingError(400, "invalid_reversal_date");
    }
    const original = await this.repository.getJournalEntry(
      companyId,
      journalEntryId,
    );
    if (!original) return null;
    if (original.status !== "posted") {
      throw new AccountingError(409, "journal_entry_not_reversible");
    }
    const description =
      input.description?.trim() || `عكس القيد ${original.entryNumber}`;
    if (description.length > 500) {
      throw new AccountingError(400, "invalid_reversal_description");
    }
    const reference = normalizeReference(input.reference);
    return this.repository.reverseJournalEntry(
      companyId,
      actorUserId,
      journalEntryId,
      randomUUID(),
      { entryDate: input.entryDate, description, reference },
    );
  }

  listPeriods(companyId: string): Promise<AccountingPeriod[]> {
    return this.repository.listPeriods(companyId);
  }

  async createPeriod(
    companyId: string,
    actorUserId: string,
    input: AccountingPeriodCreate,
  ): Promise<AccountingPeriod> {
    const name = input.name.trim();
    if (!name || name.length > 120) {
      throw new AccountingError(400, "invalid_period_name");
    }
    if (
      !isCalendarDate(input.startDate) ||
      !isCalendarDate(input.endDate) ||
      input.startDate > input.endDate
    ) {
      throw new AccountingError(400, "invalid_period_dates");
    }
    return this.repository.createPeriod(companyId, actorUserId, randomUUID(), {
      ...input,
      name,
    });
  }

  closePeriod(
    companyId: string,
    actorUserId: string,
    periodId: string,
  ): Promise<AccountingPeriod | null> {
    return this.repository.closePeriod(companyId, actorUserId, periodId);
  }

  async getGeneralLedger(
    companyId: string,
    accountId: string,
    currency: string,
    fromDate: string | null,
    toDate: string | null,
    limit = 200,
    offset = 0,
  ): Promise<GeneralLedger | null> {
    const normalizedCurrency = normalizeCurrency(currency);
    if (fromDate && !isCalendarDate(fromDate)) {
      throw new AccountingError(400, "invalid_ledger_from_date");
    }
    if (toDate && !isCalendarDate(toDate)) {
      throw new AccountingError(400, "invalid_ledger_to_date");
    }
    if (fromDate && toDate && fromDate > toDate) {
      throw new AccountingError(400, "ledger_date_range_reversed");
    }
    if (
      !Number.isInteger(limit) ||
      limit < 1 ||
      limit > 1000 ||
      !Number.isInteger(offset) ||
      offset < 0
    ) {
      throw new AccountingError(400, "invalid_ledger_pagination");
    }
    return this.repository.getGeneralLedger(
      companyId,
      accountId,
      normalizedCurrency,
      fromDate,
      toDate,
      limit,
      offset,
    );
  }

  async getTrialBalance(
    companyId: string,
    asOfDate: string,
    currency: string,
  ): Promise<TrialBalance> {
    if (!isCalendarDate(asOfDate)) {
      throw new AccountingError(400, "invalid_trial_balance_date");
    }
    return this.repository.getTrialBalance(
      companyId,
      asOfDate,
      normalizeCurrency(currency),
    );
  }

  private async requireBaseCurrency(companyId: string): Promise<string> {
    const currency = await this.repository.getCompanyBaseCurrency(companyId);
    if (!currency) {
      throw new AccountingError(409, "company_base_currency_required");
    }
    return normalizeCurrency(currency);
  }
}

function normalizeAccount(input: AccountCreate): AccountCreate {
  const code = input.code.trim().toUpperCase();
  const name = input.name.trim();
  if (!/^[A-Z0-9._-]{1,32}$/.test(code)) {
    throw new AccountingError(400, "invalid_account_code");
  }
  if (!name || name.length > 160) {
    throw new AccountingError(400, "invalid_account_name");
  }
  return { ...input, code, name };
}

function normalizeJournalInput(input: JournalEntryInput): JournalEntryInput {
  const entryDate = input.entryDate.trim();
  const description = input.description.trim();
  if (!isCalendarDate(entryDate)) {
    throw new AccountingError(400, "invalid_journal_date");
  }
  if (description.length < 2 || description.length > 500) {
    throw new AccountingError(400, "invalid_journal_description");
  }
  if (!Array.isArray(input.lines) || input.lines.length > 100) {
    throw new AccountingError(400, "invalid_journal_lines");
  }
  const reference = normalizeReference(input.reference);
  const lines = input.lines.map((line) => {
    const amount = parseAmount(line.amount);
    const currency = normalizeCurrency(line.currency);
    if (!amount || amount <= 0n) {
      throw new AccountingError(400, "invalid_journal_line_amount");
    }
    if (line.side !== "debit" && line.side !== "credit") {
      throw new AccountingError(400, "invalid_journal_line_side");
    }
    if (!line.accountId) {
      throw new AccountingError(400, "journal_account_required");
    }
    const memo = line.memo?.trim() ?? null;
    if (memo && memo.length > 500) {
      throw new AccountingError(400, "invalid_journal_line_memo");
    }
    return {
      accountId: line.accountId,
      side: line.side,
      amount: formatAmount(amount),
      currency,
      memo,
    };
  });
  return { entryDate, description, reference, lines };
}

function validateLines(
  lines: JournalEntry["lines"] | JournalEntryInput["lines"],
  baseCurrency: string,
  requireBalanced: boolean,
): void {
  if (lines.length > 100) {
    throw new AccountingError(400, "too_many_journal_lines");
  }
  if (requireBalanced && (lines.length < 2 || !isAmountBalanced(lines))) {
    throw new AccountingError(409, "journal_entry_unbalanced");
  }
  const accountIds = new Set<string>();
  for (const line of lines) {
    const amount = parseAmount(line.amount);
    if (!amount || amount <= 0n) {
      throw new AccountingError(400, "invalid_journal_line_amount");
    }
    if (line.currency.toUpperCase() !== baseCurrency.toUpperCase()) {
      throw new AccountingError(409, "journal_currency_must_match_base_currency");
    }
    accountIds.add(line.accountId);
  }
  if (requireBalanced && accountIds.size < 2) {
    throw new AccountingError(409, "journal_requires_distinct_accounts");
  }
}

function normalizeCurrency(currency: string): string {
  const normalized = currency.trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(normalized)) {
    throw new AccountingError(400, "invalid_currency");
  }
  return normalized;
}

function normalizeReference(reference?: string | null): string | null {
  const normalized = reference?.trim() || null;
  if (normalized && normalized.length > 100) {
    throw new AccountingError(400, "invalid_journal_reference");
  }
  return normalized;
}

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "23505"
  );
}
