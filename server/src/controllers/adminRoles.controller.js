import { User } from "../models/User.js";
import { AuditLog } from "../models/AuditLog.js";
import { failure, success } from "../utils/response.js";
import { isValidObjectId } from "../utils/ids.js";
import { ADMIN_ROLE_PROFILES, getAdminPermissions, isAdminRoleProfile } from "../utils/adminRbac.js";

export async function listAdminRoles(_req, res) {
  const roles = Object.entries(ADMIN_ROLE_PROFILES).map(([key, profile]) => ({
    key,
    label: profile.label,
    description: profile.description,
    permissions: getAdminPermissions(key),
  }));
  return success(res, { roles });
}

export async function listAdministrators(_req, res, next) {
  try {
    const administrators = await User.find({ role: "admin" })
      .select("name email adminRole adminPermissionOverrides isActive emailVerified createdAt updatedAt")
      .sort({ createdAt: -1 })
      .lean();
    return success(res, {
      administrators: administrators.map((admin) => ({
        ...admin,
        effectivePermissions: getAdminPermissions(admin.adminRole || "platform_admin", admin.adminPermissionOverrides || []),
      })),
    });
  } catch (error) {
    return next(error);
  }
}

export async function updateAdministratorRole(req, res, next) {
  try {
    const { userId } = req.params;
    const { adminRole, reason = "" } = req.body || {};
    if (!isValidObjectId(userId)) return failure(res, "Invalid administrator ID.", 400);
    if (!isAdminRoleProfile(adminRole)) return failure(res, "A valid administrator role profile is required.", 400);
    if (typeof reason !== "string" || reason.length > 500) {
      return failure(res, "Reason must be a string of at most 500 characters.", 400);
    }

    if (String(req.user?.userId) === String(userId)) {
      return failure(res, "You cannot change your own administrator role.", 409);
    }

    const target = await User.findOne({ _id: userId, role: "admin" });
    if (!target) return failure(res, "Administrator not found.", 404);

    const previousRole = target.adminRole || "platform_admin";
    if (previousRole === adminRole) {
      return success(res, {
        administrator: {
          id: target._id.toString(),
          email: target.email,
          adminRole: previousRole,
          permissions: getAdminPermissions(previousRole, target.adminPermissionOverrides || []),
        },
      }, "Administrator role is already assigned.");
    }

    if (previousRole === "super_admin" && adminRole !== "super_admin" && target.isActive) {
      const activeSuperAdmins = await User.countDocuments({
        role: "admin",
        adminRole: "super_admin",
        isActive: true,
      });
      if (activeSuperAdmins <= 1) {
        return failure(res, "The last active Super Admin cannot be demoted.", 409);
      }
    }

    const before = { adminRole: previousRole };
    target.adminRole = adminRole;
    target.adminPermissionOverrides = [];
    await target.save();

    await AuditLog.create({
      actor: req.user.userId,
      action: "admin.role.updated",
      targetType: "user",
      targetId: target._id.toString(),
      reason: reason.trim(),
      before,
      after: { adminRole },
      ip: req.ip || "",
      userAgent: String(req.get?.("user-agent") || "").slice(0, 500),
    });

    return success(res, {
      administrator: {
        id: target._id.toString(),
        name: target.name,
        email: target.email,
        adminRole: target.adminRole,
        permissions: getAdminPermissions(target.adminRole),
      },
    }, "Administrator role updated.");
  } catch (error) {
    return next(error);
  }
}
