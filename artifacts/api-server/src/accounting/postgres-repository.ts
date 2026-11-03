import { randomUUID } from "node:crypto";
import type { Pool, PoolClient } from "pg";
import { formatAmount, parseAmount } from "./amount";
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
  JournalListFilters,
  JournalReversalInput,
  TrialBalance,
  TrialBalanceAccount,
} from "./types";
import { AccountingError } from "./types";

type AccountRow = {
  id: string;
  code: string;
  name: string;
  type: Account["type"];
  parent_account_id: string | null;
  is_system: boolean;
  is_active: boolean;
  created_at: string | Date;
};

type JournalRow = {
  id: string;
  entry_number: string;
  entry_date: string;
  description: string;
  reference: string | null;
  status: JournalEntry["status"];
  base_currency: string | null;
  reversal_of_id: string | null;
  created_by: string;
  created_at: string | Date;
  posted_at: string | Date | null;
};

type JournalLineRow = {
  id: string;
  journal_entry_id: string;
  line_number: number;
  account_id: string;
  account_code: string;
  account_name: string;
  memo: string | null;
  debit: string;
  credit: string;
  transaction_currency: string;
  transaction_amount: string;
};

type PeriodRow = {
  id: string;
  name: string;
  start_date: string;
  end_date: string;
  status: AccountingPeriod["status"];
  closed_at: string | Date | null;
};

const ACCOUNT_COLUMNS =
  "id, code, name, type, parent_account_id, is_system, is_active, created_at";
const JOURNAL_COLUMNS =
  "id, entry_number, entry_date::text AS entry_date, description, reference, status, base_currency, reversal_of_id, created_by, created_at, posted_at";
const PERIOD_COLUMNS =
  "id, name, start_date::text AS start_date, end_date::text AS end_date, status, closed_at";

export class PostgresAccountingRepository implements AccountingRepository {
  constructor(private readonly pool: Pool) {}

  async getCompanyBaseCurrency(companyId: string): Promise<string | null> {
    const result = await this.pool.query<{ base_currency: string | null }>(
      "SELECT base_currency FROM companies WHERE id = $1::uuid",
      [companyId],
    );
    return result.rows[0]?.base_currency ?? null;
  }

  async listAccounts(
    companyId: string,
    includeInactive: boolean,
  ): Promise<Account[]> {
    const result = await this.pool.query<AccountRow>(
      `SELECT ${ACCOUNT_COLUMNS}
       FROM chart_accounts
       WHERE company_id = $1::uuid
         AND ($2::boolean OR is_active)
       ORDER BY code, id`,
      [companyId, includeInactive],
    );
    return result.rows.map(mapAccount);
  }

  async createAccount(
    companyId: string,
    actorUserId: string,
    accountId: string,
    input: AccountCreate,
  ): Promise<Account> {
    return this.transaction(async (client) => {
      if (input.parentAccountId) {
        await assertValidParent(client, companyId, input.parentAccountId);
      }
      const result = await client.query<AccountRow>(
        `INSERT INTO chart_accounts
          (id, company_id, code, name, type, parent_account_id)
         VALUES ($1::uuid, $2::uuid, $3, $4, $5, $6::uuid)
         RETURNING ${ACCOUNT_COLUMNS}`,
        [
          accountId,
          companyId,
          input.code,
          input.name,
          input.type,
          input.parentAccountId ?? null,
        ],
      );
      const account = mapAccount(result.rows[0]);
      await writeAudit(
        client,
        companyId,
        actorUserId,
        "account.created",
        "account",
        accountId,
        { code: account.code, type: account.type },
      );
      return account;
    });
  }

  async updateAccount(
    companyId: string,
    actorUserId: string,
    accountId: string,
    update: AccountUpdate,
  ): Promise<Account | null> {
    return this.transaction(async (client) => {
      const currentResult = await client.query<AccountRow>(
        `SELECT ${ACCOUNT_COLUMNS}
         FROM chart_accounts
         WHERE company_id = $1::uuid AND id = $2::uuid
         FOR UPDATE`,
        [companyId, accountId],
      );
      const current = currentResult.rows[0];
      if (!current) return null;

      if (update.parentAccountId !== undefined && update.parentAccountId !== null) {
        if (update.parentAccountId === accountId) {
          throw new AccountingError(409, "account_parent_cycle");
        }
        await assertValidParent(client, companyId, update.parentAccountId);
        const cycle = await client.query<{ would_cycle: boolean }>(
          `WITH RECURSIVE descendants(id) AS (
             SELECT id FROM chart_accounts
             WHERE company_id = $1::uuid AND parent_account_id = $2::uuid
             UNION
             SELECT child.id FROM chart_accounts AS child
             JOIN descendants AS parent ON child.parent_account_id = parent.id
             WHERE child.company_id = $1::uuid
           )
           SELECT EXISTS (
             SELECT 1 FROM descendants WHERE id = $3::uuid
           ) AS would_cycle`,
          [companyId, accountId, update.parentAccountId],
        );
        if (cycle.rows[0]?.would_cycle) {
          throw new AccountingError(409, "account_parent_cycle");
        }
      }

      if (update.isActive === false && current.is_system) {
        throw new AccountingError(409, "system_account_cannot_be_deactivated");
      }
      if (update.isActive === false) {
        const drafts = await client.query<{ exists: boolean }>(
          `SELECT EXISTS (
             SELECT 1
             FROM journal_lines AS line
             JOIN journal_entries AS entry ON entry.id = line.journal_entry_id
             WHERE entry.company_id = $1::uuid
               AND line.account_id = $2::uuid
               AND entry.status = 'draft'
           ) AS exists`,
          [companyId, accountId],
        );
        if (drafts.rows[0]?.exists) {
          throw new AccountingError(409, "account_has_draft_entries");
        }
      }

      const values: unknown[] = [companyId, accountId];
      const assignments: string[] = [];
      if (update.name !== undefined) {
        values.push(update.name);
        assignments.push(`name = $${values.length}`);
      }
      if (update.parentAccountId !== undefined) {
        values.push(update.parentAccountId);
        assignments.push(`parent_account_id = $${values.length}::uuid`);
      }
      if (update.isActive !== undefined) {
        values.push(update.isActive);
        assignments.push(`is_active = $${values.length}`);
      }
      if (assignments.length === 0) return mapAccount(current);

      const result = await client.query<AccountRow>(
        `UPDATE chart_accounts
         SET ${assignments.join(", ")}
         WHERE company_id = $1::uuid AND id = $2::uuid
         RETURNING ${ACCOUNT_COLUMNS}`,
        values,
      );
      const account = mapAccount(result.rows[0]);
      await writeAudit(
        client,
        companyId,
        actorUserId,
        "account.updated",
        "account",
        accountId,
        { before: mapAccount(current), after: account },
      );
      return account;
    });
  }

  async listJournalEntries(
    companyId: string,
    filters: JournalListFilters,
  ): Promise<JournalEntry[]> {
    const values: unknown[] = [companyId];
    const conditions = ["company_id = $1::uuid"];
    if (filters.status) {
      values.push(filters.status);
      conditions.push(`status = $${values.length}`);
    }
    if (filters.fromDate) {
      values.push(filters.fromDate);
      conditions.push(`entry_date >= $${values.length}::date`);
    }
    if (filters.toDate) {
      values.push(filters.toDate);
      conditions.push(`entry_date <= $${values.length}::date`);
    }
    values.push(filters.limit, filters.offset);
    const result = await this.pool.query<JournalRow>(
      `SELECT ${JOURNAL_COLUMNS}
       FROM journal_entries
       WHERE ${conditions.join(" AND ")}
       ORDER BY entry_date DESC, created_at DESC, entry_number DESC
       LIMIT $${values.length - 1} OFFSET $${values.length}`,
      values,
    );
    return loadEntries(this.pool, result.rows);
  }

  async getJournalEntry(
    companyId: string,
    journalEntryId: string,
  ): Promise<JournalEntry | null> {
    const result = await this.pool.query<JournalRow>(
      `SELECT ${JOURNAL_COLUMNS}
       FROM journal_entries
       WHERE company_id = $1::uuid AND id = $2::uuid`,
      [companyId, journalEntryId],
    );
    const entries = await loadEntries(this.pool, result.rows);
    return entries[0] ?? null;
  }

  async createDraft(
    companyId: string,
    actorUserId: string,
    entryId: string,
    baseCurrency: string,
    input: JournalEntryInput,
  ): Promise<JournalEntry> {
    return this.transaction(async (client) => {
      await assertCurrentBaseCurrency(client, companyId, baseCurrency);
      await assertActiveCompanyAccounts(
        client,
        companyId,
        input.lines.map((line) => line.accountId),
      );
      const draftNumber = `DRAFT-${entryId.slice(0, 8).toUpperCase()}`;
      await client.query(
        `INSERT INTO journal_entries
          (id, company_id, entry_number, entry_date, description, reference,
           status, created_by, base_currency)
         VALUES ($1::uuid, $2::uuid, $3, $4::date, $5, $6, 'draft', $7, $8)`,
        [
          entryId,
          companyId,
          draftNumber,
          input.entryDate,
          input.description,
          input.reference ?? null,
          actorUserId,
          baseCurrency,
        ],
      );
      await insertLines(client, entryId, input.lines);
      await writeAudit(
        client,
        companyId,
        actorUserId,
        "journal.draft_created",
        "journal_entry",
        entryId,
        { lineCount: input.lines.length },
      );
      const entry = await loadEntryById(client, companyId, entryId);
      if (!entry) throw new Error("Created journal draft could not be loaded.");
      return entry;
    });
  }

  async updateDraft(
    companyId: string,
    actorUserId: string,
    journalEntryId: string,
    input: JournalEntryInput,
  ): Promise<JournalEntry | null> {
    return this.transaction(async (client) => {
      const current = await lockJournal(client, companyId, journalEntryId);
      if (!current) return null;
      if (current.status !== "draft") {
        throw new AccountingError(409, "posted_journal_is_immutable");
      }
      if (!current.base_currency) {
        throw new AccountingError(409, "company_base_currency_required");
      }
      await assertCurrentBaseCurrency(client, companyId, current.base_currency);
      await assertActiveCompanyAccounts(
        client,
        companyId,
        input.lines.map((line) => line.accountId),
      );
      await client.query(
        `UPDATE journal_entries
         SET entry_date = $3::date, description = $4, reference = $5
         WHERE company_id = $1::uuid AND id = $2::uuid`,
        [
          companyId,
          journalEntryId,
          input.entryDate,
          input.description,
          input.reference ?? null,
        ],
      );
      await client.query(
        "DELETE FROM journal_lines WHERE journal_entry_id = $1::uuid",
        [journalEntryId],
      );
      await insertLines(client, journalEntryId, input.lines);
      await writeAudit(
        client,
        companyId,
        actorUserId,
        "journal.draft_updated",
        "journal_entry",
        journalEntryId,
        { actorUserId, lineCount: input.lines.length },
      );
      const entry = await loadEntryById(client, companyId, journalEntryId);
      if (!entry) throw new Error("Updated journal draft could not be loaded.");
      return entry;
    });
  }

  async deleteDraft(
    companyId: string,
    actorUserId: string,
    journalEntryId: string,
  ): Promise<boolean> {
    return this.transaction(async (client) => {
      const current = await lockJournal(client, companyId, journalEntryId);
      if (!current) return false;
      if (current.status !== "draft") {
        throw new AccountingError(409, "posted_journal_cannot_be_deleted");
      }
      await writeAudit(
        client,
        companyId,
        actorUserId,
        "journal.draft_deleted",
        "journal_entry",
        journalEntryId,
        { entryNumber: current.entry_number },
      );
      await client.query(
        "DELETE FROM journal_entries WHERE company_id = $1::uuid AND id = $2::uuid",
        [companyId, journalEntryId],
      );
      return true;
    });
  }

  async postDraft(
    companyId: string,
    actorUserId: string,
    journalEntryId: string,
  ): Promise<JournalEntry | null> {
    return this.transaction(async (client) => {
      const current = await lockJournal(client, companyId, journalEntryId);
      if (!current) return null;
      if (current.status !== "draft") {
        throw new AccountingError(409, "journal_entry_not_draft");
      }
      if (!current.base_currency) {
        throw new AccountingError(409, "company_base_currency_required");
      }
      await assertCurrentBaseCurrency(client, companyId, current.base_currency);
      const totals = await client.query<{
        line_count: number;
        account_count: number;
        valid_account_count: number;
        debit_total: string;
        credit_total: string;
        invalid_currency_count: number;
      }>(
        `SELECT
           COUNT(line.id)::int AS line_count,
           COUNT(DISTINCT line.account_id)::int AS account_count,
           COUNT(*) FILTER (
             WHERE account.id IS NOT NULL
               AND account.company_id = $1::uuid
               AND account.is_active
           )::int AS valid_account_count,
           COALESCE(SUM(line.debit), 0)::text AS debit_total,
           COALESCE(SUM(line.credit), 0)::text AS credit_total,
           COUNT(*) FILTER (
             WHERE line.transaction_currency <> $3
               OR line.exchange_rate <> 1
               OR line.transaction_amount <> line.debit + line.credit
           )::int AS invalid_currency_count
         FROM journal_lines AS line
         LEFT JOIN chart_accounts AS account ON account.id = line.account_id
         WHERE line.journal_entry_id = $2::uuid`,
        [companyId, journalEntryId, current.base_currency],
      );
      const summary = totals.rows[0];
      const debits = parseAmount(summary.debit_total);
      const credits = parseAmount(summary.credit_total);
      if (
        summary.line_count < 2 ||
        summary.account_count < 2 ||
        summary.valid_account_count !== summary.line_count
      ) {
        throw new AccountingError(409, "journal_requires_two_active_accounts");
      }
      if (summary.invalid_currency_count > 0) {
        throw new AccountingError(409, "journal_currency_must_match_base_currency");
      }
      if (debits === null || credits === null || debits !== credits) {
        throw new AccountingError(409, "journal_entry_unbalanced");
      }
      await assertDateInOpenPeriod(client, companyId, current.entry_date);
      const sequence = await nextJournalSequence(client, companyId);
      const entryNumber = `JE-${String(sequence).padStart(8, "0")}`;
      await client.query(
        `UPDATE journal_entries
         SET entry_number = $3, status = 'posted', posted_at = now(), posted_by = $4
         WHERE company_id = $1::uuid AND id = $2::uuid`,
        [companyId, journalEntryId, entryNumber, actorUserId],
      );
      await writeAudit(
        client,
        companyId,
        actorUserId,
        "journal.posted",
        "journal_entry",
        journalEntryId,
        { entryNumber },
      );
      const entry = await loadEntryById(client, companyId, journalEntryId);
      if (!entry) throw new Error("Posted journal entry could not be loaded.");
      return entry;
    });
  }

  async reverseJournalEntry(
    companyId: string,
    actorUserId: string,
    journalEntryId: string,
    reversalId: string,
    input: Required<Pick<JournalReversalInput, "entryDate">> &
      Omit<JournalReversalInput, "entryDate">,
  ): Promise<JournalEntry | null> {
    return this.transaction(async (client) => {
      const original = await lockJournal(client, companyId, journalEntryId);
      if (!original) return null;
      if (original.status !== "posted" || !original.base_currency) {
        throw new AccountingError(409, "journal_entry_not_reversible");
      }
      await assertDateInOpenPeriod(client, companyId, input.entryDate);
      const existingReversal = await client.query<{ exists: boolean }>(
        `SELECT EXISTS (
           SELECT 1 FROM journal_entries
           WHERE company_id = $1::uuid AND reversal_of_id = $2::uuid
         ) AS exists`,
        [companyId, journalEntryId],
      );
      if (existingReversal.rows[0]?.exists) {
        throw new AccountingError(409, "journal_entry_already_reversed");
      }

      const sequence = await nextJournalSequence(client, companyId);
      const entryNumber = `JE-${String(sequence).padStart(8, "0")}`;
      const description = input.description ?? `عكس القيد ${original.entry_number}`;
      await client.query(
        `INSERT INTO journal_entries
          (id, company_id, entry_number, entry_date, description, reference,
           status, created_by, base_currency, posted_at, posted_by, reversal_of_id)
         VALUES ($1::uuid, $2::uuid, $3, $4::date, $5, $6, 'posted', $7, $8, now(), $7, $9::uuid)`,
        [
          reversalId,
          companyId,
          entryNumber,
          input.entryDate,
          description,
          input.reference ?? null,
          actorUserId,
          original.base_currency,
          journalEntryId,
        ],
      );
      await client.query(
        `INSERT INTO journal_lines
          (id, journal_entry_id, line_number, account_id, memo, debit, credit,
           transaction_currency, transaction_amount, exchange_rate)
         SELECT gen_random_uuid(), $2::uuid, line_number, account_id, memo,
                credit, debit, transaction_currency, transaction_amount, exchange_rate
         FROM journal_lines
         WHERE journal_entry_id = $1::uuid
         ORDER BY line_number`,
        [journalEntryId, reversalId],
      );
      await client.query(
        `UPDATE journal_entries
         SET status = 'reversed', reversed_at = now()
         WHERE company_id = $1::uuid AND id = $2::uuid`,
        [companyId, journalEntryId],
      );
      await writeAudit(
        client,
        companyId,
        actorUserId,
        "journal.reversed",
        "journal_entry",
        journalEntryId,
        { reversalId, reversalEntryNumber: entryNumber },
      );
      const reversal = await loadEntryById(client, companyId, reversalId);
      if (!reversal) throw new Error("Reversal entry could not be loaded.");
      return reversal;
    });
  }

  async listPeriods(companyId: string): Promise<AccountingPeriod[]> {
    const result = await this.pool.query<PeriodRow>(
      `SELECT ${PERIOD_COLUMNS}
       FROM accounting_periods
       WHERE company_id = $1::uuid
       ORDER BY start_date DESC, id`,
      [companyId],
    );
    return result.rows.map(mapPeriod);
  }

  async createPeriod(
    companyId: string,
    actorUserId: string,
    periodId: string,
    input: AccountingPeriodCreate,
  ): Promise<AccountingPeriod> {
    return this.transaction(async (client) => {
      const company = await client.query(
        "SELECT id FROM companies WHERE id = $1::uuid FOR UPDATE",
        [companyId],
      );
      if (company.rowCount !== 1) {
        throw new AccountingError(404, "company_not_found");
      }
      const overlap = await client.query<{ exists: boolean }>(
        `SELECT EXISTS (
           SELECT 1 FROM accounting_periods
           WHERE company_id = $1::uuid
             AND start_date <= $3::date
             AND end_date >= $2::date
         ) AS exists`,
        [companyId, input.startDate, input.endDate],
      );
      if (overlap.rows[0]?.exists) {
        throw new AccountingError(409, "accounting_period_overlap");
      }
      const result = await client.query<PeriodRow>(
        `INSERT INTO accounting_periods
          (id, company_id, name, start_date, end_date, created_by)
         VALUES ($1::uuid, $2::uuid, $3, $4::date, $5::date, $6)
         RETURNING ${PERIOD_COLUMNS}`,
        [
          periodId,
          companyId,
          input.name,
          input.startDate,
          input.endDate,
          actorUserId,
        ],
      );
      await writeAudit(
        client,
        companyId,
        actorUserId,
        "period.created",
        "accounting_period",
        periodId,
        { startDate: input.startDate, endDate: input.endDate },
      );
      return mapPeriod(result.rows[0]);
    });
  }

  async closePeriod(
    companyId: string,
    actorUserId: string,
    periodId: string,
  ): Promise<AccountingPeriod | null> {
    return this.transaction(async (client) => {
      const result = await client.query<PeriodRow>(
        `SELECT ${PERIOD_COLUMNS}
         FROM accounting_periods
         WHERE company_id = $1::uuid AND id = $2::uuid
         FOR UPDATE`,
        [companyId, periodId],
      );
      const period = result.rows[0];
      if (!period) return null;
      if (period.status !== "open") {
        throw new AccountingError(409, "accounting_period_already_closed");
      }
      const drafts = await client.query<{ count: number }>(
        `SELECT COUNT(*)::int AS count
         FROM journal_entries
         WHERE company_id = $1::uuid
           AND status = 'draft'
           AND entry_date BETWEEN $2::date AND $3::date`,
        [companyId, period.start_date, period.end_date],
      );
      if (drafts.rows[0]?.count > 0) {
        throw new AccountingError(409, "accounting_period_has_drafts");
      }
      const closed = await client.query<PeriodRow>(
        `UPDATE accounting_periods
         SET status = 'closed', closed_by = $3, closed_at = now()
         WHERE company_id = $1::uuid AND id = $2::uuid
         RETURNING ${PERIOD_COLUMNS}`,
        [companyId, periodId, actorUserId],
      );
      await writeAudit(
        client,
        companyId,
        actorUserId,
        "period.closed",
        "accounting_period",
        periodId,
        { closedBy: actorUserId },
      );
      return closed.rows[0] ? mapPeriod(closed.rows[0]) : null;
    });
  }

  async getGeneralLedger(
    companyId: string,
    accountId: string,
    currency: string,
    fromDate: string | null,
    toDate: string | null,
    limit: number,
    offset: number,
  ): Promise<GeneralLedger | null> {
    const accountResult = await this.pool.query<AccountRow>(
      `SELECT ${ACCOUNT_COLUMNS}
       FROM chart_accounts
       WHERE company_id = $1::uuid AND id = $2::uuid`,
      [companyId, accountId],
    );
    const accountRow = accountResult.rows[0];
    if (!accountRow) return null;

    const openingResult = await this.pool.query<{ opening_balance: string }>(
      `SELECT COALESCE(SUM(line.debit - line.credit), 0)::text AS opening_balance
       FROM journal_entries AS entry
       JOIN journal_lines AS line ON line.journal_entry_id = entry.id
       WHERE entry.company_id = $1::uuid
         AND line.account_id = $2::uuid
         AND entry.status IN ('posted', 'reversed')
         AND entry.base_currency = $3
         AND ($4::date IS NULL OR entry.entry_date < $4::date)`,
      [companyId, accountId, currency, fromDate],
    );
    const openingUnits = parseAmount(openingResult.rows[0].opening_balance) ?? 0n;
    const values = [companyId, accountId, currency, fromDate, toDate, offset, limit];
    const page = await this.pool.query<{
      journal_entry_id: string;
      entry_number: string;
      entry_date: string;
      description: string;
      debit: string;
      credit: string;
      running_delta: string;
      total_lines: number;
      page_opening_delta: string;
    }>(
      `WITH movements AS (
         SELECT
           entry.id AS journal_entry_id,
           entry.entry_number,
           entry.entry_date::text AS entry_date,
           entry.description,
           line.debit::text AS debit,
           line.credit::text AS credit,
           SUM(line.debit - line.credit) OVER (
             ORDER BY entry.entry_date, entry.entry_number, line.line_number
             ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
           )::text AS running_delta,
           row_number() OVER (
             ORDER BY entry.entry_date, entry.entry_number, line.line_number
           )::int AS row_number,
           COUNT(*) OVER ()::int AS total_lines
         FROM journal_entries AS entry
         JOIN journal_lines AS line ON line.journal_entry_id = entry.id
         WHERE entry.company_id = $1::uuid
           AND line.account_id = $2::uuid
           AND entry.status IN ('posted', 'reversed')
           AND entry.base_currency = $3
           AND ($4::date IS NULL OR entry.entry_date >= $4::date)
           AND ($5::date IS NULL OR entry.entry_date <= $5::date)
       ),
       page_opening AS (
         SELECT COALESCE(running_delta::numeric, 0)::text AS balance
         FROM movements
         WHERE row_number = $6
       )
       SELECT
         movements.journal_entry_id,
         movements.entry_number,
         movements.entry_date,
         movements.description,
         movements.debit,
         movements.credit,
         movements.running_delta,
         movements.total_lines,
         COALESCE(page_opening.balance, '0') AS page_opening_delta
       FROM movements
       LEFT JOIN page_opening ON true
       WHERE movements.row_number > $6
         AND movements.row_number <= $6 + $7
       ORDER BY movements.row_number`,
      values,
    );
    const pageOpeningDelta =
      page.rows[0]?.page_opening_delta === "0"
        ? 0n
        : parseSignedAmount(page.rows[0]?.page_opening_delta ?? "0");
    const openingBalance = openingUnits + pageOpeningDelta;
    let running = openingBalance;
    const lines = page.rows.map((row) => {
      const debit = parseAmount(row.debit) ?? 0n;
      const credit = parseAmount(row.credit) ?? 0n;
      running += debit - credit;
      return {
        journalEntryId: row.journal_entry_id,
        entryNumber: row.entry_number,
        entryDate: row.entry_date,
        description: row.description,
        debit: normalizeAmount(row.debit),
        credit: normalizeAmount(row.credit),
        runningBalance: formatAmount(running),
      };
    });
    const totalLines = page.rows[0]?.total_lines ?? 0;
    const nextOffset = offset + lines.length < totalLines ? offset + lines.length : null;
    return {
      account: mapAccount(accountRow),
      currency,
      fromDate,
      toDate,
      openingBalance: formatAmount(openingBalance),
      closingBalance: formatAmount(running),
      totalLines,
      nextOffset,
      lines,
    };
  }

  async getTrialBalance(
    companyId: string,
    asOfDate: string,
    currency: string,
  ): Promise<TrialBalance> {
    const result = await this.pool.query<
      AccountRow & { debit: string; credit: string }
    >(
      `SELECT
         account.id,
         account.code,
         account.name,
         account.type,
         account.parent_account_id,
         account.is_system,
         account.is_active,
         account.created_at,
         COALESCE(SUM(line.debit), 0)::text AS debit,
         COALESCE(SUM(line.credit), 0)::text AS credit
       FROM chart_accounts AS account
       LEFT JOIN journal_lines AS line ON line.account_id = account.id
       LEFT JOIN journal_entries AS entry
         ON entry.id = line.journal_entry_id
        AND entry.company_id = account.company_id
        AND entry.status IN ('posted', 'reversed')
        AND entry.base_currency = $3
        AND entry.entry_date <= $2::date
       WHERE account.company_id = $1::uuid
         AND (line.id IS NULL OR entry.id IS NOT NULL)
       GROUP BY account.id
       ORDER BY account.code, account.id`,
      [companyId, asOfDate, currency],
    );
    let totalDebit = 0n;
    let totalCredit = 0n;
    const accounts: TrialBalanceAccount[] = result.rows.map((row) => {
      const debit = parseAmount(row.debit) ?? 0n;
      const credit = parseAmount(row.credit) ?? 0n;
      totalDebit += debit;
      totalCredit += credit;
      return {
        account: mapAccount(row),
        debit: normalizeAmount(row.debit),
        credit: normalizeAmount(row.credit),
        balance: formatAmount(debit - credit),
      };
    });
    return {
      asOfDate,
      currency,
      accounts,
      totalDebit: formatAmount(totalDebit),
      totalCredit: formatAmount(totalCredit),
      isBalanced: totalDebit === totalCredit,
    };
  }

  private async transaction<T>(
    action: (client: PoolClient) => Promise<T>,
  ): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const result = await action(client);
      await client.query("COMMIT");
      return result;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }
}

async function assertValidParent(
  client: PoolClient,
  companyId: string,
  parentAccountId: string,
): Promise<void> {
  const parent = await client.query<{ id: string }>(
    `SELECT id FROM chart_accounts
     WHERE company_id = $1::uuid AND id = $2::uuid AND is_active`,
    [companyId, parentAccountId],
  );
  if (!parent.rows[0]) {
    throw new AccountingError(409, "invalid_parent_account");
  }
}

async function assertCurrentBaseCurrency(
  client: PoolClient,
  companyId: string,
  expectedCurrency: string,
): Promise<void> {
  const result = await client.query<{ base_currency: string | null }>(
    "SELECT base_currency FROM companies WHERE id = $1::uuid FOR SHARE",
    [companyId],
  );
  if (!result.rows[0]) throw new AccountingError(404, "company_not_found");
  if (
    !result.rows[0].base_currency ||
    result.rows[0].base_currency.toUpperCase() !== expectedCurrency.toUpperCase()
  ) {
    throw new AccountingError(409, "company_base_currency_changed");
  }
}

async function assertActiveCompanyAccounts(
  client: PoolClient,
  companyId: string,
  accountIds: string[],
): Promise<void> {
  const uniqueIds = [...new Set(accountIds)];
  if (uniqueIds.length === 0) return;
  const result = await client.query<{ id: string }>(
    `SELECT id FROM chart_accounts
     WHERE company_id = $1::uuid
       AND id = ANY($2::uuid[])
       AND is_active`,
    [companyId, uniqueIds],
  );
  if (result.rows.length !== uniqueIds.length) {
    throw new AccountingError(409, "journal_account_unavailable");
  }
}

async function assertDateInOpenPeriod(
  client: PoolClient,
  companyId: string,
  entryDate: string,
): Promise<void> {
  const anyPeriod = await client.query<{ exists: boolean }>(
    "SELECT EXISTS (SELECT 1 FROM accounting_periods WHERE company_id = $1::uuid) AS exists",
    [companyId],
  );
  if (!anyPeriod.rows[0]?.exists) return;
  const openPeriod = await client.query<{ exists: boolean }>(
    `SELECT EXISTS (
       SELECT 1 FROM accounting_periods
       WHERE company_id = $1::uuid
         AND status = 'open'
         AND start_date <= $2::date
         AND end_date >= $2::date
     ) AS exists`,
    [companyId, entryDate],
  );
  if (!openPeriod.rows[0]?.exists) {
    throw new AccountingError(409, "accounting_period_not_open_for_date");
  }
}

async function nextJournalSequence(
  client: PoolClient,
  companyId: string,
): Promise<number> {
  const result = await client.query<{ sequence: number }>(
    `UPDATE companies
     SET next_journal_number = next_journal_number + 1
     WHERE id = $1::uuid
     RETURNING next_journal_number - 1 AS sequence`,
    [companyId],
  );
  if (!result.rows[0]) throw new AccountingError(404, "company_not_found");
  return result.rows[0].sequence;
}

async function insertLines(
  client: PoolClient,
  journalEntryId: string,
  lines: JournalEntryInput["lines"],
): Promise<void> {
  for (const [index, line] of lines.entries()) {
    const amount = line.amount;
    await client.query(
      `INSERT INTO journal_lines
        (id, journal_entry_id, line_number, account_id, memo, debit, credit,
         transaction_currency, transaction_amount, exchange_rate)
       VALUES ($1::uuid, $2::uuid, $3, $4::uuid, $5, $6, $7, $8, $9, 1)`,
      [
        randomUUID(),
        journalEntryId,
        index + 1,
        line.accountId,
        line.memo ?? null,
        line.side === "debit" ? amount : "0",
        line.side === "credit" ? amount : "0",
        line.currency,
        amount,
      ],
    );
  }
}

async function lockJournal(
  client: PoolClient,
  companyId: string,
  journalEntryId: string,
): Promise<JournalRow | null> {
  const result = await client.query<JournalRow>(
    `SELECT ${JOURNAL_COLUMNS}
     FROM journal_entries
     WHERE company_id = $1::uuid AND id = $2::uuid
     FOR UPDATE`,
    [companyId, journalEntryId],
  );
  return result.rows[0] ?? null;
}

async function loadEntryById(
  db: Pool | PoolClient,
  companyId: string,
  journalEntryId: string,
): Promise<JournalEntry | null> {
  const result = await db.query<JournalRow>(
    `SELECT ${JOURNAL_COLUMNS}
     FROM journal_entries
     WHERE company_id = $1::uuid AND id = $2::uuid`,
    [companyId, journalEntryId],
  );
  const entries = await loadEntries(db, result.rows);
  return entries[0] ?? null;
}

async function loadEntries(
  db: Pool | PoolClient,
  rows: JournalRow[],
): Promise<JournalEntry[]> {
  if (rows.length === 0) return [];
  const ids = rows.map((row) => row.id);
  const lineResult = await db.query<JournalLineRow>(
    `SELECT
       line.id,
       line.journal_entry_id,
       line.line_number,
       line.account_id,
       account.code AS account_code,
       account.name AS account_name,
       line.memo,
       line.debit::text AS debit,
       line.credit::text AS credit,
       line.transaction_currency,
       line.transaction_amount::text AS transaction_amount
     FROM journal_lines AS line
     JOIN chart_accounts AS account ON account.id = line.account_id
     WHERE line.journal_entry_id = ANY($1::uuid[])
     ORDER BY line.journal_entry_id, line.line_number`,
    [ids],
  );
  const linesByEntry = new Map<string, JournalEntry["lines"]>();
  for (const line of lineResult.rows) {
    const side = parseAmount(line.debit) === 0n ? "credit" : "debit";
    const amount = side === "debit" ? line.debit : line.credit;
    const lines = linesByEntry.get(line.journal_entry_id) ?? [];
    lines.push({
      id: line.id,
      lineNumber: line.line_number,
      accountId: line.account_id,
      accountCode: line.account_code,
      accountName: line.account_name,
      side,
      amount: normalizeAmount(amount),
      currency: line.transaction_currency,
      memo: line.memo,
    });
    linesByEntry.set(line.journal_entry_id, lines);
  }
  return rows.map((row) => ({
    id: row.id,
    entryNumber: row.entry_number,
    entryDate: row.entry_date,
    description: row.description,
    reference: row.reference,
    status: row.status,
    baseCurrency: row.base_currency,
    reversalOfId: row.reversal_of_id,
    createdBy: row.created_by,
    createdAt: toIso(row.created_at),
    postedAt: row.posted_at ? toIso(row.posted_at) : null,
    lines: linesByEntry.get(row.id) ?? [],
  }));
}

async function writeAudit(
  client: PoolClient,
  companyId: string,
  actorUserId: string,
  action: string,
  entityType: string,
  entityId: string,
  details: Record<string, unknown>,
): Promise<void> {
  await client.query(
    `INSERT INTO audit_events
      (id, company_id, actor_user_id, action, entity_type, entity_id, details)
     VALUES ($1::uuid, $2::uuid, $3, $4, $5, $6, $7::jsonb)`,
    [
      randomUUID(),
      companyId,
      actorUserId,
      action,
      entityType,
      entityId,
      JSON.stringify(details),
    ],
  );
}

function mapAccount(row: AccountRow): Account {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    type: row.type,
    parentAccountId: row.parent_account_id,
    isSystem: row.is_system,
    isActive: row.is_active,
    createdAt: toIso(row.created_at),
  };
}

function mapPeriod(row: PeriodRow): AccountingPeriod {
  return {
    id: row.id,
    name: row.name,
    startDate: row.start_date,
    endDate: row.end_date,
    status: row.status,
    closedAt: row.closed_at ? toIso(row.closed_at) : null,
  };
}

function toIso(value: string | Date): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function normalizeAmount(value: string): string {
  const units = parseAmount(value);
  return units === null ? value : formatAmount(units);
}

function parseSignedAmount(value: string): bigint {
  if (!value.startsWith("-")) return parseAmount(value) ?? 0n;
  return -(parseAmount(value.slice(1)) ?? 0n);
}
