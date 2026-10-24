import { createHash, randomUUID } from "node:crypto";
import { RoadmapDraft } from "../models/RoadmapDraft.js";
import { env } from "../config/env.js";
import { generateAIRoadmap } from "./aiRoadmap.service.js";
import { Course } from "../models/Course.js";

const queue = [];
const listeners = new Map();
let active = 0;
const concurrency = Math.max(1, Number(env.nodeConcurrency) || 3);
const HEARTBEAT_MS = 15000;
const IDEMPOTENCY_TTL_MS = 10 * 60 * 1000;

export function stableProfileKey(userId, profile) {
  const stable = JSON.stringify({ userId: String(userId), profile });
  return createHash("sha256").update(stable).digest("hex");
}

function emitLocal(draftId, event) {
  const set = listeners.get(draftId);
  if (!set) return;
  for (const response of set) {
    try { response.write(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`); } catch {}
  }
}

async function addEvent(draft, event) {
  const safe = { ...event, at: new Date().toISOString() };
  await RoadmapDraft.updateOne({ _id: draft._id }, {
    $push: { events: { $each: [safe], $slice: -250 } },
    $set: { updatedAt: new Date() }
  });
  emitLocal(draft.draftId, safe);
}

function pump() {
  while (active < concurrency && queue.length) {
    const job = queue.shift();
    active += 1;
    Promise.resolve().then(job).catch(() => {}).finally(() => {
      active -= 1;
      pump();
    });
  }
}

export async function createRoadmapDraft({ userId, profile, options = {} }) {
  const key = stableProfileKey(userId, profile);
  const recent = await RoadmapDraft.findOne({
    userId, idempotencyKey: key, createdAt: { $gt: new Date(Date.now() - IDEMPOTENCY_TTL_MS) }
  }).sort({ createdAt: -1 });
  if (recent) return { draftId: recent.draftId, status: recent.status, reused: true };

  const draftId = randomUUID();
  const draft = await RoadmapDraft.create({
    draftId, userId, query: profile.topic, goal: profile.goal || "learn",
    profile, status: "queued", idempotencyKey: key
  });
  queue.push(async () => {
    await RoadmapDraft.updateOne({ _id: draft._id, status: "queued" }, { $set: { status: "building" } });
    await addEvent(draft, { type: "progress", state: "building", draftId });
    try {
      // The existing worker is a scheduled maintenance runner, not an on-demand job consumer.
      // Keep the new queue in-process and cap active builds using NODE_CONCURRENCY.
      const result = await generateAIRoadmap(profile, { ...options, userId: String(userId) });
      const courseId = result?.course?._id || result?.course?.id || null;
      await RoadmapDraft.updateOne({ _id: draft._id }, {
        $set: { status: "ready", roadmapId: courseId, result, updatedAt: new Date() }
      });
      await addEvent(draft, { type: "done", state: "ready", draftId, roadmapId: courseId });
    } catch (error) {
      await RoadmapDraft.updateOne({ _id: draft._id }, {
        $set: { status: "failed", errorCode: String(error?.code || "ROADMAP_BUILD_FAILED"), updatedAt: new Date() }
      });
      await addEvent(draft, { type: "error", state: "failed", draftId, message: "Roadmap build failed. Please retry." });
    }
  });
  pump();
  return { draftId, status: "queued", reused: false };
}

export async function getDraftForUser(draftId, userId) {
  return RoadmapDraft.findOne({ draftId, userId }).lean();
}

export async function waitForDraft(draftId, userId, timeoutMs = 2000) {
  const deadline = Date.now() + Math.min(2000, Math.max(0, timeoutMs));
  while (Date.now() < deadline) {
    const draft = await getDraftForUser(draftId, userId);
    if (!draft || ["ready", "failed"].includes(draft.status)) return draft;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  return getDraftForUser(draftId, userId);
}

export async function attachDraftEvents(req, res, draftId, userId) {
  const draft = await getDraftForUser(draftId, userId);
  if (!draft) return false;
  res.status(200);
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders?.();
  for (const event of draft.events || []) res.write(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`);
  const heartbeat = setInterval(() => { try { res.write(": heartbeat\n\n"); } catch {} }, HEARTBEAT_MS);
  if (!listeners.has(draftId)) listeners.set(draftId, new Set());
  listeners.get(draftId).add(res);
  const cleanup = () => {
    clearInterval(heartbeat);
    listeners.get(draftId)?.delete(res);
    if (!listeners.get(draftId)?.size) listeners.delete(draftId);
  };
  req.on("close", cleanup);
  return true;
}

export async function getRoadmapPoll(draftId, userId) {
  const draft = await getDraftForUser(draftId, userId);
  if (!draft) return null;
  const course = draft.roadmapId ? await Course.findOne({ _id: draft.roadmapId, createdForUser: userId }).select("modules status visibility").lean() : null;
  const nodes = (course?.modules || []).flatMap((module, moduleIndex) =>
    (module.lessons || []).map((lesson, lessonIndex) => ({
      nodeId: String(lesson._id || lesson.id || `${moduleIndex}-${lessonIndex}`),
      title: lesson.title,
      state: lesson.tutorial?.videos?.length ? (lesson.tutorial.videos.some((video) => video.state === "low_confidence") ? "low_confidence" : "ready") : (["failed", "ready"].includes(draft.status) ? "failed" : "queued")
    }))
  );
  return { draftId, roadmapId: draft.roadmapId ? String(draft.roadmapId) : null, status: draft.status, nodes, result: draft.status === "ready" ? draft.result : null, events: draft.events || [] };
}
