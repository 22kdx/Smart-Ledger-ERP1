import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { test } from "node:test";
import express from "express";
import type { Server } from "node:http";
import { AuthService } from "./service";
import { createAuthRouter } from "./routes";
import type {
  AddCompanyMemberResult,
  AuthAuditEvent,
  AuthRepository,
  AuthUserRecord,
  CompanyAccessRecord,
  CompanyMemberRole,
  CompanySummary,
  LoginThrottleKey,
  RefreshRotationResult,
  RefreshTokenInput,
  RefreshTokenReplacement,
} from "./types";
import { sha256 } from "./service";

const TEST_SECRET = randomBytes(32).toString("hex");
const auditContext = {
  ipAddress: "127.0.0.1",
  userAgent: "auth-tests",
};

test("registration hashes the password and refresh token before storage", async () => {
  const repository = new MemoryAuthRepository();
  const service = createService(repository);
  const session = await service.register(
    {
      email: "owner@example.test",
      password: "correct horse battery",
      displayName: "Owner",
    },
    auditContext,
  );

  const storedUser = repository.usersByEmail.get("owner@example.test");
  assert.ok(storedUser);
  assert.notEqual(storedUser.passwordHash, "correct horse battery");
  assert.ok(storedUser.passwordHash.startsWith("$2"));
  assert.equal(
    repository.refreshTokens.has(sha256(session.refreshToken)),
    true,
  );
  assert.equal(repository.refreshTokens.has(session.refreshToken), false);
  assert.equal(session.expiresIn, 900);
  assert.equal(session.refreshExpiresIn, 2_592_000);
  assert.equal(repository.auditEvents[0]?.eventType, "register_success");

  const loginSession = await service.login(
    { email: "OWNER@example.test", password: "correct horse battery" },
    auditContext,
  );
  assert.equal(loginSession.user.id, session.user.id);
  assert.ok(repository.auditEvents.some((event) => event.eventType === "login_success"));
});

test("refresh rotates once, replay revokes the whole token family", async () => {
  const repository = new MemoryAuthRepository();
  const service = createService(repository);
  const original = await service.register(
    {
      email: "rotate@example.test",
      password: "long enough password",
      displayName: "Rotate",
    },
    auditContext,
  );

  const rotated = await service.refresh(original.refreshToken, auditContext);
  assert.notEqual(rotated.refreshToken, original.refreshToken);
  assert.ok(await service.authenticateAccessToken(rotated.accessToken));

  await assert.rejects(
    service.refresh(original.refreshToken, auditContext),
    (error: unknown) =>
      error instanceof Error &&
      "code" in error &&
      error.code === "refresh_token_invalid",
  );
  await assert.rejects(
    service.refresh(rotated.refreshToken, auditContext),
    (error: unknown) =>
      error instanceof Error &&
      "code" in error &&
      error.code === "refresh_token_invalid",
  );
  assert.ok(repository.auditEvents.some((event) => event.eventType === "refresh_reuse"));
});

test("logout revokes the refresh token family", async () => {
  const repository = new MemoryAuthRepository();
  const service = createService(repository);
  const session = await service.register(
    {
      email: "logout@example.test",
      password: "long enough password",
      displayName: "Logout",
    },
    auditContext,
  );

  await service.logout(session.refreshToken, auditContext);
  await assert.rejects(
    service.refresh(session.refreshToken, auditContext),
    (error: unknown) =>
      error instanceof Error &&
      "code" in error &&
      error.code === "refresh_token_invalid",
  );
  assert.ok(repository.auditEvents.some((event) => event.eventType === "logout"));
});

test("five failed logins create a temporary lock and use a generic error", async () => {
  const repository = new MemoryAuthRepository();
  const service = createService(repository);
  await service.register(
    {
      email: "locked@example.test",
      password: "long enough password",
      displayName: "Locked",
    },
    auditContext,
  );

  for (let attempt = 0; attempt < 5; attempt += 1) {
    await assert.rejects(
      service.login(
        { email: "locked@example.test", password: "wrong password" },
        auditContext,
      ),
      (error: unknown) =>
        error instanceof Error &&
        "statusCode" in error &&
        error.statusCode === 401 &&
        "code" in error &&
        error.code === "invalid_credentials",
    );
  }

  await assert.rejects(
    service.login(
      { email: "locked@example.test", password: "long enough password" },
      auditContext,
    ),
    (error: unknown) =>
      error instanceof Error &&
      "code" in error &&
      error.code === "invalid_credentials",
  );
  assert.ok(repository.auditEvents.some((event) => event.eventType === "login_locked"));
});

test("a valid access token does not bypass company membership", async (t) => {
  const repository = new MemoryAuthRepository();
  const service = createService(repository);
  const session = await service.register(
    {
      email: "member@example.test",
      password: "long enough password",
      displayName: "Member",
    },
    auditContext,
  );
  const companyId = "a6c9c25d-fdc1-4c58-9114-f53022e64189";
  const app = express();
  app.use(express.json());
  app.use("/api", createAuthRouter(service));
  const server = app.listen(0, "127.0.0.1");
  t.after(async () => closeServer(server));
  await waitForListening(server);

  const address = server.address();
  assert.ok(address && typeof address !== "string");
  const url = `http://127.0.0.1:${address.port}/api/companies/${companyId}/authorization`;

  const withoutToken = await fetch(url);
  assert.equal(withoutToken.status, 401);

  const tokenWithoutMembership = await fetch(url, {
    headers: { authorization: `Bearer ${session.accessToken}` },
  });
  assert.equal(tokenWithoutMembership.status, 403);

  repository.companyAccess.set(
    `${session.user.id}:${companyId}`,
    {
      companyId,
      role: "viewer",
      permissions: ["companies:read"],
    },
  );
  const withMembership = await fetch(url, {
    headers: { authorization: `Bearer ${session.accessToken}` },
  });
  assert.equal(withMembership.status, 200);
  const response = (await withMembership.json()) as {
    role: string;
    permissions: string[];
  };
  assert.equal(response.role, "viewer");
  assert.deepEqual(response.permissions, ["companies:read"]);
});

test("HTTP register, login, company creation, and member access work together", async (t) => {
  const repository = new MemoryAuthRepository();
  const service = createService(repository);
  const app = express();
  app.use(express.json());
  app.use("/api", createAuthRouter(service));
  const server = app.listen(0, "127.0.0.1");
  t.after(async () => closeServer(server));
  await waitForListening(server);

  const address = server.address();
  assert.ok(address && typeof address !== "string");
  const baseUrl = `http://127.0.0.1:${address.port}/api`;
  const registerResponse = await fetch(`${baseUrl}/auth/register`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      email: "route-owner@example.test",
      password: "correct horse battery",
      displayName: "Route Owner",
    }),
  });
  assert.equal(registerResponse.status, 201);
  const ownerSession = (await registerResponse.json()) as {
    accessToken: string;
    user: { id: string };
  };

  const loginResponse = await fetch(`${baseUrl}/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      email: "route-owner@example.test",
      password: "correct horse battery",
    }),
  });
  assert.equal(loginResponse.status, 200);

  const companyResponse = await fetch(`${baseUrl}/companies`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${ownerSession.accessToken}`,
    },
    body: JSON.stringify({ name: "Tenant Test" }),
  });
  assert.equal(companyResponse.status, 201);
  const company = (await companyResponse.json()) as {
    id: string;
    role: string;
  };
  assert.equal(company.role, "owner");

  const memberSession = await service.register(
    {
      email: "route-member@example.test",
      password: "another long password",
      displayName: "Route Member",
    },
    auditContext,
  );
  const addMemberResponse = await fetch(
    `${baseUrl}/companies/${company.id}/members`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${ownerSession.accessToken}`,
      },
      body: JSON.stringify({
        email: "route-member@example.test",
        role: "accountant",
      }),
    },
  );
  assert.equal(addMemberResponse.status, 201);

  const memberAccessResponse = await fetch(
    `${baseUrl}/companies/${company.id}/authorization`,
    {
      headers: { authorization: `Bearer ${memberSession.accessToken}` },
    },
  );
  assert.equal(memberAccessResponse.status, 200);

  const ownerCompanies = await fetch(`${baseUrl}/companies`, {
    headers: { authorization: `Bearer ${ownerSession.accessToken}` },
  });
  assert.equal(ownerCompanies.status, 200);
  const listed = (await ownerCompanies.json()) as {
    companies: Array<{ id: string }>;
  };
  assert.deepEqual(listed.companies.map((entry) => entry.id), [company.id]);
});

function createService(repository: AuthRepository): AuthService {
  return new AuthService(repository, {
    accessTokenSecret: TEST_SECRET,
    issuer: "midad-erp-tests",
    audience: "midad-erp-tests",
  });
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

class MemoryAuthRepository implements AuthRepository {
  usersByEmail = new Map<string, AuthUserRecord>();
  usersById = new Map<string, AuthUserRecord>();
  refreshTokens = new Map<
    string,
    RefreshTokenInput & { revokedAt: Date | null; replacedById: string | null }
  >();
  throttle = new Map<
    string,
    { count: number; windowStartedAt: Date; lockedUntil: Date | null }
  >();
  auditEvents: AuthAuditEvent[] = [];
  companyAccess = new Map<string, CompanyAccessRecord>();
  companies = new Map<string, CompanySummary>();
  memberships = new Set<string>();

  async findUserByEmail(email: string): Promise<AuthUserRecord | null> {
    return this.usersByEmail.get(email) ?? null;
  }

  async findUserById(id: string): Promise<AuthUserRecord | null> {
    return this.usersById.get(id) ?? null;
  }

  async createUser(
    user: AuthUserRecord & { createdAt: Date },
  ): Promise<AuthUserRecord> {
    if (this.usersByEmail.has(user.email)) {
      throw Object.assign(new Error("duplicate email"), { code: "23505" });
    }
    const record: AuthUserRecord = {
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      passwordHash: user.passwordHash,
      isActive: user.isActive,
    };
    this.usersByEmail.set(user.email, record);
    this.usersById.set(user.id, record);
    return record;
  }

  async isLoginLocked(key: LoginThrottleKey, now: Date): Promise<boolean> {
    const record = this.throttle.get(throttleKey(key));
    return Boolean(record?.lockedUntil && record.lockedUntil > now);
  }

  async recordFailedLogin(
    key: LoginThrottleKey,
    now: Date,
    windowMs: number,
    maxAttempts: number,
    lockMs: number,
  ): Promise<Date | null> {
    const id = throttleKey(key);
    const record = this.throttle.get(id);
    const expired =
      !record ||
      record.windowStartedAt.getTime() + windowMs <= now.getTime();
    const count = (expired ? 0 : record.count) + 1;
    const lockedUntil =
      record?.lockedUntil && record.lockedUntil > now
        ? record.lockedUntil
        : count >= maxAttempts
          ? new Date(now.getTime() + lockMs)
          : null;
    this.throttle.set(id, {
      count,
      windowStartedAt: expired ? now : record.windowStartedAt,
      lockedUntil,
    });
    return lockedUntil;
  }

  async clearLoginFailures(key: LoginThrottleKey): Promise<void> {
    this.throttle.delete(throttleKey(key));
  }

  async recordAuditEvent(event: AuthAuditEvent): Promise<void> {
    this.auditEvents.push(event);
  }

  async createRefreshToken(token: RefreshTokenInput): Promise<void> {
    this.refreshTokens.set(token.tokenHash, {
      ...token,
      revokedAt: null,
      replacedById: null,
    });
  }

  async rotateRefreshToken(
    tokenHash: string,
    replacement: RefreshTokenReplacement,
    now: Date,
  ): Promise<RefreshRotationResult> {
    const old = this.refreshTokens.get(tokenHash);
    if (!old) return { status: "invalid" };
    if (old.revokedAt) {
      this.revokeFamily(old.familyId, now);
      return { status: "reused", userId: old.userId };
    }
    if (old.expiresAt <= now) {
      old.revokedAt = now;
      return { status: "expired" };
    }
    const user = this.usersById.get(old.userId);
    if (!user || !user.isActive) {
      this.revokeFamily(old.familyId, now);
      return { status: "inactive" };
    }

    old.revokedAt = now;
    old.replacedById = replacement.id;
    this.refreshTokens.set(replacement.tokenHash, {
      ...replacement,
      userId: old.userId,
      familyId: old.familyId,
      revokedAt: null,
      replacedById: null,
    });
    return { status: "rotated", user };
  }

  async revokeRefreshFamily(
    tokenHash: string,
    now: Date,
  ): Promise<string | null> {
    const token = this.refreshTokens.get(tokenHash);
    if (!token) return null;
    this.revokeFamily(token.familyId, now);
    return token.userId;
  }

  async getCompanyAccess(
    userId: string,
    companyId: string,
  ): Promise<CompanyAccessRecord | null> {
    return this.companyAccess.get(`${userId}:${companyId}`) ?? null;
  }

  async listCompanies(userId: string): Promise<CompanySummary[]> {
    return [...this.companies.values()].filter((company) =>
      this.memberships.has(`${userId}:${company.id}`),
    );
  }

  async createCompany(
    userId: string,
    input: {
      name: string;
      countryCode?: string;
      baseCurrency?: string | null;
      taxRate?: number | null;
    },
  ): Promise<CompanySummary> {
    const company: CompanySummary = {
      id: "09c2873f-3b6d-4e91-9fe9-59f4c4ca2081",
      name: input.name,
      countryCode: input.countryCode ?? null,
      baseCurrency: input.baseCurrency ?? null,
      taxRate: input.taxRate ?? null,
      role: "owner",
    };
    this.companies.set(company.id, company);
    this.memberships.add(`${userId}:${company.id}`);
    this.companyAccess.set(`${userId}:${company.id}`, {
      companyId: company.id,
      role: "owner",
      permissions: ["companies:read", "members:manage"],
    });
    return company;
  }

  async addCompanyMember(
    companyId: string,
    email: string,
    role: CompanyMemberRole,
  ): Promise<AddCompanyMemberResult> {
    const user = this.usersByEmail.get(email);
    if (!this.companies.has(companyId)) {
      return { status: "company_not_found" };
    }
    if (!user || !user.isActive) return { status: "user_not_found" };
    const key = `${user.id}:${companyId}`;
    if (this.memberships.has(key)) return { status: "already_member" };
    this.memberships.add(key);
    this.companyAccess.set(key, {
      companyId,
      role,
      permissions:
        role === "admin"
          ? ["companies:read", "members:manage"]
          : role === "accountant"
            ? ["companies:read", "accounts:read", "journals:read"]
            : [],
    });
    return {
      status: "added",
      member: { userId: user.id, email: user.email, role },
    };
  }

  private revokeFamily(familyId: string, now: Date): void {
    for (const token of this.refreshTokens.values()) {
      if (token.familyId === familyId && !token.revokedAt) {
        token.revokedAt = now;
      }
    }
  }
}

function throttleKey(key: LoginThrottleKey): string {
  return `${key.emailKey}:${key.ipHash}`;
}
