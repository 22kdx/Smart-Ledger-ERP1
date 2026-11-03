-- Company profile/fiscal-year settings and allowed currencies.
-- This migration is additive. Review and apply manually to the user's own
-- PostgreSQL database only after taking a backup.

ALTER TABLE companies
  ADD COLUMN IF NOT EXISTS fiscal_year_start_month integer,
  ADD COLUMN IF NOT EXISTS fiscal_year_start_day integer;

DO $$
BEGIN
  ALTER TABLE companies
    ADD CONSTRAINT companies_fiscal_year_start_month_check
    CHECK (
      fiscal_year_start_month IS NULL
      OR fiscal_year_start_month BETWEEN 1 AND 12
    );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END;
$$;

DO $$
BEGIN
  ALTER TABLE companies
    ADD CONSTRAINT companies_fiscal_year_start_day_check
    CHECK (
      fiscal_year_start_day IS NULL
      OR fiscal_year_start_day BETWEEN 1 AND 31
    );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END;
$$;

DO $$
BEGIN
  ALTER TABLE companies
    ADD CONSTRAINT companies_fiscal_year_start_pair_check
    CHECK (
      (fiscal_year_start_month IS NULL)
      = (fiscal_year_start_day IS NULL)
    );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END;
$$;

CREATE TABLE IF NOT EXISTS company_currencies (
  company_id uuid NOT NULL
    REFERENCES companies(id) ON DELETE CASCADE,
  currency_code text NOT NULL
    CHECK (currency_code ~ '^[A-Z]{3}$'),
  is_enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT company_currencies_pk PRIMARY KEY (company_id, currency_code)
);

-- Preserve each existing base currency as an enabled currency option.
-- No company setting or historical transaction is overwritten.
INSERT INTO company_currencies (company_id, currency_code)
SELECT id, base_currency
FROM companies
WHERE base_currency ~ '^[A-Z]{3}$'
ON CONFLICT (company_id, currency_code) DO NOTHING;
