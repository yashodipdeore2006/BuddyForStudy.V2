import { Router } from "express";
import { authMiddleware, adminMiddleware, adminPermissionMiddleware } from "../middleware/auth.js";
import * as legal from "../controllers/legal.controller.js";

const router = Router();
router.get("/documents", legal.listPublic);
router.get("/documents/:slug", legal.getPublic);

router.get("/admin/documents", authMiddleware, adminMiddleware, adminPermissionMiddleware("legal.manage"), legal.listAdmin);
router.post("/admin/documents", authMiddleware, adminMiddleware, adminPermissionMiddleware("legal.manage"), legal.createDraft);
router.put("/admin/documents/:documentId", authMiddleware, adminMiddleware, adminPermissionMiddleware("legal.manage"), legal.updateDraft);
router.post("/admin/documents/:documentId/publish", authMiddleware, adminMiddleware, adminPermissionMiddleware("legal.manage"), legal.publish);
router.post("/admin/documents/:documentId/unpublish", authMiddleware, adminMiddleware, adminPermissionMiddleware("legal.manage"), legal.unpublish);
router.post("/admin/documents/:documentId/archive", authMiddleware, adminMiddleware, adminPermissionMiddleware("legal.manage"), legal.archive);
router.get("/admin/documents/:documentId/history", authMiddleware, adminMiddleware, adminPermissionMiddleware("legal.manage"), legal.history);

export default router;
