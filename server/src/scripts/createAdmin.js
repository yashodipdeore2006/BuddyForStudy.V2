import dotenv from "dotenv";
import mongoose from "mongoose";
import { User } from "../models/User.js";
import { env } from "../config/env.js";

dotenv.config();
const email = process.env.ADMIN_EMAIL;
const password = process.env.ADMIN_PASSWORD;
const name = process.env.ADMIN_NAME || "BuddyForStudy Admin";
if (!email || !password) throw new Error("ADMIN_EMAIL and ADMIN_PASSWORD are required");
await mongoose.connect(env.mongoUri);
const hashed = await User.hashPassword(password);
const existing = await User.findOne({ email: email.toLowerCase() });
if (existing) { existing.name = name; existing.password = hashed; existing.role = "admin"; existing.isActive = true; await existing.save(); console.log("Admin account updated:", existing.email); }
else { const user = await User.create({ name, email: email.toLowerCase(), password: hashed, role: "admin", isActive: true, authProvider: "local" }); console.log("Admin account created:", user.email); }
await mongoose.disconnect();
