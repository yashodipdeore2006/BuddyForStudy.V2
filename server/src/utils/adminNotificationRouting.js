import { hasAdminPermission } from "./adminRbac.js";

/**
 * Return only active admin records whose effective RBAC grants the requested
 * permission. Unknown roles and permissions fail closed in hasAdminPermission.
 */
export function selectAdminNotificationRecipients(admins, requiredPermission) {
  if (!Array.isArray(admins) || typeof requiredPermission !== "string" || !requiredPermission) return [];
  return admins.filter((admin) =>
    admin && hasAdminPermission(
      admin.adminRole || "platform_admin",
      requiredPermission,
      admin.adminPermissionOverrides || []
    )
  );
}
