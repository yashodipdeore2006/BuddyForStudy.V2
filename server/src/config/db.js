import mongoose from "mongoose";
import { env } from "./env.js";
import { RoadmapAdmissionLease } from "../models/RoadmapAdmissionLease.js";
import { RoadmapAdmissionRateWindow } from "../models/RoadmapAdmissionRateWindow.js";
import { ApiRateLimit } from "../models/ApiRateLimit.js";
import { JobLease } from "../models/JobLease.js";

export async function connectDatabase() {
  mongoose.set("strictQuery", true);
  await mongoose.connect(env.mongoUri);
  await Promise.all([RoadmapAdmissionLease.init(), RoadmapAdmissionRateWindow.init(), ApiRateLimit.init(), JobLease.init()]);
  console.log("MongoDB connected; roadmap admission indexes ready");
}

export async function disconnectDatabase() {
  await mongoose.disconnect();
}
