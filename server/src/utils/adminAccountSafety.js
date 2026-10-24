export function validateAdminAccountChange({ actorId, targetId, targetRole, targetActive, requestedRole, requestedActive, activeAdminCount }) {
  const sameAccount = String(actorId || "") === String(targetId || "");
  if (sameAccount && requestedRole === "user") {
    return { valid: false, status: 400, message: "Admin cannot remove their own admin access" };
  }
  if (sameAccount && requestedActive === false) {
    return { valid: false, status: 400, message: "Admin cannot deactivate their own account" };
  }
  const removesActiveAdmin = targetRole === "admin" && targetActive !== false &&
    (requestedRole === "user" || requestedActive === false);
  if (removesActiveAdmin && Number(activeAdminCount) <= 1) {
    return { valid: false, status: 409, message: "At least one active admin account must remain" };
  }
  return { valid: true };
}
