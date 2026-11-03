import { Router, type IRouter } from "express";
import healthRouter from "./health";
import { createAuthRuntime } from "../auth/runtime";
import { createAuthRouter } from "../auth/routes";
import { createCompanySettingsRouter } from "../settings/routes";
import { createCompanyBusinessSettingsRouter } from "../settings/business-routes";

const router: IRouter = Router();
const authRuntime = createAuthRuntime();

router.use(healthRouter);
router.use(createAuthRouter(authRuntime.service));
router.use(
  createCompanySettingsRouter(
    authRuntime.service,
    authRuntime.companySettingsService,
  ),
);
router.use(
  createCompanyBusinessSettingsRouter(
    authRuntime.service,
    authRuntime.companyBusinessSettingsService,
  ),
);

export async function closeAuthRuntime(): Promise<void> {
  await authRuntime.close();
}

export default router;
