export const COMPANY_PERMISSIONS = [
  "companies:read",
  "companies:manage",
  "members:manage",
  "settings:manage",
  "accounts:read",
  "accounts:write",
  "journals:read",
  "journals:write",
  "sales:read",
  "sales:write",
  "purchasing:read",
  "purchasing:write",
  "inventory:read",
  "inventory:write",
  "hr:read",
  "hr:write",
] as const;

export type CompanyPermission = (typeof COMPANY_PERMISSIONS)[number];
