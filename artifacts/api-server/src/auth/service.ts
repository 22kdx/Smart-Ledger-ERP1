import { randomBytes, randomUUID, createHash } from "node:crypto";
import bcrypt from "bcryptjs";
import { SignJWT, jwtVerify } from "jose";
import type {
  AuthAuditEventType,
  AuthRepository,
  AuthUserRecord,
  AddCompanyMemberResult,
  CompanyMemberRole,
  CompanySummary,
  LoginThrottleKey,
  PublicAuthUser,
  RefreshTokenReplacement,
  RefreshTokenInput,
} from "./types";
import { AuthServiceError } from "./types";

export const ACCESS_TOKEN_SECONDS = 900;
export const REFRESH_TOKEN_SECONDS = 2_592_000;
export const PASSWORD_BCRYPT_ROUNDS = 12;

const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const LOGIN_MAX_FAILURES = 5;
const LOGIN_LOCK_MS = 15 * 60 * 1000;

export type AuthServiceConfig = {
  accessTokenSecret: string;
  issuer: string;
  audience: string;
  now?: () => Date;
};

export type RequestAuditContext = {
  ipAddress: string;
  userAgent: string | null;
};

export type AuthSession = {
  user: PublicAuthUser;
  accessToken: string;
  tokenType: "Bearer";
  expiresIn: 900;
  refreshToken: string;
  refreshExpiresIn: 2_592_000;
};

export class AuthService {
  private readonly key: Uint8Array;
  private readonly now: () => Date;
  private readonly dummyPasswordHash: Promise<string>;

  constructor(
    private readonly repository: AuthRepository,
    config: AuthServiceConfig,
  ) {
    if (Buffer.byteLength(config.accessTokenSecret, "utf8") < 32) {
      throw new Error("AUTH_ACCESS_TOKEN_SECRET must be at least 32 bytes.");
    }
    if (!config.issuer.trim() || !config.audience.trim()) {
      throw new Error("Auth token issuer and audience must be configured.");
    }

    this.key = new TextEncoder().encode(config.accessTokenSecret);
    this.issuer = config.issuer;
    this.audience = config.audience;
    this.now = config.now ?? (() => new Date());
    this.dummyPasswordHash = bcrypt.hash(
      randomBytes(32).toString("hex"),
      PASSWORD_BCRYPT_ROUNDS,
    );
  }

  private readonly issuer: string;
  private readonly audience: string;

  async register(
    input: { email: string; password: string; displayName: string },
    context: RequestAuditContext,
  ): Promise<AuthSession> {
    const email = normalizeEmail(input.email);
    const displayName = input.displayName.trim();
    validateCredentials(email, input.password);
    if (!displayName || displayName.length > 120) {
      throw new AuthServiceError(400, "invalid_request");
    }

    const user: AuthUserRecord = {
      id: randomUUID(),
      email,
      displayName,
      passwordHash: await bcrypt.hash(
        input.password,
        PASSWORD_BCRYPT_ROUNDS,
      ),
      isActive: true,
    };

    let created: AuthUserRecord;
    try {
      created = await this.repository.createUser({
        ...user,
        createdAt: this.now(),
      });
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        throw new AuthServiceError(409, "email_already_registered");
      }
      throw error;
    }

    await this.recordAudit("register_success", created.id, email, context);
    return this.issueSession(created);
  }

  async login(
    input: { email: string; password: string },
    context: RequestAuditContext,
  ): Promise<AuthSession> {
    const email = normalizeEmail(input.email);
    const emailKey = sha256(email);
    const ipHash = sha256(context.ipAddress);
    const throttleKey: LoginThrottleKey = { emailKey, ipHash };
    const now = this.now();

    if (await this.repository.isLoginLocked(throttleKey, now)) {
      await this.recordAudit("login_locked", null, email, context);
      throw new AuthServiceError(401, "invalid_credentials");
    }

    const user = await this.repository.findUserByEmail(email);
    const passwordHash = user?.passwordHash ?? (await this.dummyPasswordHash);
    const passwordIsValid =
      isPasswordWithinBcryptLimit(input.password) &&
      (await bcrypt.compare(input.password, passwordHash));

    if (!user || !user.isActive || !passwordIsValid) {
      const lockedUntil = await this.repository.recordFailedLogin(
        throttleKey,
        now,
        LOGIN_WINDOW_MS,
        LOGIN_MAX_FAILURES,
        LOGIN_LOCK_MS,
      );
      await this.recordAudit(
        lockedUntil && lockedUntil > now ? "login_locked" : "login_failed",
        user?.id ?? null,
        email,
        context,
      );
      throw new AuthServiceError(401, "invalid_credentials");
    }

    await this.repository.clearLoginFailures(throttleKey);
    await this.recordAudit("login_success", user.id, email, context);
    return this.issueSession(user);
  }

  async refresh(
    refreshToken: string,
    context: RequestAuditContext,
  ): Promise<AuthSession> {
    const tokenHash = sha256(refreshToken);
    const now = this.now();
    const replacement = this.newRefreshCredential(now);
    const result = await this.repository.rotateRefreshToken(
      tokenHash,
      replacement.token,
      now,
    );

    if (result.status !== "rotated") {
      if (result.status === "reused") {
        const user = await this.repository.findUserById(result.userId);
        await this.recordAudit(
          "refresh_reuse",
          result.userId,
          user?.email ?? "",
          context,
        );
      }
      throw new AuthServiceError(401, "refresh_token_invalid");
    }

    await this.recordAudit(
      "refresh_success",
      result.user.id,
      result.user.email,
      context,
    );
    return this.sessionForExistingRefresh(
      result.user,
      replacement.rawToken,
    );
  }

  async logout(
    refreshToken: string,
    context: RequestAuditContext,
  ): Promise<void> {
    const userId = await this.repository.revokeRefreshFamily(
      sha256(refreshToken),
      this.now(),
    );
    const user = userId
      ? await this.repository.findUserById(userId)
      : null;
    await this.recordAudit(
      "logout",
      user?.id ?? null,
      user?.email ?? "",
      context,
    );
  }

  async authenticateAccessToken(
    token: string,
  ): Promise<PublicAuthUser | null> {
    let subject: string;
    try {
      const { payload } = await jwtVerify(token, this.key, {
        algorithms: ["HS256"],
        issuer: this.issuer,
        audience: this.audience,
        currentDate: this.now(),
      });
      if (
        typeof payload.sub !== "string" ||
        payload.token_use !== "access"
      ) {
        return null;
      }
      subject = payload.sub;
    } catch {
      return null;
    }

    const user = await this.repository.findUserById(subject);
    if (!user || !user.isActive) return null;
    return toPublicUser(user);
  }

  async companyAccess(
    userId: string,
    companyId: string,
  ) {
    return this.repository.getCompanyAccess(userId, companyId);
  }

  async listCompanies(userId: string): Promise<CompanySummary[]> {
    return this.repository.listCompanies(userId);
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
    const name = input.name.trim();
    const countryCode = input.countryCode?.trim().toUpperCase();
    const baseCurrency = input.baseCurrency?.trim().toUpperCase();
    if (!name || name.length > 160) {
      throw new AuthServiceError(400, "invalid_request");
    }
    if (
      countryCode !== undefined &&
      !/^[A-Z]{2}$/.test(countryCode)
    ) {
      throw new AuthServiceError(400, "invalid_request");
    }
    if (
      baseCurrency != null &&
      !/^[A-Z]{3}$/.test(baseCurrency)
    ) {
      throw new AuthServiceError(400, "invalid_request");
    }
    if (
      input.taxRate != null &&
      (!Number.isFinite(input.taxRate) ||
        input.taxRate < 0 ||
        input.taxRate > 100)
    ) {
      throw new AuthServiceError(400, "invalid_request");
    }
    return this.repository.createCompany(userId, {
      ...input,
      name,
      countryCode,
      baseCurrency,
    });
  }

  async addCompanyMember(
    companyId: string,
    email: string,
    role: CompanyMemberRole,
  ): Promise<AddCompanyMemberResult> {
    return this.repository.addCompanyMember(
      companyId,
      normalizeEmail(email),
      role,
    );
  }

  private async issueSession(user: AuthUserRecord): Promise<AuthSession> {
    const now = this.now();
    const familyId = randomUUID();
    const refresh = this.newRefreshCredential(now);
    const token: RefreshTokenInput = {
      ...refresh.token,
      userId: user.id,
      familyId,
    };
    await this.repository.createRefreshToken(token);
    return this.sessionForExistingRefresh(user, refresh.rawToken);
  }

  private async sessionForExistingRefresh(
    user: AuthUserRecord,
    refreshToken: string,
  ): Promise<AuthSession> {
    const accessToken = await new SignJWT({ token_use: "access" })
      .setProtectedHeader({ alg: "HS256", typ: "JWT" })
      .setIssuer(this.issuer)
      .setAudience(this.audience)
      .setSubject(user.id)
      .setIssuedAt()
      .setExpirationTime(`${ACCESS_TOKEN_SECONDS}s`)
      .sign(this.key);

    return {
      user: toPublicUser(user),
      accessToken,
      tokenType: "Bearer",
      expiresIn: ACCESS_TOKEN_SECONDS,
      refreshToken,
      refreshExpiresIn: REFRESH_TOKEN_SECONDS,
    };
  }

  private newRefreshCredential(
    now: Date,
  ): { rawToken: string; token: RefreshTokenReplacement } {
    const rawToken = randomBytes(32).toString("base64url");
    return {
      rawToken,
      token: {
        id: randomUUID(),
        tokenHash: sha256(rawToken),
        expiresAt: new Date(now.getTime() + REFRESH_TOKEN_SECONDS * 1000),
        createdAt: now,
      },
    };
  }

  private async recordAudit(
    eventType: AuthAuditEventType,
    userId: string | null,
    email: string,
    context: RequestAuditContext,
  ): Promise<void> {
    await this.repository.recordAuditEvent({
      id: randomUUID(),
      userId,
      eventType,
      emailKey: sha256(normalizeEmail(email)),
      ipHash: sha256(context.ipAddress),
      userAgent: context.userAgent?.slice(0, 256) ?? null,
      createdAt: this.now(),
    });
  }
}

export function normalizeEmail(email: string): string {
  return email.trim().normalize("NFKC").toLowerCase();
}

export function isPasswordWithinBcryptLimit(password: string): boolean {
  const bytes = Buffer.byteLength(password, "utf8");
  return bytes >= 12 && bytes <= 72;
}

export function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function validateCredentials(email: string, password: string): void {
  if (!email || email.length > 254 || !email.includes("@")) {
    throw new AuthServiceError(400, "invalid_request");
  }
  if (!isPasswordWithinBcryptLimit(password)) {
    throw new AuthServiceError(400, "invalid_request");
  }
}

function toPublicUser(user: AuthUserRecord): PublicAuthUser {
  return {
    id: user.id,
    email: user.email,
    displayName: user.displayName,
  };
}

function isUniqueConstraintError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === "23505"
  );
}
