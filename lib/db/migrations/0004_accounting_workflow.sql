-- Core accounting workflow: drafts, posting, reversals, periods, and reports.
-- Additive only. Review and back up the user's PostgreSQL database before applying.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'account_type') THEN
    CREATE TYPE account_type AS ENUM (
      'asset',
      'liability',
      'equity',
      'income',
      'expense'
    );
  END IF;
END;
$$;

ALTER TABLE companies
  ADD COLUMN IF NOT EXISTS next_journal_number integer NOT NULL DEFAULT 1;

CREATE TABLE IF NOT EXISTS chart_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  code text NOT NULL,
  name text NOT NULL,
  type account_type NOT NULL,
  parent_account_id uuid REFERENCES chart_accounts(id) ON DELETE SET NULL,
  is_system boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS chart_accounts_company_code_idx
  ON chart_accounts (company_id, code);
CREATE INDEX IF NOT EXISTS chart_accounts_company_type_idx
  ON chart_accounts (company_id, type);

CREATE TABLE IF NOT EXISTS journal_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  entry_number text NOT NULL,
  entry_date date NOT NULL,
  description text NOT NULL,
  reference text,
  status text NOT NULL DEFAULT 'draft',
  created_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  base_currency text,
  posted_at timestamptz,
  posted_by text,
  reversal_of_id uuid REFERENCES journal_entries(id) ON DELETE RESTRICT,
  reversed_at timestamptz
);

ALTER TABLE journal_entries
  ADD COLUMN IF NOT EXISTS base_currency text,
  ADD COLUMN IF NOT EXISTS posted_at timestamptz,
  ADD COLUMN IF NOT EXISTS posted_by text,
  ADD COLUMN IF NOT EXISTS reversal_of_id uuid,
  ADD COLUMN IF NOT EXISTS reversed_at timestamptz;

ALTER TABLE journal_entries
  ALTER COLUMN status DROP DEFAULT,
  ALTER COLUMN status TYPE text USING status::text,
  ALTER COLUMN status SET DEFAULT 'draft';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'journal_entries_status_check'
  ) THEN
    ALTER TABLE journal_entries
      ADD CONSTRAINT journal_entries_status_check
      CHECK (status IN ('draft', 'posted', 'reversed')) NOT VALID;
  END IF;
END;
$$;

ALTER TABLE journal_entries
  ALTER COLUMN status SET DEFAULT 'draft';

UPDATE journal_entries AS entry
SET base_currency = company.base_currency
FROM companies AS company
WHERE entry.company_id = company.id
  AND entry.base_currency IS NULL
  AND company.base_currency ~ '^[A-Z]{3}$';

UPDATE journal_entries
SET posted_at = created_at,
    posted_by = created_by
WHERE status IN ('posted', 'reversed')
  AND posted_at IS NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'journal_entries_reversal_of_fk'
  ) THEN
    ALTER TABLE journal_entries
      ADD CONSTRAINT journal_entries_reversal_of_fk
      FOREIGN KEY (reversal_of_id)
      REFERENCES journal_entries(id)
      ON DELETE RESTRICT;
  END IF;
END;
$$;

CREATE UNIQUE INDEX IF NOT EXISTS journal_entries_company_number_idx
  ON journal_entries (company_id, entry_number);
CREATE INDEX IF NOT EXISTS journal_entries_company_date_idx
  ON journal_entries (company_id, entry_date);
CREATE INDEX IF NOT EXISTS journal_entries_company_status_date_idx
  ON journal_entries (company_id, status, entry_date);
CREATE UNIQUE INDEX IF NOT EXISTS journal_entries_reversal_of_unique_idx
  ON journal_entries (reversal_of_id)
  WHERE reversal_of_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS journal_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  journal_entry_id uuid NOT NULL
    REFERENCES journal_entries(id) ON DELETE CASCADE,
  account_id uuid NOT NULL
    REFERENCES chart_accounts(id) ON DELETE RESTRICT,
  line_number integer,
  memo text,
  debit numeric(20, 4) NOT NULL DEFAULT 0,
  credit numeric(20, 4) NOT NULL DEFAULT 0,
  transaction_currency text NOT NULL,
  transaction_amount numeric(20, 4) NOT NULL DEFAULT 0,
  exchange_rate numeric(20, 8) NOT NULL
);

ALTER TABLE journal_lines
  ADD COLUMN IF NOT EXISTS line_number integer;

WITH numbered AS (
  SELECT
    id,
    row_number() OVER (
      PARTITION BY journal_entry_id
      ORDER BY id
    )::integer AS line_number
  FROM journal_lines
  WHERE line_number IS NULL
)
UPDATE journal_lines AS line
SET line_number = numbered.line_number
FROM numbered
WHERE line.id = numbered.id;

ALTER TABLE journal_lines
  ALTER COLUMN line_number SET NOT NULL;

CREATE INDEX IF NOT EXISTS journal_lines_entry_idx
  ON journal_lines (journal_entry_id, line_number);
CREATE UNIQUE INDEX IF NOT EXISTS journal_lines_entry_number_idx
  ON journal_lines (journal_entry_id, line_number);
CREATE INDEX IF NOT EXISTS journal_lines_account_idx
  ON journal_lines (account_id, journal_entry_id);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'journal_lines_one_sided_positive_amount'
  ) THEN
    ALTER TABLE journal_lines
      ADD CONSTRAINT journal_lines_one_sided_positive_amount
      CHECK (
        debit >= 0
        AND credit >= 0
        AND (
          (debit > 0 AND credit = 0)
          OR (credit > 0 AND debit = 0)
        )
        AND transaction_amount > 0
        AND exchange_rate > 0
      ) NOT VALID;
  END IF;
END;
$$;

CREATE TABLE IF NOT EXISTS accounting_periods (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 120),
  start_date date NOT NULL,
  end_date date NOT NULL,
  status text NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'closed')),
  created_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  closed_by text,
  closed_at timestamptz,
  CONSTRAINT accounting_periods_date_order_check
    CHECK (start_date <= end_date)
);

CREATE INDEX IF NOT EXISTS accounting_periods_company_date_idx
  ON accounting_periods (company_id, start_date, end_date);

CREATE TABLE IF NOT EXISTS audit_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  actor_user_id text NOT NULL,
  action text NOT NULL,
  entity_type text NOT NULL,
  entity_id text NOT NULL,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS audit_events_company_created_idx
  ON audit_events (company_id, created_at);
