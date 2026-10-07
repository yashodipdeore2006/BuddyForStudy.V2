import { Router } from "express";
import * as controller from "../controllers/auth.controller.js";
import { authMiddleware } from "../middleware/auth.js";

const router = Router();

router.post("/register", controller.register);
router.post("/login", controller.login);
router.post("/verify-email", controller.verifyEmail);
router.post("/resend-otp", controller.resendOtp);
router.post("/forgot-password", controller.forgotPassword);
router.post("/reset-password", controller.resetPassword);
router.get("/google/config", controller.googleConfig);
router.post("/google", controller.googleLogin);
router.put("/profile", authMiddleware, controller.updateProfile);
router.post("/change-password", authMiddleware, controller.changePassword);
router.post("/logout", authMiddleware, controller.logout);
router.get("/me", authMiddleware, controller.me);

export default router;
