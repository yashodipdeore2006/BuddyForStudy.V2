import { User } from "../models/User.js";
import { PlatformSetting } from "../models/PlatformSetting.js";
import { recordAuditEvent } from "../services/auditOutbox.service.js";
import { failure, success } from "../utils/response.js";
import { isValidObjectId } from "../utils/ids.js";
import { ADMIN_ROLE_PROFILES, getAdminPermissions, isAdminRoleProfile } from "../utils/adminRbac.js";

export async function currentAdminAccess(req, res) {
  const adminRole = req.user?.adminRole || "platform_admin";
  const profile = ADMIN_ROLE_PROFILES[adminRole];
  return success(res, {
    access: {
      adminRole,
      roleLabel: profile?.label || "Administrator",
      permissions: getAdminPermissions(adminRole, req.user?.adminPermissionOverrides || []),
    },
  });
}


const AI_SETTING_DEFAULTS = Object.freeze({
  advanced_ai_questions_per_hour_video: { value: 10, type: "number", min: 1, max: 100, description: "Maximum lesson questions generated per video hour." },
  advanced_ai_questions_unknown_duration: { value: 10, type: "number", min: 1, max: 100, description: "Question cap when lesson duration is unknown." },
  advanced_ai_max_questions_per_lesson: { value: 50, type: "number", min: 1, max: 200, description: "Hard cap for generated questions per lesson." },
  advanced_ai_summary_enabled: { value: true, type: "boolean", description: "Enable AI-generated lesson summaries." },
  advanced_ai_qa_enabled: { value: true, type: "boolean", description: "Enable AI lesson question answering." },
  discovery_max_skills_per_course: { value: 12, type: "number", min: 1, max: 30, description: "Maximum skills/modules in a generated learning course." },
  discovery_search_results_per_query: { value: 20, type: "number", min: 5, max: 50, description: "YouTube candidate results collected per skill search query." },
  discovery_min_duration_minutes: { value: 30, type: "number", min: 0, max: 1200, description: "Global minimum accepted video duration for discovery." },
  discovery_max_duration_minutes: { value: 3600, type: "number", min: 30, max: 6000, description: "Global maximum accepted video duration for discovery." },
  discovery_exclude_shorts: { value: true, type: "boolean", description: "Exclude YouTube Shorts from course discovery." },
  discovery_require_embeddable: { value: true, type: "boolean", description: "Only select videos that can be embedded." },
});

export async function getAIContentSettings(_req, res, next) {
  try {
    const saved = await PlatformSetting.find({ key: { $in: Object.keys(AI_SETTING_DEFAULTS) } }).lean();
    const values = Object.fromEntries(saved.map((setting) => [setting.key, setting.value]));
    const settings = Object.entries(AI_SETTING_DEFAULTS).map(([key, config]) => ({
      key,
      value: values[key] === undefined ? config.value : values[key],
      defaultValue: config.value,
      type: config.type,
      min: config.min,
      max: config.max,
      description: config.description,
    }));
    return success(res, { settings });
  } catch (error) { return next(error); }
}

export async function updateAIContentSetting(req, res, next) {
  try {
    const key = String(req.params.key || "");
    const config = AI_SETTING_DEFAULTS[key];
    if (!config) return failure(res, "Unsupported AI/content setting.", 400);
    const value = req.body?.value;
    if (config.type === "boolean" && typeof value !== "boolean") {
      return failure(res, "This setting requires a boolean value.", 400);
    }
    if (config.type === "number" && (!Number.isFinite(Number(value)) || Number(value) < config.min || Number(value) > config.max)) {
      return failure(res, `Value must be between ${config.min} and ${config.max}.`, 400);
    }
    const normalized = config.type === "number" ? Math.trunc(Number(value)) : value;
    if (key === "discovery_min_duration_minutes") {
      const currentMax = await PlatformSetting.findOne({ key: "discovery_max_duration_minutes" }).lean();
      if (Number(currentMax?.value ?? AI_SETTING_DEFAULTS.discovery_max_duration_minutes.value) < normalized) {
        return failure(res, "Minimum video duration cannot exceed the maximum video duration.", 400);
      }
    }
    if (key === "discovery_max_duration_minutes") {
      const currentMin = await PlatformSetting.findOne({ key: "discovery_min_duration_minutes" }).lean();
      if (Number(currentMin?.value ?? AI_SETTING_DEFAULTS.discovery_min_duration_minutes.value) > normalized) {
        return failure(res, "Maximum video duration cannot be below the minimum video duration.", 400);
      }
    }
    const current = await PlatformSetting.findOne({ key });
    const before = current?.value ?? config.value;
    const setting = await PlatformSetting.findOneAndUpdate(
      { key },
      { $set: { value: normalized, description: config.description, isPublic: false, updatedBy: req.user.user?._id || req.user.userId } },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
    const auditResult = await recordAuditEvent({
      actor: req.user.user?._id || req.user.userId,
      action: "ai_content.setting.updated",
      targetType: "PlatformSetting",
      targetId: String(setting._id),
      reason: String(req.body?.reason || "AI & Learning Content Manager updated a setting").trim().slice(0, 500),
      before: { key, value: before },
      after: { key, value: normalized },
      ip: String(req.ip || "").slice(0, 100),
      userAgent: String(req.get?.("user-agent") || "").slice(0, 500),
    });
    return success(res, {
      setting: { key, value: normalized },
      auditLogRecorded: auditResult.recorded,
      auditQueued: auditResult.queued,
    }, auditResult.recorded ? "AI/content setting updated."
      : auditResult.queued ? "AI/content setting updated; audit event queued for retry."
      : "AI/content setting updated, but its audit event could not be recorded or queued. Notify a Super Admin.");
  } catch (error) { return next(error); }
}

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

    const auditResult = await recordAuditEvent({
      actor: req.user.userId,
      action: "admin.role.updated",
      targetType: "user",
      targetId: target._id.toString(),
      reason: reason.trim(),
      before,
      after: { adminRole },
      ip: String(req.ip || "").slice(0, 100),
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
      auditLogRecorded: auditResult.recorded,
      auditQueued: auditResult.queued,
    }, auditResult.recorded ? "Administrator role updated."
      : auditResult.queued ? "Administrator role updated; audit event queued for retry."
      : "Administrator role updated, but its audit event could not be recorded or queued. Notify a Super Admin.");
  } catch (error) {
    return next(error);
  }
}
