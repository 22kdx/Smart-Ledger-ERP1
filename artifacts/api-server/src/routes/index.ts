import { Router, type IRouter } from "express";
import healthRouter from "./health";
import { createAuthRuntime } from "../auth/runtime";
import { createAuthRouter } from "../auth/routes";

const router: IRouter = Router();
const authRuntime = createAuthRuntime();

router.use(healthRouter);
router.use(createAuthRouter(authRuntime.service));

export async function closeAuthRuntime(): Promise<void> {
  await authRuntime.close();
}

export default router;
