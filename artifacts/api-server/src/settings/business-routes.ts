import {
  CreateCompanyExchangeRateBody,
  CreateCompanyExchangeRateParams,
  CreateCompanyTaxRuleBody,
  CreateCompanyTaxRuleParams,
  DeleteCompanyExchangeRateParams,
  ListCompanyExchangeRatesParams,
  ListCompanyTaxRulesParams,
  UpdateCompanyTaxRuleBody,
  UpdateCompanyTaxRuleParams,
} from "@workspace/api-zod";
import {
  Router,
  type IRouter,
  type NextFunction,
  type Request,
  type Response,
} from "express";
import {
  requireAuthenticatedUser,
  requireCompanyPermission,
} from "../auth/middleware";
import type { AuthService } from "../auth/service";
import { logger } from "../lib/logger";
import { CompanyBusinessSettingsService } from "./business-service";
import { CompanyBusinessSettingsError } from "./business-types";

export function createCompanyBusinessSettingsRouter(
  authService: AuthService | null,
  settingsService: CompanyBusinessSettingsService | null,
): IRouter {
  const router: IRouter = Router();
  const requireUser = requireAuthenticatedUser(authService);

  router.get(
    "/companies/:companyId/tax-rules",
    validateParams(ListCompanyTaxRulesParams),
    requireUser,
    requireCompanyPermission(authService, "companies:read"),
    async (req, res, next) => {
      if (!settingsService) {
        res.status(503).json({ error: "settings_unavailable" });
        return;
      }
      try {
        const taxRules = await settingsService.listTaxRules(companyIdFrom(req));
        res.status(200).json({ taxRules });
      } catch (error) {
        next(error);
      }
    },
  );

  router.post(
    "/companies/:companyId/tax-rules",
    validateParams(CreateCompanyTaxRuleParams),
    requireUser,
    requireCompanyPermission(authService, "settings:manage"),
    async (req, res, next) => {
      const parsed = CreateCompanyTaxRuleBody.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: "invalid_request" });
        return;
      }
      if (!settingsService) {
        res.status(503).json({ error: "settings_unavailable" });
        return;
      }
      try {
        const taxRule = await settingsService.createTaxRule(
          companyIdFrom(req),
          parsed.data,
        );
        res.status(201).json(taxRule);
      } catch (error) {
        sendBusinessSettingsError(error, res, next);
      }
    },
  );

  router.patch(
    "/companies/:companyId/tax-rules/:taxRuleId",
    validateParams(UpdateCompanyTaxRuleParams),
    requireUser,
    requireCompanyPermission(authService, "settings:manage"),
    async (req, res, next) => {
      const parsed = UpdateCompanyTaxRuleBody.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: "invalid_request" });
        return;
      }
      if (!settingsService) {
        res.status(503).json({ error: "settings_unavailable" });
        return;
      }
      try {
        const taxRuleId = paramFrom(req, "taxRuleId");
        const taxRule = await settingsService.updateTaxRule(
          companyIdFrom(req),
          taxRuleId,
          parsed.data,
        );
        if (!taxRule) {
          res.status(404).json({ error: "tax_rule_not_found" });
          return;
        }
        res.status(200).json(taxRule);
      } catch (error) {
        sendBusinessSettingsError(error, res, next);
      }
    },
  );

  router.get(
    "/companies/:companyId/exchange-rates",
    validateParams(ListCompanyExchangeRatesParams),
    requireUser,
    requireCompanyPermission(authService, "companies:read"),
    async (req, res, next) => {
      if (!settingsService) {
        res.status(503).json({ error: "settings_unavailable" });
        return;
      }
      try {
        const exchangeRates = await settingsService.listExchangeRates(
          companyIdFrom(req),
        );
        res.status(200).json({ exchangeRates });
      } catch (error) {
        next(error);
      }
    },
  );

  router.post(
    "/companies/:companyId/exchange-rates",
    validateParams(CreateCompanyExchangeRateParams),
    requireUser,
    requireCompanyPermission(authService, "settings:manage"),
    async (req, res, next) => {
      const parsed = CreateCompanyExchangeRateBody.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: "invalid_request" });
        return;
      }
      if (!settingsService) {
        res.status(503).json({ error: "settings_unavailable" });
        return;
      }
      try {
        const exchangeRate = await settingsService.createExchangeRate(
          companyIdFrom(req),
          {
            ...parsed.data,
            effectiveDate: parsed.data.effectiveDate.toISOString().slice(0, 10),
          },
        );
        res.status(201).json(exchangeRate);
      } catch (error) {
        sendBusinessSettingsError(error, res, next);
      }
    },
  );

  router.delete(
    "/companies/:companyId/exchange-rates/:exchangeRateId",
    validateParams(DeleteCompanyExchangeRateParams),
    requireUser,
    requireCompanyPermission(authService, "settings:manage"),
    async (req, res, next) => {
      if (!settingsService) {
        res.status(503).json({ error: "settings_unavailable" });
        return;
      }
      try {
        const deleted = await settingsService.deleteExchangeRate(
          companyIdFrom(req),
          paramFrom(req, "exchangeRateId"),
        );
        if (!deleted) {
          res.status(404).json({ error: "exchange_rate_not_found" });
          return;
        }
        res.status(204).end();
      } catch (error) {
        next(error);
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
      logger.error({ error }, "Company business settings route failed");
      res.status(500).json({ error: "internal_error" });
    },
  );

  return router;
}

function validateParams(
  schema: {
    safeParse: (value: unknown) => { success: boolean };
  },
) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!schema.safeParse(req.params).success) {
      res.status(400).json({ error: "invalid_request_parameters" });
      return;
    }
    next();
  };
}

function companyIdFrom(req: Request): string {
  return paramFrom(req, "companyId");
}

function paramFrom(req: Request, key: string): string {
  const value = req.params[key];
  return Array.isArray(value) ? value[0] : value;
}

function sendBusinessSettingsError(
  error: unknown,
  res: Response,
  next: NextFunction,
): void {
  if (error instanceof CompanyBusinessSettingsError) {
    res.status(error.statusCode).json({ error: error.code });
    return;
  }
  next(error);
}
