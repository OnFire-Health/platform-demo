import { Router, type IRouter } from "express";
import healthRouter from "./health";
import sessionRouter from "./session";
import platformRouter from "./platform";
import connectionsRouter from "./connections";
import oauthRouter from "./oauth";
import webhooksRouter from "./webhooks";
import checkoutSessionsRouter from "./checkoutSessions";

const router: IRouter = Router();

router.use(healthRouter);
router.use(sessionRouter);
router.use(platformRouter);
router.use(connectionsRouter);
router.use(checkoutSessionsRouter);
router.use(oauthRouter);
router.use(webhooksRouter);

export default router;
