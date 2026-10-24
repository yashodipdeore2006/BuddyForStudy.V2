import dotenv from "dotenv";
import mongoose from "mongoose";
import { User } from "../models/User.js";
import { env } from "../config/env.js";
import { isAdminRoleProfile } from "../utils/adminRbac.js";

dotenv.config();
const email = process.env.ADMIN_EMAIL;
const password = process.env.ADMIN_PASSWORD;
const name = process.env.ADMIN_NAME || "BuddyForStudy Admin";
const requestedAdminRole = process.env.ADMIN_ROLE;
if (!email || !password) throw new Error("ADMIN_EMAIL and ADMIN_PASSWORD are required");
if (requestedAdminRole && !isAdminRoleProfile(requestedAdminRole)) {
  throw new Error("ADMIN_ROLE must be one of: super_admin, platform_admin, ai_content_manager, finance_manager, support_manager, analyst_auditor");
}
await mongoose.connect(env.mongoUri);
const hashed = await User.hashPassword(password);
const existing = await User.findOne({ email: email.toLowerCase() });
if (existing) {
  existing.name = name;
  existing.password = hashed;
  existing.role = "admin";
  existing.adminRole = requestedAdminRole || existing.adminRole || "platform_admin";
  existing.isActive = true;
  existing.emailVerified = true;
  await existing.save();
  console.log("Admin account updated:", existing.email, "profile:", existing.adminRole);
} else {
  const user = await User.create({
    name,
    email: email.toLowerCase(),
    password: hashed,
    role: "admin",
    adminRole: requestedAdminRole || "platform_admin",
    isActive: true,
    emailVerified: true,
    authProvider: "local"
  });
  console.log("Admin account created:", user.email, "profile:", user.adminRole);
}
await mongoose.disconnect();
