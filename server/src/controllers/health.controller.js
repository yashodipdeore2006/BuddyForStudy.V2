import mongoose from "mongoose";
import { success, failure } from "../utils/response.js";
import { getBackgroundOperationsHealth } from "../services/backgroundOperationsHealth.service.js";

function currentReleaseSha() {
  const candidate = [
    process.env.RENDER_GIT_COMMIT,
    process.env.VERCEL_GIT_COMMIT_SHA,
    process.env.GIT_COMMIT_SHA,
  ].find((value) => typeof value === "string" && value.trim())?.trim() || "";

  return /^[a-f0-9]{40}$/i.test(candidate) ? candidate.toLowerCase() : null;
}

export function health(_req, res) {
  return success(res, {
    status: "ok",
    service: "buddyforstudy-api",
    releaseSha: currentReleaseSha(),
    timestamp: new Date().toISOString()
  });
}

export function readiness(_req, res) {
  const connected = mongoose.connection.readyState === 1;
  if (!connected) return failure(res, "Database is not ready", 503);
  return success(res, { status: "ready", database: "connected", timestamp: new Date().toISOString() });
}


export async function operations(_req, res, next) {
  try {
    const background = await getBackgroundOperationsHealth();
    return success(res, {
      status: background.status,
      background
    });
  } catch (error) {
    next(error);
  }
}
