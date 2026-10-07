import { Router } from "express";
import * as controller from "../controllers/adminAuth.controller.js";

const router = Router();

router.post("/login", controller.login);

export default router;
