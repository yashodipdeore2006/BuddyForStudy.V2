export const ADMIN_ROLE_PROFILES = Object.freeze({
  super_admin: {
    label: "Super Admin",
    description: "Full platform governance and security access.",
    permissions: ["*"],
  },
  platform_admin: {
    label: "Platform Administrator",
    description: "Day-to-day user, course and platform operations.",
    permissions: [
      "dashboard.read", "saved_views.manage", "users.read", "users.manage", "users.pii.reveal",
      "courses.read", "courses.manage", "courses.publish", "operations.manage",
      "analytics.read", "plans.read", "billing.read",
      "communications.send", "communications.manage", "notifications.read", "notifications.retry", "coupons.read",
      "settings.read", "audit.read", "operations.read",
    ],
  },
  ai_content_manager: {
    label: "AI & Learning Content Manager",
    description: "Learning content, curriculum and AI resource operations.",
    permissions: [
      "dashboard.read", "saved_views.manage", "courses.read", "courses.manage", "courses.publish",
      "ai.manage", "resources.manage", "analytics.read", "operations.read",
    ],
  },
  finance_manager: {
    label: "Finance & Subscription Manager",
    description: "Plans, coupons, payment reporting and refund decisions.",
    permissions: [
      "dashboard.read", "saved_views.manage", "plans.read", "plans.manage", "billing.read",
      "refunds.manage", "coupons.read", "coupons.manage", "analytics.read",
      "operations.read",
    ],
  },
  support_manager: {
    label: "Support Manager",
    description: "Learner account support and payment issue investigations.",
    permissions: [
      "dashboard.read", "saved_views.manage", "billing.read", "payment_issues.manage", "notifications.read",
      "operations.read",
    ],
  },
  analyst_auditor: {
    label: "Analyst & Auditor",
    description: "Read-only analytics, audit and operational reporting.",
    permissions: [
      "dashboard.read", "saved_views.manage", "analytics.read", "audit.read", "notifications.read", "operations.read",
      "billing.read",
    ],
  },
});

export const ADMIN_PERMISSION_CATALOG = Object.freeze([
  "dashboard.read", "saved_views.manage",
  "users.read", "users.manage", "users.pii.reveal",
  "courses.read", "courses.manage", "courses.publish",
  "ai.manage", "resources.manage",
  "analytics.read",
  "plans.read", "plans.manage",
  "billing.read", "refunds.manage",
  "payment_issues.manage",
  "communications.send", "communications.manage", "notifications.read", "notifications.retry",
  "coupons.read", "coupons.manage",
  "settings.read", "settings.manage", "legal.manage",
  "audit.read",
  "operations.read", "operations.manage",
  "admin_roles.manage",
]);

export function isAdminRoleProfile(role) {
  return Object.hasOwn(ADMIN_ROLE_PROFILES, role);
}

export function hasAdminPermission(adminRole, permission, overrides = []) {
  const profile = ADMIN_ROLE_PROFILES[adminRole];
  if (!profile || typeof permission !== "string" || !ADMIN_PERMISSION_CATALOG.includes(permission)) return false;
  if (profile.permissions.includes("*")) return true;
  if (profile.permissions.includes(permission)) return true;
  return ADMIN_PERMISSION_CATALOG.includes(permission) && Array.isArray(overrides) && overrides.includes(permission);
}

export function getAdminPermissions(adminRole, overrides = []) {
  const profile = ADMIN_ROLE_PROFILES[adminRole];
  if (!profile) return [];
  if (profile.permissions.includes("*")) return [...ADMIN_PERMISSION_CATALOG];
  return [...new Set([...profile.permissions, ...(Array.isArray(overrides) ? overrides : [])])]
    .filter((permission) => ADMIN_PERMISSION_CATALOG.includes(permission));
}
