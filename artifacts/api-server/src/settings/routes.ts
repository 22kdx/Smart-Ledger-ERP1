import {
  Router,
  type IRouter,
  type NextFunction,
  type Request,
  type Response,
} from "express";
import {
  GetCompanySettingsParams,
  UpdateCompanySettingsBody,
} from "@workspace/api-zod";
import type { AuthService } from "../auth/service";
import {
  requireAuthenticatedUser,
  requireCompanyPermission,
} from "../auth/middleware";
import { logger } from "../lib/logger";
import { CompanySettingsService } from "./service";
import { CompanySettingsError } from "./types";

export function createCompanySettingsRouter(
  authService: AuthService | null,
  settingsService: CompanySettingsService | null,
): IRouter {
  const router: IRouter = Router();
  const requireUser = requireAuthenticatedUser(authService);

  router.get(
    "/companies/:companyId/settings",
    validateCompanyParams,
    requireUser,
    requireCompanyPermission(authService, "companies:read"),
    async (req, res, next) => {
      if (!settingsService) {
        res.status(503).json({ error: "settings_unavailable" });
        return;
      }
      try {
        const settings = await settingsService.get(companyIdFrom(req));
        if (!settings) {
          res.status(404).json({ error: "company_not_found" });
          return;
        }
        res.status(200).json(settings);
      } catch (error) {
        next(error);
      }
    },
  );

  router.patch(
    "/companies/:companyId/settings",
    validateCompanyParams,
    requireUser,
    requireCompanyPermission(authService, "settings:manage"),
    async (req, res, next) => {
      const parsed = UpdateCompanySettingsBody.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: "invalid_request" });
        return;
      }
      if (!settingsService) {
        res.status(503).json({ error: "settings_unavailable" });
        return;
      }
      try {
        const settings = await settingsService.update(
          companyIdFrom(req),
          parsed.data,
        );
        if (!settings) {
          res.status(404).json({ error: "company_not_found" });
          return;
        }
        res.status(200).json(settings);
      } catch (error) {
        sendSettingsError(error, res, next);
      }
    },
  );

  router.use(
    (
      error: unknown,
      _req: Request,
      res: Response,
      next: NextFunction,
    ) => {
      if (res.headersSent) {
        next(error);
        return;
      }
      logger.error({ error }, "Company settings route failed");
      res.status(500).json({ error: "internal_error" });
    },
  );

  return router;
}

function validateCompanyParams(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const parsed = GetCompanySettingsParams.safeParse(req.params);
  if (!parsed.success) {
    res.status(400).json({ error: "invalid_company_id" });
    return;
  }
  next();
}

function companyIdFrom(req: Request): string {
  const companyId = req.params.companyId;
  return Array.isArray(companyId) ? companyId[0] : companyId;
}

function sendSettingsError(
  error: unknown,
  res: Response,
  next: NextFunction,
): void {
  if (error instanceof CompanySettingsError) {
    res.status(error.statusCode).json({ error: error.code });
    return;
  }
  next(error);
}
