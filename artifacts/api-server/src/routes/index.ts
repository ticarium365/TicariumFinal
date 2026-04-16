import { Router, type IRouter } from "express";
import healthRouter from "./health.js";
import authRouter from "./auth.js";
import usersRouter from "./users.js";
import productsRouter from "./products.js";
import salesRouter from "./sales.js";
import dashboardRouter from "./dashboard.js";
import reportsRouter from "./reports.js";
import settingsRouter from "./settings.js";
import catalogRouter from "./catalog.js";
import stockRouter from "./stock.js";
import companiesRouter from "./companies.js";
import paymentRouter from "./payment.js";

const router: IRouter = Router();

router.use(healthRouter);
router.use("/auth", authRouter);
router.use("/users", usersRouter);
router.use("/products", productsRouter);
router.use("/sales", salesRouter);
router.use("/stock", stockRouter);
router.use("/dashboard", dashboardRouter);
router.use("/reports", reportsRouter);
router.use("/settings", settingsRouter);
router.use("/catalog", catalogRouter);
router.use("/companies", companiesRouter);
router.use("/payment", paymentRouter);

export default router;
