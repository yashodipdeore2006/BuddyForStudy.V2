import { createHash, randomUUID } from "node:crypto";
import { RoadmapDraft } from "../models/RoadmapDraft.js";
import { env } from "../config/env.js";
import { generateAIRoadmap } from "./aiRoadmap.service.js";
import { Course } from "../models/Course.js";
import { curateForNode } from "./nodeCuration.service.js";
import { consumeRoadmapRequestAllowance, reserveRoadmapAdmission, renewRoadmapAdmission, releaseRoadmapAdmission, recoverExpiredRoadmapAdmissions } from "./roadmapAdmission.service.js";

const queue = [];
const listeners = new Map();
let active = 0;
const concurrency = Math.max(1, Number(env.nodeConcurrency) || 3);
const MAX_ACTIVE_DRAFTS = Math.max(concurrency, concurrency * 20);
const MAX_ACTIVE_DRAFTS_PER_USER = 2;
const MAX_USER_DRAFTS_PER_WINDOW = 5;
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

async function resolveCourseNodes({ draft, courseId, userId, profile, assertLease }) {
  await assertLease();
  const course = await Course.findOne({ _id: courseId, createdForUser: userId }).lean();
  if (!course) throw new Error("Private roadmap course was not found for its owner");
  const jobs = [];
  for (const module of course.modules || []) {
    for (const lesson of module.lessons || []) {
      if (lesson.type === "quiz") continue;
      jobs.push(async () => {
        const nodeId = String(lesson._id);
        await assertLease();
        await Course.updateOne(
          { _id: courseId, createdForUser: userId, "modules._id": module._id, "modules.lessons._id": lesson._id },
          { $set: { "modules.$[module].lessons.$[lesson].buildState": "queued" } },
          { arrayFilters: [{ "module._id": module._id }, { "lesson._id": lesson._id }] }
        );
        await addEvent(draft, { type: "node", nodeId, title: lesson.title, state: "queued", roadmapId: String(courseId) });
        try {
          const durationPolicy = lesson.durationPolicy || { minMinutes: 15, targetMinutes: 60, maxMinutes: 180 };
          const curated = await curateForNode({
            skill: { id: lesson.canonicalSkillId || lesson.title, canonicalSkillId: lesson.canonicalSkillId || lesson.title, name: lesson.title, topics: [lesson.title] },
            profile: { topic: profile.topic, level: profile.level || profile.intentProfile?.level || "Beginner", language: profile.language || profile.intentProfile?.language || "en" },
            durationPolicy
          });
          await assertLease();
          const state = curated.meta?.state || (curated.best ? (curated.meta?.lowConfidence ? "low_confidence" : "ready") : "failed");
          const video = curated.best ? { ...curated.best, state, alternatives: curated.alternatives || [] } : null;
          const path = lesson.type === "project" ? "project.videos" : "tutorial.videos";
          const set = { "modules.$[module].lessons.$[lesson].buildState": state };
          if (video) set[`modules.$[module].lessons.$[lesson].${path}`] = [video];
          await Course.updateOne(
            { _id: courseId, createdForUser: userId, "modules._id": module._id, "modules.lessons._id": lesson._id },
            { $set: set },
            { arrayFilters: [{ "module._id": module._id }, { "lesson._id": lesson._id }] }
          );
          await addEvent(draft, { type: "node", nodeId, title: lesson.title, state, best: curated.best || null, alternatives: curated.alternatives || [], flags: { lowConfidence: Boolean(curated.meta?.lowConfidence), quotaUnits: curated.meta?.quotaUnits || 0 } });
        } catch (error) {
          if (error?.code === "ROADMAP_ADMISSION_LEASE_LOST") throw error;
          await assertLease();
          // Each node is isolated: persist failure and allow sibling jobs to finish.
          await Course.updateOne(
            { _id: courseId, createdForUser: userId, "modules._id": module._id, "modules.lessons._id": lesson._id },
            { $set: { "modules.$[module].lessons.$[lesson].buildState": "failed" } },
            { arrayFilters: [{ "module._id": module._id }, { "lesson._id": lesson._id }] }
          ).catch(() => {});
          await addEvent(draft, { type: "node", nodeId, title: lesson.title, state: "failed", flags: { error: true } });
        }
      });
    }
  }
  let cursor = 0;
  const workers = Array.from({ length: Math.min(concurrency, jobs.length) }, async () => {
    while (cursor < jobs.length) {
      const index = cursor++;
      await jobs[index]();
    }
  });
  await Promise.all(workers);
}

export async function createRoadmapDraft({ userId, profile, options = {}, dependencies = {} }) {
  const generateRoadmap = dependencies.generateAIRoadmap || generateAIRoadmap;
  const key = stableProfileKey(userId, profile);
  const recent = await RoadmapDraft.findOne({
    userId, idempotencyKey: key, createdAt: { $gt: new Date(Date.now() - IDEMPOTENCY_TTL_MS) }
  }).sort({ createdAt: -1 });
  if (recent && ["queued", "building", "ready"].includes(recent.status)) return { draftId: recent.draftId, status: recent.status, reused: true };

  await consumeRoadmapRequestAllowance({ userId, maxRequests: MAX_USER_DRAFTS_PER_WINDOW });
  const draftId = randomUUID();
  const lease = await reserveRoadmapAdmission({
    userId,
    draftId,
    maxGlobal: MAX_ACTIVE_DRAFTS,
    maxPerUser: MAX_ACTIVE_DRAFTS_PER_USER
  });

  let leaseLost = false;
  let heartbeatInFlight = Promise.resolve();
  const heartbeatTimer = setInterval(() => {
    heartbeatInFlight = heartbeatInFlight.then(async () => {
      if (leaseLost) return;
      const renewed = await renewRoadmapAdmission({ draftId, leaseToken: lease.leaseToken });
      if (!renewed) leaseLost = true;
    }).catch(() => { leaseLost = true; });
  }, 30000);
  heartbeatTimer.unref?.();

  const assertLease = async () => {
    await heartbeatInFlight;
    if (leaseLost || !await renewRoadmapAdmission({ draftId, leaseToken: lease.leaseToken })) {
      leaseLost = true;
      await recoverExpiredRoadmapAdmissions().catch(() => {});
      throw Object.assign(new Error("Roadmap admission lease was lost"), { code: "ROADMAP_ADMISSION_LEASE_LOST" });
    }
  };

  let draft;
  try {
    draft = await RoadmapDraft.create({
      draftId, userId, query: profile.topic, goal: profile.goal || "learn",
      profile, status: "queued", idempotencyKey: key, admissionLeaseToken: lease.leaseToken
    });
  } catch (error) {
    clearInterval(heartbeatTimer);
    await releaseRoadmapAdmission({ draftId, leaseToken: lease.leaseToken }).catch(() => {});
    throw error;
  }

  queue.push(async () => {
    try {
      await assertLease();
      const claimed = await RoadmapDraft.updateOne(
        { _id: draft._id, status: "queued", admissionLeaseToken: lease.leaseToken },
        { $set: { status: "building", updatedAt: new Date() } }
      );
      if (!claimed.modifiedCount) return;
      await addEvent(draft, { type: "progress", state: "building", draftId });
      let courseId = null;
      try {
        await assertLease();
        const result = await generateRoadmap(profile, { ...options, userId: String(userId), asyncBuild: true });
        await assertLease();
        courseId = result?.course?._id || result?.course?.id || null;
        if (!courseId) throw new Error("Async roadmap build did not return a persisted course");
        await RoadmapDraft.updateOne(
          { _id: draft._id, status: "building", admissionLeaseToken: lease.leaseToken },
          { $set: { roadmapId: courseId, result, status: "building", updatedAt: new Date() } }
        );
        await addEvent(draft, { type: "skeleton", state: "building", draftId, roadmapId: String(courseId), result });
        await resolveCourseNodes({ draft, courseId, userId, profile, assertLease });
        await assertLease();
        const completed = await RoadmapDraft.findById(draft._id).lean();
        const finalResult = { ...(completed?.result || result), status: "ready", roadmapId: String(courseId) };
        const finalized = await RoadmapDraft.updateOne(
          { _id: draft._id, status: "building", admissionLeaseToken: lease.leaseToken },
          { $set: { status: "ready", result: finalResult, updatedAt: new Date() } }
        );
        if (!finalized.modifiedCount) throw Object.assign(new Error("Roadmap draft ownership changed"), { code: "ROADMAP_ADMISSION_LEASE_LOST" });
        await addEvent(draft, { type: "done", state: "ready", draftId, roadmapId: String(courseId) });
      } catch (error) {
        if (error?.code !== "ROADMAP_ADMISSION_LEASE_LOST") await assertLease();
        if (courseId) {
          await Course.updateOne(
            { _id: courseId, createdForUser: userId },
            { $set: { status: "archived", isPublished: false, visibility: "private" } }
          ).catch(() => {});
        }
        if (error?.code !== "ROADMAP_ADMISSION_LEASE_LOST") {
          await RoadmapDraft.updateOne(
            { _id: draft._id, status: "building", admissionLeaseToken: lease.leaseToken },
            {
              $set: {
                status: "failed",
                errorCode: String(error?.code || "ROADMAP_BUILD_FAILED"),
                roadmapId: null,
                result: null,
                updatedAt: new Date()
              }
            }
          );
          await addEvent(draft, { type: "error", state: "failed", draftId, message: "Roadmap build failed. Please retry." });
        }
      }
    } finally {
      clearInterval(heartbeatTimer);
      await heartbeatInFlight;
      await releaseRoadmapAdmission({ draftId, leaseToken: lease.leaseToken }).catch(() => {});
    }
  });
  pump();
  return { draftId, status: "queued", reused: false };
}

export async function cancelQueuedRoadmapDraft(draftId, userId) {
  const cancelled = await RoadmapDraft.findOneAndUpdate(
    { draftId, userId, status: "queued" },
    { $set: { status: "cancelled", updatedAt: new Date() } },
    { new: true }
  );
  if (cancelled) {
    await addEvent(cancelled, { type: "cancelled", state: "cancelled", draftId, message: "Roadmap build cancelled." });
    return { draftId, status: "cancelled", cancelled: true };
  }
  const existing = await getDraftForUser(draftId, userId);
  if (!existing) return null;
  return { draftId, status: existing.status, cancelled: false };
}

export async function getDraftForUser(draftId, userId) {
  return RoadmapDraft.findOne({ draftId, userId }).lean();
}

export async function waitForDraft(draftId, userId, timeoutMs = 2000) {
  const deadline = Date.now() + Math.min(2000, Math.max(0, timeoutMs));
  while (Date.now() < deadline) {
    const draft = await getDraftForUser(draftId, userId);
    if (!draft || ["ready", "failed", "cancelled"].includes(draft.status)) return draft;
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
  const course = draft.roadmapId ? await Course.findOne({ _id: draft.roadmapId, createdForUser: userId }).lean() : null;
  const nodes = (course?.modules || []).flatMap((module, moduleIndex) =>
    (module.lessons || []).map((lesson, lessonIndex) => ({
      nodeId: String(lesson._id || lesson.id || `${moduleIndex}-${lessonIndex}`),
      title: lesson.title,
      state: lesson.buildState || (lesson.tutorial?.videos?.length ? (lesson.tutorial.videos.some((video) => video.state === "low_confidence") ? "low_confidence" : "ready") : "pending")
    }))
  );
  const result = draft.result && course ? {
    ...draft.result,
    status: draft.status,
    roadmapId: String(course._id),
    course: { ...draft.result.course, ...course, _id: String(course._id), modules: course.modules }
  } : draft.result || null;
  return { draftId, roadmapId: draft.roadmapId ? String(draft.roadmapId) : null, status: draft.status, nodes, result, events: draft.events || [] };
}
