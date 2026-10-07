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
    { expiresIn: env.jwtExpiresIn }
  );
}
