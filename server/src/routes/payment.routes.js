import { Router } from "express";
import { authMiddleware } from "../middleware/auth.js";
import { env } from "../config/env.js";
import { createPaymentAvailabilityMiddleware } from "../middleware/paymentAvailability.js";
import * as controller from "../controllers/payment.controller.js";

const router = Router();
router.use(authMiddleware);

const requirePaymentsEnabled = createPaymentAvailabilityMiddleware({ enabled: env.paymentsEnabled });
router.post("/course/order", requirePaymentsEnabled, controller.createCourseOrder);
router.post("/course/verify", controller.verifyCoursePayment);
router.post("/subscription/order", requirePaymentsEnabled, controller.createSubscriptionOrder);

export default router;
