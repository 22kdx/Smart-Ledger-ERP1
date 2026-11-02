import {
  Router,
  type IRouter,
  type NextFunction,
  type Request,
  type Response,
} from "express";
import {
  AddCompanyMemberBody,
  AddCompanyMemberParams,
  CreateCompanyBody,
  GetCompanyAuthorizationParams,
  LoginAuthUserBody,
  LogoutAuthUserBody,
  RefreshAuthSessionBody,
  RegisterAuthUserBody,
} from "@workspace/api-zod";
import type { AuthService } from "./service";
import { AuthServiceError } from "./types";
import { createRateLimiter } from "./rate-limit";
import {
  requireAuthenticatedUser,
  requireCompanyPermission,
} from "./middleware";
import { logger } from "../lib/logger";

const loginLimit = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  maxRequests: 10,
});
const registerLimit = createRateLimiter({
  windowMs: 60 * 60 * 1000,
  maxRequests: 5,
});
const refreshLimit = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  maxRequests: 30,
});
const logoutLimit = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  maxRequests: 30,
});

export function createAuthRouter(service: AuthService | null): IRouter {
  const router: IRouter = Router();
  const requireUser = requireAuthenticatedUser(service);

  router.use((_req, res, next) => {
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("Pragma", "no-cache");
    next();
  });

  router.post("/auth/register", registerLimit, async (req, res, next) => {
    const parsed = RegisterAuthUserBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "invalid_request" });
      return;
    }
    if (!service) {
      res.status(503).json({ error: "auth_unavailable" });
      return;
    }

    try {
      const session = await service.register(parsed.data, auditContext(req));
      res.status(201).json(session);
    } catch (error) {
      sendAuthError(error, res, next);
    }
  });

  router.post("/auth/login", loginLimit, async (req, res, next) => {
    const parsed = LoginAuthUserBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "invalid_request" });
      return;
    }
    if (!service) {
      res.status(503).json({ error: "auth_unavailable" });
      return;
    }

    try {
      const session = await service.login(parsed.data, auditContext(req));
      res.status(200).json(session);
    } catch (error) {
      sendAuthError(error, res, next);
    }
  });

  router.post("/auth/refresh", refreshLimit, async (req, res, next) => {
    const parsed = RefreshAuthSessionBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "invalid_request" });
      return;
    }
    if (!service) {
      res.status(503).json({ error: "auth_unavailable" });
      return;
    }

    try {
      const session = await service.refresh(
        parsed.data.refreshToken,
        auditContext(req),
      );
      res.status(200).json(session);
    } catch (error) {
      sendAuthError(error, res, next);
    }
  });

  router.post("/auth/logout", logoutLimit, async (req, res, next) => {
    const parsed = LogoutAuthUserBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "invalid_request" });
      return;
    }
    if (!service) {
      res.status(503).json({ error: "auth_unavailable" });
      return;
    }

    try {
      await service.logout(parsed.data.refreshToken, auditContext(req));
      res.status(200).json({ ok: true });
    } catch (error) {
      next(error);
    }
  });

  router.get("/auth/me", requireUser, (req, res) => {
    res.status(200).json({ user: req.authUser });
  });

  router.get("/companies", requireUser, async (req, res, next) => {
    if (!service || !req.authUser) {
      res.status(503).json({ error: "auth_unavailable" });
      return;
    }
    try {
      const companies = await service.listCompanies(req.authUser.id);
      res.status(200).json({ companies });
    } catch (error) {
      next(error);
    }
  });

  router.post("/companies", requireUser, async (req, res, next) => {
    const parsed = CreateCompanyBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "invalid_request" });
      return;
    }
    if (!service || !req.authUser) {
      res.status(503).json({ error: "auth_unavailable" });
      return;
    }
    try {
      const company = await service.createCompany(
        req.authUser.id,
        parsed.data,
      );
      res.status(201).json(company);
    } catch (error) {
      sendAuthError(error, res, next);
    }
  });

  router.get(
    "/companies/:companyId/authorization",
    (req, res, next) => {
      const parsed = GetCompanyAuthorizationParams.safeParse(req.params);
      if (!parsed.success) {
        res.status(400).json({ error: "invalid_company_id" });
        return;
      }
      next();
    },
    requireUser,
    requireCompanyPermission(service, "companies:read"),
    (req, res) => {
      res.status(200).json({
        companyId: req.companyAccess?.companyId,
        role: req.companyAccess?.role,
        permissions: req.companyAccess?.permissions ?? [],
      });
    },
  );

  router.post(
    "/companies/:companyId/members",
    (req, res, next) => {
      const parsed = AddCompanyMemberParams.safeParse(req.params);
      if (!parsed.success) {
        res.status(400).json({ error: "invalid_company_id" });
        return;
      }
      next();
    },
    requireUser,
    requireCompanyPermission(service, "members:manage"),
    async (req, res, next) => {
      const parsed = AddCompanyMemberBody.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: "invalid_request" });
        return;
      }
      if (!service || !req.companyAccess) {
        res.status(503).json({ error: "auth_unavailable" });
        return;
      }
      if (
        parsed.data.role === "admin" &&
        req.companyAccess.role !== "owner"
      ) {
        res.status(403).json({ error: "role_assignment_denied" });
        return;
      }

      try {
        const companyParam = req.params.companyId;
        const companyId = Array.isArray(companyParam)
          ? companyParam[0]
          : companyParam;
        if (!companyId) {
          res.status(400).json({ error: "invalid_company_id" });
          return;
        }
        const result = await service.addCompanyMember(
          companyId,
          parsed.data.email,
          parsed.data.role,
        );
        switch (result.status) {
          case "added":
            res.status(201).json(result.member);
            return;
          case "user_not_found":
            res.status(404).json({ error: "registered_account_not_found" });
            return;
          case "already_member":
            res.status(409).json({ error: "already_a_member" });
            return;
          case "company_not_found":
            res.status(404).json({ error: "company_not_found" });
            return;
        }
      } catch (error) {
        next(error);
      }
    },
  );

  router.use((error: unknown, _req: Request, res: Response, next: NextFunction) => {
    if (res.headersSent) {
      next(error);
      return;
    }
    logger.error({ error }, "Authentication route failed");
    res.status(500).json({ error: "internal_error" });
  });

  return router;
}

function auditContext(req: Request) {
  return {
    ipAddress: req.ip || req.socket.remoteAddress || "unknown",
    userAgent: req.get("user-agent") ?? null,
  };
}

function sendAuthError(error: unknown, res: Response, next: NextFunction): void {
  if (error instanceof AuthServiceError) {
    res.status(error.statusCode).json({ error: error.code });
    return;
  }
  next(error);
}
