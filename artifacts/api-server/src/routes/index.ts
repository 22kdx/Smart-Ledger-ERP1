import { Router, type IRouter } from "express";
import healthRouter from "./health";
import { createAuthRuntime } from "../auth/runtime";
import { createAuthRouter } from "../auth/routes";
import { createCompanySettingsRouter } from "../settings/routes";

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

export async function closeAuthRuntime(): Promise<void> {
  await authRuntime.close();
}

export default router;
