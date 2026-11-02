import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import type { Server } from "node:http";
import { test } from "node:test";
import express from "express";
import pg from "pg";
import { createAuthRouter } from "../src/auth/routes";
import { AuthService, sha256 } from "../src/auth/service";
import { PostgresAuthRepository } from "../src/auth/postgres-repository";

const { Pool } = pg;
const testDatabaseUrl = process.env.TEST_DATABASE_URL;

if (!testDatabaseUrl) {
  throw new Error("TEST_DATABASE_URL is required for PostgreSQL auth tests.");
}

const parsedTestDatabaseUrl = new URL(testDatabaseUrl);
const testDatabaseName = decodeURIComponent(parsedTestDatabaseUrl.pathname.slice(1));
const localHosts = new Set(["127.0.0.1", "localhost", "[::1]"]);

if (!localHosts.has(parsedTestDatabaseUrl.hostname) || !testDatabaseName.endsWith("_test")) {
  throw new Error(
    "Refusing PostgreSQL auth tests: use a local database whose name ends with _test.",
  );
}

const pool = new Pool({ connectionString: testDatabaseUrl, max: 4 });

test("PostgreSQL auth persists sessions and enforces company membership", async (t) => {
  const suffix = randomUUID();
  const ownerEmail = `owner-${suffix}@example.test`;
  const memberEmail = `member-${suffix}@example.test`;
  const outsiderEmail = `outsider-${suffix}@example.test`;
  const testEmails = [ownerEmail, memberEmail, outsiderEmail];
  const companyName = `TAMM auth integration ${suffix}`;
  let server: Server | undefined;
  let databaseIsReady = false;

  t.after(async () => {
    try {
      if (server?.listening) await closeServer(server);
      if (databaseIsReady) await cleanupTestRecords(testEmails, companyName);
    } finally {
      await pool.end();
    }
  });

  await assertEmptyTestDatabase();
  databaseIsReady = true;

  const service = new AuthService(new PostgresAuthRepository(pool), {
    accessTokenSecret: randomBytes(32).toString("hex"),
    issuer: "tamm-erp-postgres-tests",
    audience: "tamm-erp-postgres-tests",
  });
  const app = express();
  app.use(express.json());
  app.use("/api", createAuthRouter(service));
  server = app.listen(0, "127.0.0.1");
  await waitForListening(server);

  const address = server.address();
  assert.ok(address && typeof address !== "string");
  const baseUrl = `http://127.0.0.1:${address.port}/api`;
  const postJson = (path: string, body: unknown, accessToken?: string) =>
    fetch(`${baseUrl}${path}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(accessToken ? { authorization: `Bearer ${accessToken}` } : {}),
      },
      body: JSON.stringify(body),
    });

  const ownerRegisterResponse = await postJson("/auth/register", {
    email: ownerEmail,
    password: "correct horse battery",
    displayName: "Test Owner",
  });
  assert.equal(ownerRegisterResponse.status, 201);
  const ownerSession = (await ownerRegisterResponse.json()) as TestSession;

  const storedOwner = await pool.query<{ password_hash: string }>(
    "SELECT password_hash FROM auth_users WHERE id = $1",
    [ownerSession.user.id],
  );
  assert.equal(storedOwner.rowCount, 1);
  assert.notEqual(storedOwner.rows[0].password_hash, "correct horse battery");
  assert.ok(storedOwner.rows[0].password_hash.startsWith("$2"));

  const firstRefresh = await pool.query<{ token_hash: string; revoked_at: Date | null }>(
    "SELECT token_hash, revoked_at FROM auth_refresh_tokens WHERE user_id = $1",
    [ownerSession.user.id],
  );
  assert.ok(
    firstRefresh.rows.some(
      (row) => row.token_hash === sha256(ownerSession.refreshToken) && row.revoked_at === null,
    ),
  );

  const refreshResponse = await postJson("/auth/refresh", {
    refreshToken: ownerSession.refreshToken,
  });
  assert.equal(refreshResponse.status, 200);
  const rotatedSession = (await refreshResponse.json()) as TestSession;
  assert.notEqual(rotatedSession.refreshToken, ownerSession.refreshToken);

  const rotatedRows = await pool.query<{ token_hash: string; revoked_at: Date | null }>(
    "SELECT token_hash, revoked_at FROM auth_refresh_tokens WHERE user_id = $1",
    [ownerSession.user.id],
  );
  assert.ok(
    rotatedRows.rows.some(
      (row) => row.token_hash === sha256(ownerSession.refreshToken) && row.revoked_at !== null,
    ),
  );
  assert.ok(
    rotatedRows.rows.some(
      (row) => row.token_hash === sha256(rotatedSession.refreshToken) && row.revoked_at === null,
    ),
  );

  const memberRegisterResponse = await postJson("/auth/register", {
    email: memberEmail,
    password: "another correct horse battery",
    displayName: "Test Member",
  });
  assert.equal(memberRegisterResponse.status, 201);
  const memberSession = (await memberRegisterResponse.json()) as TestSession;

  const companyResponse = await postJson(
    "/companies",
    { name: companyName },
    ownerSession.accessToken,
  );
  assert.equal(companyResponse.status, 201);
  const company = (await companyResponse.json()) as { id: string; role: string };
  assert.equal(company.role, "owner");

  const addMemberResponse = await postJson(
    `/companies/${company.id}/members`,
    { email: memberEmail, role: "accountant" },
    ownerSession.accessToken,
  );
  assert.equal(addMemberResponse.status, 201);

  const membershipResponse = await fetch(
    `${baseUrl}/companies/${company.id}/authorization`,
    { headers: { authorization: `Bearer ${memberSession.accessToken}` } },
  );
  assert.equal(membershipResponse.status, 200);
  const membership = (await membershipResponse.json()) as { role: string };
  assert.equal(membership.role, "accountant");

  const outsiderRegisterResponse = await postJson("/auth/register", {
    email: outsiderEmail,
    password: "third correct horse battery",
    displayName: "Test Outsider",
  });
  assert.equal(outsiderRegisterResponse.status, 201);
  const outsiderSession = (await outsiderRegisterResponse.json()) as TestSession;

  const deniedResponse = await fetch(
    `${baseUrl}/companies/${company.id}/authorization`,
    { headers: { authorization: `Bearer ${outsiderSession.accessToken}` } },
  );
  assert.equal(deniedResponse.status, 403);

  const auditCount = await pool.query<{ count: number }>(
    "SELECT COUNT(*)::int AS count FROM auth_audit_events WHERE user_id = $1",
    [ownerSession.user.id],
  );
  assert.ok(auditCount.rows[0].count > 0);
});

async function assertEmptyTestDatabase(): Promise<void> {
  const result = await pool.query<{
    auth_users: number;
    auth_refresh_tokens: number;
    auth_login_throttles: number;
    auth_audit_events: number;
    companies: number;
    company_memberships: number;
  }>(`
    SELECT
      (SELECT COUNT(*)::int FROM auth_users) AS auth_users,
      (SELECT COUNT(*)::int FROM auth_refresh_tokens) AS auth_refresh_tokens,
      (SELECT COUNT(*)::int FROM auth_login_throttles) AS auth_login_throttles,
      (SELECT COUNT(*)::int FROM auth_audit_events) AS auth_audit_events,
      (SELECT COUNT(*)::int FROM companies) AS companies,
      (SELECT COUNT(*)::int FROM company_memberships) AS company_memberships
  `);
  const populatedTables = Object.entries(result.rows[0]).filter(([, count]) => count > 0);

  if (populatedTables.length > 0) {
    throw new Error(
      `Refusing PostgreSQL auth tests: test database must be empty (${populatedTables.map(([table]) => table).join(", ")} contain rows).`,
    );
  }
}

async function cleanupTestRecords(emails: string[], companyName: string): Promise<void> {
  const users = await pool.query<{ id: string }>(
    "SELECT id FROM auth_users WHERE email = ANY($1::text[])",
    [emails],
  );
  const userIds = users.rows.map((row) => row.id);
  const companies = await pool.query<{ id: string }>(
    "SELECT id FROM companies WHERE name = $1",
    [companyName],
  );
  const companyIds = companies.rows.map((row) => row.id);
  const emailKeys = emails.map((email) => sha256(email));
  const client = await pool.connect();

  try {
    await client.query("BEGIN");
    await client.query(
      "DELETE FROM auth_audit_events WHERE user_id = ANY($1::uuid[])",
      [userIds],
    );
    await client.query(
      "DELETE FROM auth_refresh_tokens WHERE user_id = ANY($1::uuid[])",
      [userIds],
    );
    await client.query(
      "DELETE FROM auth_login_throttles WHERE email_key = ANY($1::text[])",
      [emailKeys],
    );
    await client.query(
      `DELETE FROM company_memberships
       WHERE company_id = ANY($1::uuid[]) OR user_id = ANY($2::text[])`,
      [companyIds, userIds],
    );
    await client.query("DELETE FROM companies WHERE id = ANY($1::uuid[])", [companyIds]);
    await client.query("DELETE FROM auth_users WHERE id = ANY($1::uuid[])", [userIds]);
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

async function waitForListening(server: Server): Promise<void> {
  if (server.listening) return;
  await new Promise<void>((resolve, reject) => {
    server.once("listening", resolve);
    server.once("error", reject);
  });
}

async function closeServer(server: Server): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
}

type TestSession = {
  user: { id: string };
  accessToken: string;
  refreshToken: string;
};
