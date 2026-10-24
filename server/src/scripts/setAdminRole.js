import dotenv from "dotenv";
import mongoose from "mongoose";
import { env } from "../config/env.js";
import { User } from "../models/User.js";
import { AuditLog } from "../models/AuditLog.js";
import { isAdminRoleProfile } from "../utils/adminRbac.js";

dotenv.config();

const email = String(process.env.ADMIN_EMAIL || "").trim().toLowerCase();
const adminRole = String(process.env.ADMIN_ROLE || "").trim();
if (!email) throw new Error("ADMIN_EMAIL is required to assign an administrator profile.");
if (!isAdminRoleProfile(adminRole)) {
  throw new Error("ADMIN_ROLE must be one of: super_admin, platform_admin, ai_content_manager, finance_manager, support_manager, analyst_auditor");
}

await mongoose.connect(env.mongoUri);
try {
  const administrator = await User.findOne({ email, role: "admin" });
  if (!administrator) {
    throw new Error("No administrator account exists for ADMIN_EMAIL. Create or promote the account through the approved bootstrap process first.");
  }

  const previousRole = administrator.adminRole || "platform_admin";
  if (previousRole === adminRole) {
    console.log("Administrator already has profile:", adminRole);
  } else {
    if (previousRole === "super_admin" && adminRole !== "super_admin" && administrator.isActive) {
      const activeSuperAdmins = await User.countDocuments({ role: "admin", adminRole: "super_admin", isActive: true });
      if (activeSuperAdmins <= 1) throw new Error("Cannot demote the last active Super Admin.");
    }
    administrator.adminRole = adminRole;
    administrator.adminPermissionOverrides = [];
    await administrator.save();
    await AuditLog.create({
      actor: null,
      action: "admin.role.bootstrap",
      targetType: "user",
      targetId: administrator._id.toString(),
      reason: "Administrator profile assigned through the protected deployment bootstrap script.",
      before: { adminRole: previousRole },
      after: { adminRole },
      ip: "",
      userAgent: "setAdminRole.js",
    });
    console.log("Administrator profile updated:", administrator.email, "->", adminRole);
  }
} finally {
  await mongoose.disconnect();
}
