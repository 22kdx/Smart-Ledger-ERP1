-- Company tax and manually entered exchange-rate settings.
-- These records are not applied to invoices, entries, or balances by this migration.
-- Apply manually to the user's own PostgreSQL database after taking a backup.

CREATE TABLE IF NOT EXISTS company_tax_rules (
  id uuid PRIMARY KEY,
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 120),
  rate numeric(7, 4) NOT NULL CHECK (rate BETWEEN 0 AND 100),
  country_code text CHECK (
    country_code IS NULL OR country_code ~ '^[A-Z]{2}$'
  ),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS company_tax_rules_company_active_idx
  ON company_tax_rules (company_id, is_active);

CREATE TABLE IF NOT EXISTS company_exchange_rates (
  id uuid PRIMARY KEY,
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  from_currency text NOT NULL CHECK (from_currency ~ '^[A-Z]{3}$'),
  to_currency text NOT NULL CHECK (to_currency ~ '^[A-Z]{3}$'),
  rate numeric(20, 8) NOT NULL CHECK (rate > 0),
  effective_date date NOT NULL,
  source text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT company_exchange_rates_distinct_currencies_check
    CHECK (from_currency <> to_currency),
  CONSTRAINT company_exchange_rates_pair_date_idx
    UNIQUE (company_id, from_currency, to_currency, effective_date)
);

CREATE INDEX IF NOT EXISTS company_exchange_rates_company_date_idx
  ON company_exchange_rates (company_id, effective_date);
