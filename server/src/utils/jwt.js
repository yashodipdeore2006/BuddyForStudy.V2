import jwt from "jsonwebtoken";
import { env } from "../config/env.js";

export function signAccessToken(user, accessType = user.role === "admin" ? "admin" : "user") {
  return jwt.sign(
    {
      userId: user._id.toString(),
      role: user.role,
      accessType
    },
    env.jwtSecret,
    // JWT_EXPIRES_IN defaults to 7d in env.js for every authentication flow.
    { expiresIn: env.jwtExpiresIn || "7d" }
  );
}
