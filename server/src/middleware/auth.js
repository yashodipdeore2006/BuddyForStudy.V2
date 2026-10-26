import jwt from "jsonwebtoken";
import { User } from "../models/User.js";
import { env } from "../config/env.js";
import { failure } from "../utils/response.js";
import { hasAdminPermission } from "../utils/adminRbac.js";
import { isTokenVersionCurrent } from "../utils/jwt.js";

export async function authMiddleware(req, res, next) {
  try {
    const header = req.headers.authorization;

    if (!header?.startsWith("Bearer ")) {
      return failure(res, "Authentication required", 401);
    }

    const token = header.slice(7);
    const payload = jwt.verify(token, env.jwtSecret);

    const user = await User.findById(payload.userId).select("+password");

    if (!user) return failure(res, "User not found", 401);
    if (!user.isActive) return failure(res, "Account is inactive", 401);
    if (!isTokenVersionCurrent(payload, user)) {
      return failure(res, "Authentication token has been revoked", 401);
    }

    req.user = {
      userId: user._id.toString(),
      role: user.role,
      accessType: payload.accessType || "user",
      adminRole: user.adminRole || "platform_admin",
      adminPermissionOverrides: user.adminPermissionOverrides || [],
      user
    };

    next();
  } catch (error) {
    return failure(
      res,
      error.name === "TokenExpiredError" ? "Authentication token expired" : "Invalid authentication token",
      401
    );
  }
}

export function adminMiddleware(req, res, next) {
  if (req.user?.role !== "admin" || req.user?.accessType !== "admin") {
    return failure(res, "Administrator access required.", 403);
  }
  next();
}


export function adminPermissionMiddleware(permission) {
  return function requireAdminPermission(req, res, next) {
    if (req.user?.role !== "admin" || req.user?.accessType !== "admin") {
      return failure(res, "Administrator access required.", 403);
    }
    if (!hasAdminPermission(req.user.adminRole, permission, req.user.adminPermissionOverrides)) {
      return failure(res, "You do not have permission to perform this action.", 403, {
        requiredPermission: permission,
      });
    }
    return next();
  };
}

export async function optionalAuthMiddleware(req, res, next) {
  const header = req.headers.authorization;

  if (!header) {
    req.user = null;
    return next();
  }

  if (!header.startsWith("Bearer ")) {
    return failure(res, "Invalid authentication header", 401);
  }

  try {
    const token = header.slice(7);
    const payload = jwt.verify(token, env.jwtSecret);
    const user = await User.findById(payload.userId).select("+password");

    if (!user) return failure(res, "User not found", 401);
    if (!user.isActive) return failure(res, "Account is inactive", 401);
    if (!isTokenVersionCurrent(payload, user)) {
      return failure(res, "Authentication token has been revoked", 401);
    }

    req.user = {
      userId: user._id.toString(),
      role: user.role,
      accessType: payload.accessType || "user",
      user
    };

    return next();
  } catch (error) {
    return failure(
      res,
      error.name === "TokenExpiredError" ? "Authentication token expired" : "Invalid authentication token",
      401
    );
  }
}
