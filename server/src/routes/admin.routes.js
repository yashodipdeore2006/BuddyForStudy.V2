import { Router } from "express";
import { authMiddleware, adminMiddleware } from "../middleware/auth.js";
import * as controller from "../controllers/admin.controller.js";

const router = Router();

router.use(authMiddleware, adminMiddleware);
router.get("/users", controller.users);
router.put("/users/:userId", controller.updateUser);
router.get("/analytics", controller.analytics);

export default router;
