import type { RequestHandler } from "express";
import type { AuthService } from "./service";
import type { CompanyAccessRecord, PublicAuthUser } from "./types";
import type { CompanyPermission } from "./permissions";

declare global {
  namespace Express {
    interface Request {
      authUser?: PublicAuthUser;
      companyAccess?: CompanyAccessRecord;
    }
  }
}

export function requireAuthenticatedUser(
  service: AuthService | null,
): RequestHandler {
  return async (req, res, next) => {
    if (!service) {
      res.status(503).json({ error: "auth_unavailable" });
      return;
    }

    const authorization = req.get("authorization");
    const match = authorization?.match(/^Bearer ([^\s]+)$/i);
    if (!match) {
      res.status(401).json({ error: "unauthorized" });
      return;
    }

    try {
      const user = await service.authenticateAccessToken(match[1]);
      if (!user) {
        res.status(401).json({ error: "unauthorized" });
        return;
      }
      req.authUser = user;
      next();
    } catch (error) {
      next(error);
    }
  };
}

export function requireCompanyPermission(
  service: AuthService | null,
  permission: CompanyPermission,
): RequestHandler {
  return async (req, res, next) => {
    if (!service) {
      res.status(503).json({ error: "auth_unavailable" });
      return;
    }
    if (!req.authUser) {
      res.status(401).json({ error: "unauthorized" });
      return;
    }

    const companyParam = req.params.companyId;
    const companyId = Array.isArray(companyParam)
      ? companyParam[0]
      : companyParam;
    if (!companyId) {
      res.status(400).json({ error: "company_id_required" });
      return;
    }

    try {
      const access = await service.companyAccess(req.authUser.id, companyId);
      if (!access || !access.permissions.includes(permission)) {
        res.status(403).json({ error: "company_access_denied" });
        return;
      }
      req.companyAccess = access;
      next();
    } catch (error) {
      next(error);
    }
  };
}
