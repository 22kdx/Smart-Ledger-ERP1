import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import pg from "pg";
import { CompanyBusinessSettingsService } from "./business-service";
import { PostgresCompanyBusinessSettingsRepository } from "./business-postgres-repository";
import { PostgresCompanySettingsRepository } from "./postgres-repository";
import { CompanySettingsError } from "./types";

const { Pool } = pg;
const testDatabaseUrl = process.env.TEST_DATABASE_URL;

if (!testDatabaseUrl) {
  throw new Error("TEST_DATABASE_URL is required for company settings tests.");
}

const parsedTestDatabaseUrl = new URL(testDatabaseUrl);
const testDatabaseName = decodeURIComponent(
  parsedTestDatabaseUrl.pathname.slice(1),
);
const localHosts = new Set(["127.0.0.1", "localhost", "[::1]"]);

if (
  !localHosts.has(parsedTestDatabaseUrl.hostname) ||
  !testDatabaseName.endsWith("_test")
) {
  throw new Error(
    "Refusing company settings test: use a local database whose name ends with _test.",
  );
}

const pool = new Pool({ connectionString: testDatabaseUrl, max: 2 });

test("PostgreSQL company settings migration and repository preserve existing values", async (t) => {
  const companyId = randomUUID();
  let companyWasCreated = false;

  t.after(async () => {
    try {
      if (companyWasCreated) {
        await pool.query("DELETE FROM companies WHERE id = $1::uuid", [
          companyId,
        ]);
      }
    } finally {
      await pool.end();
    }
  });

  await pool.query(`
    CREATE TABLE IF NOT EXISTS companies (
      id uuid PRIMARY KEY,
      name text NOT NULL,
      country_code text,
      base_currency text,
      tax_rate numeric(7, 4),
      timezone text NOT NULL DEFAULT 'UTC',
      next_journal_number integer NOT NULL DEFAULT 1,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    )
  `);
  const existingCompanies = await pool.query<{ count: number }>(
    "SELECT COUNT(*)::int AS count FROM companies",
  );
  assert.equal(
    existingCompanies.rows[0].count,
    0,
    "Refusing test database with existing company rows.",
  );

  const currenciesExists = await pool.query<{ exists: boolean }>(
    "SELECT to_regclass('public.company_currencies') IS NOT NULL AS exists",
  );
  if (currenciesExists.rows[0].exists) {
    const existingCurrencies = await pool.query<{ count: number }>(
      "SELECT COUNT(*)::int AS count FROM company_currencies",
    );
    assert.equal(
      existingCurrencies.rows[0].count,
      0,
      "Refusing test database with existing company currency rows.",
    );
  }

  await pool.query(
    `INSERT INTO companies (id, name, base_currency)
     VALUES ($1::uuid, $2, $3)`,
    [companyId, "Existing Test Company", "SAR"],
  );
  companyWasCreated = true;

  const migrationPath = fileURLToPath(
    new URL(
      "../../../../lib/db/migrations/0002_company_settings.sql",
      import.meta.url,
    ),
  );
  const migration = await readFile(migrationPath, "utf8");
  await pool.query(migration);
  const businessMigrationPath = fileURLToPath(
    new URL(
      "../../../../lib/db/migrations/0003_company_business_settings.sql",
      import.meta.url,
    ),
  );
  const businessMigration = await readFile(businessMigrationPath, "utf8");
  await pool.query(businessMigration);

  const repository = new PostgresCompanySettingsRepository(pool);
  const beforeUpdate = await repository.get(companyId);
  assert.ok(beforeUpdate);
  assert.equal(beforeUpdate.name, "Existing Test Company");
  assert.equal(beforeUpdate.baseCurrency, "SAR");
  assert.deepEqual(beforeUpdate.currencies, [
    { code: "SAR", isEnabled: true },
  ]);

  const updated = await repository.update(companyId, {
    name: "Updated Test Company",
    countryCode: "YE",
    baseCurrency: "YER",
    fiscalYearStartMonth: 1,
    fiscalYearStartDay: 1,
    currencies: [
      { code: "YER", isEnabled: true },
      { code: "SAR", isEnabled: false },
    ],
  });
  assert.ok(updated);
  assert.equal(updated.name, "Updated Test Company");
  assert.equal(updated.baseCurrency, "YER");
  assert.deepEqual(updated.currencies, [
    { code: "SAR", isEnabled: false },
    { code: "YER", isEnabled: true },
  ]);

  await assert.rejects(
    repository.update(companyId, {
      name: "Must Roll Back",
      baseCurrency: "USD",
      currencies: [{ code: "USD", isEnabled: false }],
    }),
    (error: unknown) =>
      error instanceof CompanySettingsError &&
      error.code === "base_currency_must_be_enabled",
  );
  const afterRejectedUpdate = await repository.get(companyId);
  assert.ok(afterRejectedUpdate);
  assert.equal(afterRejectedUpdate.name, "Updated Test Company");
  assert.equal(afterRejectedUpdate.baseCurrency, "YER");
  assert.deepEqual(afterRejectedUpdate.currencies, [
    { code: "SAR", isEnabled: false },
    { code: "YER", isEnabled: true },
  ]);

  const preservedLegacyValues = await pool.query<{
    tax_rate: string | null;
    base_currency: string | null;
  }>(
    "SELECT tax_rate, base_currency FROM companies WHERE id = $1::uuid",
    [companyId],
  );
  assert.equal(preservedLegacyValues.rows[0].tax_rate, null);
  assert.equal(preservedLegacyValues.rows[0].base_currency, "YER");

  const businessRepository = new PostgresCompanyBusinessSettingsRepository(pool);
  const businessSettings = new CompanyBusinessSettingsService(businessRepository);
  const taxRule = await businessSettings.createTaxRule(companyId, {
    name: "  إعداد ضريبة تجريبي  ",
    rate: 15,
    countryCode: "sa",
    isActive: true,
  });
  assert.equal(taxRule.name, "إعداد ضريبة تجريبي");
  assert.equal(taxRule.countryCode, "SA");
  assert.deepEqual(await businessSettings.listTaxRules(randomUUID()), []);

  const updatedTaxRule = await businessSettings.updateTaxRule(
    companyId,
    taxRule.id,
    { rate: 8.5, isActive: false },
  );
  assert.equal(updatedTaxRule?.rate, 8.5);
  assert.equal(updatedTaxRule?.isActive, false);

  const exchangeRateInput = {
    fromCurrency: "SAR",
    toCurrency: "YER",
    rate: 140.125,
    effectiveDate: "2026-11-03",
    source: "اختبار",
  };
  const exchangeRate = await businessSettings.createExchangeRate(
    companyId,
    exchangeRateInput,
  );
  assert.equal(exchangeRate.rate, 140.125);
  assert.equal(exchangeRate.effectiveDate, "2026-11-03");
  assert.deepEqual(
    await businessSettings.listExchangeRates(randomUUID()),
    [],
  );
  await assert.rejects(
    businessSettings.createExchangeRate(companyId, exchangeRateInput),
    (error: unknown) =>
      error instanceof Error &&
      "statusCode" in error &&
      error.statusCode === 409,
  );
  assert.equal(
    await businessSettings.deleteExchangeRate(companyId, exchangeRate.id),
    true,
  );
});
