export type AuthUserRecord = {
  id: string;
  email: string;
  displayName: string;
  passwordHash: string;
  isActive: boolean;
};

export type PublicAuthUser = Pick<
  AuthUserRecord,
  "id" | "email" | "displayName"
>;

export type AuthAuditEventType =
  | "register_success"
  | "login_success"
  | "login_failed"
  | "login_locked"
  | "refresh_success"
  | "refresh_reuse"
  | "logout";

export type AuthAuditEvent = {
  id: string;
  userId: string | null;
  eventType: AuthAuditEventType;
  emailKey: string;
  ipHash: string;
  userAgent: string | null;
  createdAt: Date;
};

export type LoginThrottleKey = {
  emailKey: string;
  ipHash: string;
};

export type RefreshTokenInput = {
  id: string;
  userId: string;
  familyId: string;
  tokenHash: string;
  expiresAt: Date;
  createdAt: Date;
};

export type RefreshTokenReplacement = Pick<
  RefreshTokenInput,
  "id" | "tokenHash" | "expiresAt" | "createdAt"
>;

export type RefreshRotationResult =
  | { status: "rotated"; user: AuthUserRecord }
  | { status: "reused"; userId: string }
  | { status: "invalid" | "expired" | "inactive" };

export type CompanyAccessRecord = {
  companyId: string;
  role:
    | "owner"
    | "admin"
    | "accountant"
    | "sales"
    | "purchasing"
    | "inventory"
    | "hr"
    | "viewer";
  permissions: string[];
};

export type CompanySummary = {
  id: string;
  name: string;
  countryCode: string | null;
  baseCurrency: string | null;
  taxRate: number | null;
  role: CompanyAccessRecord["role"];
};

export type CompanyMemberRole = Exclude<
  CompanyAccessRecord["role"],
  "owner"
>;

export type CompanyMemberRecord = {
  userId: string;
  email: string;
  role: CompanyMemberRole;
};

export type AddCompanyMemberResult =
  | { status: "added"; member: CompanyMemberRecord }
  | {
      status: "company_not_found" | "user_not_found" | "already_member";
    };

export interface AuthRepository {
  findUserByEmail(email: string): Promise<AuthUserRecord | null>;
  findUserById(id: string): Promise<AuthUserRecord | null>;
  createUser(
    user: AuthUserRecord & { createdAt: Date },
  ): Promise<AuthUserRecord>;
  isLoginLocked(
    key: LoginThrottleKey,
    now: Date,
  ): Promise<boolean>;
  recordFailedLogin(
    key: LoginThrottleKey,
    now: Date,
    windowMs: number,
    maxAttempts: number,
    lockMs: number,
  ): Promise<Date | null>;
  clearLoginFailures(key: LoginThrottleKey): Promise<void>;
  recordAuditEvent(event: AuthAuditEvent): Promise<void>;
  createRefreshToken(token: RefreshTokenInput): Promise<void>;
  rotateRefreshToken(
    tokenHash: string,
    replacement: RefreshTokenReplacement,
    now: Date,
  ): Promise<RefreshRotationResult>;
  revokeRefreshFamily(tokenHash: string, now: Date): Promise<string | null>;
  getCompanyAccess(
    userId: string,
    companyId: string,
  ): Promise<CompanyAccessRecord | null>;
  listCompanies(userId: string): Promise<CompanySummary[]>;
  createCompany(
    userId: string,
    input: {
      name: string;
      countryCode?: string;
      baseCurrency?: string | null;
      taxRate?: number | null;
    },
  ): Promise<CompanySummary>;
  addCompanyMember(
    companyId: string,
    email: string,
    role: CompanyMemberRole,
  ): Promise<AddCompanyMemberResult>;
}

export class AuthServiceError extends Error {
  constructor(
    readonly statusCode: number,
    readonly code: string,
  ) {
    super(code);
    this.name = "AuthServiceError";
  }
}
