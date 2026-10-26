import jwt from "jsonwebtoken";
import { env } from "../config/env.js";

function readAuthTokenVersion(user) {
  const value = user?.authTokenVersion;
  return Number.isSafeInteger(value) && value >= 0 ? value : 0;
}

export function isTokenVersionCurrent(payload, user) {
  const suppliedVersion = payload?.tokenVersion === undefined ? 0 : payload.tokenVersion;
  return Number.isSafeInteger(suppliedVersion) &&
    suppliedVersion >= 0 &&
    suppliedVersion === readAuthTokenVersion(user);
}

export function signAccessToken(user, accessType = user.role === "admin" ? "admin" : "user") {
  return jwt.sign(
    {
      userId: user._id.toString(),
      role: user.role,
      accessType,
      tokenVersion: readAuthTokenVersion(user)
    },
    env.jwtSecret,
    // JWT_EXPIRES_IN defaults to 7d in env.js for every authentication flow.
    { expiresIn: env.jwtExpiresIn || "7d" }
  );
}
