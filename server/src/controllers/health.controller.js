import mongoose from "mongoose";
import { success, failure } from "../utils/response.js";

export function health(_req, res) {
  return success(res, { status: "ok", service: "buddyforstudy-api", timestamp: new Date().toISOString() });
}

export function readiness(_req, res) {
  const connected = mongoose.connection.readyState === 1;
  if (!connected) return failure(res, "Database is not ready", 503);
  return success(res, { status: "ready", database: "connected", timestamp: new Date().toISOString() });
}
