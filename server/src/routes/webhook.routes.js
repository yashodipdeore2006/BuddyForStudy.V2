import { Router } from "express";
import * as controller from "../controllers/webhook.controller.js";

const router = Router();
router.post("/razorpay", controller.razorpayWebhook);

export default router;
