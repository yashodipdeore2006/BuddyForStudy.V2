import { createHash, randomUUID } from "node:crypto";
import { RoadmapDraft } from "../models/RoadmapDraft.js";
import { env } from "../config/env.js";
import { generateAIRoadmap } from "./aiRoadmap.service.js";
import { Course } from "../models/Course.js";
import { assessCourseResourceQuality, getCourseResourceMetrics } from "./learningResourceQuality.js";
import { curateForNode } from "./nodeCuration.service.js";
import { consumeRoadmapRequestAllowance, reserveRoadmapAdmission, renewRoadmapAdmission, releaseRoadmapAdmission, releaseQueuedRoadmapAdmission, recoverExpiredRoadmapAdmissions } from "./roadmapAdmission.service.js";
import { getState as getYouTubeQuotaState } from "./quota.service.js";

const queue = [];
const listeners = new Map();
const admissionRuntimes = new Map();
let active = 0;
const concurrency = Math.max(1, Number(env.nodeConcurrency) || 3);
const MAX_ACTIVE_DRAFTS = Math.max(concurrency, concurrency * 20);
const MAX_ACTIVE_DRAFTS_PER_USER = 2;
const MAX_USER_DRAFTS_PER_WINDOW = 5;
const HEARTBEAT_MS = 15000;
const IDEMPOTENCY_TTL_MS = 10 * 60 * 1000;

function hashResourceContext(profile = {}) {
  const intent = profile.intentProfile || {};
  const normalize = (value) => String(value || "").normalize("NFKC").trim().toLowerCase().replace(/\s+/g, " ");
  const context = {
    topic: normalize(profile.topic),
    level: normalize(profile.level || intent.level || "Beginner"),
    language: normalize(profile.language || intent.language || "en"),
    goal: normalize(intent.goal || profile.goal || "learn"),
    scope: normalize(intent.scope || ""),
    targetRole: normalize(intent.targetRole),
    targetCompany: normalize(intent.targetCompany),
    examName: normalize(intent.examName),
    projectIdea: normalize(intent.projectIdea),
    outcome: normalize(intent.outcome)
  };
  return createHash("sha256").update(JSON.stringify(context)).digest("hex");
}

async function buildResourceQualityFailure(quality) {
  let quota = null;
  try { quota = await getYouTubeQuotaState(); } catch {}
  const quotaState = ["ok", "degraded", "exhausted"].includes(quota?.state) ? quota.state : "unknown";
  const errorDetails = {
    code: "AI_RESOURCE_QUALITY_INSUFFICIENT",
    tutorialLessonCount: Number(quality.tutorialLessonCount) || 0,
    lessonsWithResources: Number(quality.lessonsWithResources) || 0,
    uniqueVideoCount: Number(quality.uniqueVideoCount) || 0,
    coverageRatio: Number(quality.coverageRatio) || 0,
    minimumCoverage: Number(quality.minimumCoverage) || 0,
    reason: typeof quality.reason === "string" ? quality.reason : "resource_quality_rejected",
    quotaState,
    quotaUnits: Number.isFinite(Number(quota?.units)) ? Number(quota.units) : null,
    quotaBudget: Number.isFinite(Number(quota?.budget)) ? Number(quota.budget) : null,
    quotaResetDay: /^\d{4}-\d{2}-\d{2}$/.test(String(quota?.resetDay || "")) ? quota.resetDay : null
  };
  const error = new Error(quotaState === "exhausted"
    ? "Build with AI has reached today's verified YouTube resource-search limit. Your roadmap was not saved. Please retry after the daily quota reset."
    : "We could not verify enough suitable learning resources for this roadmap. Please try again later.");
  error.code = "AI_RESOURCE_QUALITY_INSUFFICIENT";
  error.resourceQuality = errorDetails;
  return error;
}

function serializeRoadmapFailure(error) {
  if (error?.code === "AI_PROVIDER_RATE_LIMITED") {
    return {
      errorCode: "AI_PROVIDER_RATE_LIMITED",
      errorMessage: "Gemini is temporarily rate-limiting generation requests for the platform's shared API key. This is not your account's AI allowance. Please retry shortly.",
      errorDetails: { code: "AI_PROVIDER_RATE_LIMITED", provider: "gemini", retryable: true }
    };
  }
  if (error?.code === "AI_PROVIDER_QUOTA_EXHAUSTED") {
    return {
      errorCode: "AI_PROVIDER_QUOTA_EXHAUSTED",
      errorMessage: String(error.message || "Gemini's daily generation quota has been exhausted. Retry after the provider quota resets."),
      errorDetails: { code: "AI_PROVIDER_QUOTA_EXHAUSTED", provider: "gemini", retryable: true }
    };
  }
  if (error?.code === "AI_RESOURCE_QUALITY_INSUFFICIENT") {
    return {
      errorCode: "AI_RESOURCE_QUALITY_INSUFFICIENT",
      errorMessage: String(error.message || "We could not verify enough suitable learning resources for this roadmap. Please try again later."),
      errorDetails: error.resourceQuality && typeof error.resourceQuality === "object" ? error.resourceQuality : {
        code: "AI_RESOURCE_QUALITY_INSUFFICIENT"
      }
    };
  }
  return {
    errorCode: String(error?.code || "ROADMAP_BUILD_FAILED").slice(0, 100),
    errorMessage: "Roadmap build failed. Please retry.",
    errorDetails: null
  };
}

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

async function resolveCourseNodes({ draft, courseId, userId, profile, assertLease, dependencies = {} }) {
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
          const searchPolicy = lesson.tutorial?.searchPolicy || {};
          const durationPolicy = lesson.durationPolicy || {
            minMinutes: Number(searchPolicy.minDurationMinutes) || 15,
            targetMinutes: Number(searchPolicy.targetDurationMinutes) || 60,
            maxMinutes: Number(searchPolicy.maxDurationMinutes) || 180
          };
          const intent = profile.intentProfile || {};
          const learnerContext = [
            profile.topic,
            intent.goal || profile.goal,
            intent.targetRole,
            intent.targetCompany,
            intent.examName,
            intent.projectIdea,
            intent.outcome
          ].map((value) => String(value || "").trim()).filter(Boolean).join(" ").slice(0, 240);
          const curated = await (dependencies.curateForNode || curateForNode)({
            skill: {
              id: lesson.canonicalSkillId || lesson.title,
              canonicalSkillId: lesson.canonicalSkillId || lesson.title,
              name: lesson.title,
              topics: [lesson.title],
              searchQueries: learnerContext ? [
                learnerContext + " " + lesson.title + " structured course tutorial",
                String(profile.topic || "") + " " + lesson.title + " " + String(intent.goal || profile.goal || "learn") + " practical lesson"
              ] : []
            },
            profile: { topic: profile.topic, level: profile.level || intent.level || "Beginner", language: profile.language || intent.language || "en" },
            durationPolicy,
            // Cache verified resources by curriculum context, not user identity.
            // The cache remains isolated by topic, role/goal, level, language and exam/project context.
            cacheScope: hashResourceContext(profile)
          });
          await assertLease();
          const state = curated.meta?.state || (curated.best ? (curated.meta?.lowConfidence ? "low_confidence" : "ready") : "failed");
          const best = curated.best ? { ...curated.best, state, alternatives: curated.alternatives || [] } : null;
          const playlistItems = Array.isArray(best?.items) ? best.items.filter((item) => item.videoId) : [];
          const videos = playlistItems.length
            ? playlistItems.map((item) => ({
                ...item,
                playlistId: best.playlistId || "",
                state,
                reason: "Part of the selected curated playlist: " + String(best.title || "").slice(0, 160),
                alternatives: curated.alternatives || []
              }))
            : best ? [best] : [];
          const path = lesson.type === "project" ? "project.videos" : "tutorial.videos";
          const set = { "modules.$[module].lessons.$[lesson].buildState": state };
          if (videos.length) set[`modules.$[module].lessons.$[lesson].${path}`] = videos;
          await Course.updateOne(
            { _id: courseId, createdForUser: userId, "modules._id": module._id, "modules.lessons._id": lesson._id },
            { $set: set },
            { arrayFilters: [{ "module._id": module._id }, { "lesson._id": lesson._id }] }
          );
          await addEvent(draft, { type: "node", nodeId, title: lesson.title, state, best: best || null, alternatives: curated.alternatives || [], flags: { lowConfidence: Boolean(curated.meta?.lowConfidence), quotaLimited: state === "quota_limited", quotaUnits: curated.meta?.quotaUnits || 0, attachedVideos: videos.length } });
        } catch (error) {
          if (error?.code === "ROADMAP_ADMISSION_LEASE_LOST") throw error;
          await assertLease();
          // Preserve already-built curriculum nodes when one enrichment request fails.
          // Quota refusal is temporary and must remain retryable after reset.
          const quotaLimited = error?.name === "QuotaBudgetError" || error?.code === "YOUTUBE_QUOTA_BUDGET";
          const fallbackState = quotaLimited ? "quota_limited" : "failed";
          await Course.updateOne(
            { _id: courseId, createdForUser: userId, "modules._id": module._id, "modules.lessons._id": lesson._id },
            { $set: { "modules.$[module].lessons.$[lesson].buildState": fallbackState } },
            { arrayFilters: [{ "module._id": module._id }, { "lesson._id": lesson._id }] }
          ).catch(() => {});
          await addEvent(draft, { type: "node", nodeId, title: lesson.title, state: fallbackState, flags: { error: !quotaLimited, quotaLimited } });
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

  const completedCourse = await Course.findOne({ _id: courseId, createdForUser: userId }).lean();
  const topic = String(profile.topic || "");
  const completePath = profile.intentProfile?.scope === "broad" || /\bpython\b/i.test(topic);
  const metrics = getCourseResourceMetrics(completedCourse);
  const quality = assessCourseResourceQuality(completedCourse, { completePath });
  // YouTube is an optional enrichment layer for an otherwise valid personalized
  // curriculum. A provider quota refusal must not discard the entire roadmap:
  // keep the verified resources already attached and expose the missing coverage
  // to the learner so it can be retried after quota reset.
  const quota = await getYouTubeQuotaState().catch(() => null);
  const quotaExhausted = quota?.state === "exhausted";
  if (quality.tutorialLessonCount > 0 && !quality.acceptable && !quotaExhausted) {
    throw await buildResourceQualityFailure(quality);
  }
  if (quality.tutorialLessonCount > 0 && !quality.acceptable && quotaExhausted) {
    console.warn("AI roadmap completed with partial verified resources because YouTube quota is exhausted", {
      tutorialLessonCount: quality.tutorialLessonCount,
      lessonsWithResources: quality.lessonsWithResources,
      uniqueVideoCount: quality.uniqueVideoCount,
      coverageRatio: quality.coverageRatio,
      quotaUnits: quota.units,
      quotaBudget: quota.budget
    });
  }
  return {
    ...metrics,
    resourceLanguage: String(profile.language || profile.intentProfile?.language || "en").slice(0, 20),
    resourceAvailability: {
      status: quotaExhausted && quality.coverageRatio < 1 ? "partial_quota_limited" : quality.acceptable ? "verified" : "partial",
      quotaState: quota?.state || "unknown",
      ...quality
    }
  };
}

export async function createRoadmapDraft({ userId, profile, options = {}, dependencies = {} }) {
  const generateRoadmap = dependencies.generateAIRoadmap || generateAIRoadmap;
  const consumeAllowance = dependencies.consumeRoadmapRequestAllowance || consumeRoadmapRequestAllowance;
  const reserveAdmission = dependencies.reserveRoadmapAdmission || reserveRoadmapAdmission;
  const renewAdmission = dependencies.renewRoadmapAdmission || renewRoadmapAdmission;
  const releaseAdmission = dependencies.releaseRoadmapAdmission || releaseRoadmapAdmission;
  const recoverAdmissions = dependencies.recoverExpiredRoadmapAdmissions || recoverExpiredRoadmapAdmissions;
  const key = stableProfileKey(userId, profile);
  const recent = await RoadmapDraft.findOne({
    userId, idempotencyKey: key, createdAt: { $gt: new Date(Date.now() - IDEMPOTENCY_TTL_MS) }
  }).sort({ createdAt: -1 });
  if (recent && ["queued", "building", "ready"].includes(recent.status)) return { draftId: recent.draftId, status: recent.status, reused: true };

  await consumeAllowance({ userId, maxRequests: MAX_USER_DRAFTS_PER_WINDOW });
  const draftId = randomUUID();
  const lease = await reserveAdmission({
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
      const renewed = await renewAdmission({ draftId, leaseToken: lease.leaseToken });
      if (!renewed) leaseLost = true;
    }).catch(() => { leaseLost = true; });
  }, 30000);
  heartbeatTimer.unref?.();

  const assertLease = async () => {
    await heartbeatInFlight;
    if (leaseLost || !await renewAdmission({ draftId, leaseToken: lease.leaseToken })) {
      leaseLost = true;
      await recoverAdmissions().catch(() => {});
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
    await releaseAdmission({ draftId, leaseToken: lease.leaseToken }).catch(() => {});
    throw error;
  }

  admissionRuntimes.set(draftId, {
    heartbeatTimer,
    leaseToken: lease.leaseToken,
    markLost: () => { leaseLost = true; },
    waitForHeartbeat: () => heartbeatInFlight,
    release: () => releaseAdmission({ draftId, leaseToken: lease.leaseToken })
  });

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
        courseId = result?.course?._id || result?.course?.id || null;
        await assertLease();
        if (!courseId) throw new Error("Async roadmap build did not return a persisted course");
        await RoadmapDraft.updateOne(
          { _id: draft._id, status: "building", admissionLeaseToken: lease.leaseToken },
          { $set: { roadmapId: courseId, result, status: "building", updatedAt: new Date() } }
        );
        await addEvent(draft, { type: "skeleton", state: "building", draftId, roadmapId: String(courseId), result });
        const resourceMetrics = await resolveCourseNodes({ draft, courseId, userId, profile, assertLease, dependencies });
        await assertLease();
        const completed = await RoadmapDraft.findById(draft._id).lean();
        const previousPersonalization = completed?.result?.personalization || result.personalization || {};
        const finalResult = {
          ...(completed?.result || result),
          status: "ready",
          roadmapId: String(courseId),
          personalization: {
            ...previousPersonalization,
            resourceVideoMinutes: resourceMetrics.videoWatchMinutes,
            resourceLanguage: resourceMetrics.resourceLanguage,
            resourceCoverage: {
              tutorialLessonCount: resourceMetrics.tutorialLessonCount,
              lessonsWithResources: resourceMetrics.lessonsWithResources,
              uniqueVideoCount: resourceMetrics.uniqueVideoCount,
              coverageRatio: resourceMetrics.coverageRatio
            },
            resourceAvailability: resourceMetrics.resourceAvailability || {
              status: "verified",
              quotaState: "unknown"
            }
          }
        };
        const finalized = await RoadmapDraft.updateOne(
          { _id: draft._id, status: "building", admissionLeaseToken: lease.leaseToken },
          { $set: { status: "ready", result: finalResult, errorCode: "", errorMessage: "", errorDetails: null, updatedAt: new Date() } }
        );
        if (!finalized.modifiedCount) throw Object.assign(new Error("Roadmap draft ownership changed"), { code: "ROADMAP_ADMISSION_LEASE_LOST" });
        await addEvent(draft, { type: "done", state: "ready", draftId, roadmapId: String(courseId) });
      } catch (caughtError) {
        let error = caughtError;
        if (courseId) {
          await Course.updateOne(
            { _id: courseId, createdForUser: userId },
            { $set: { status: "archived", isPublished: false, visibility: "private" } }
          ).catch(() => {});
        }
        if (error?.code !== "ROADMAP_ADMISSION_LEASE_LOST") {
          try { await assertLease(); } catch (leaseError) { error = leaseError; }
        }
        const failureFilter = {
          _id: draft._id,
          status: { $in: ["queued", "building"] },
          admissionLeaseToken: lease.leaseToken
        };
        const failure = serializeRoadmapFailure(error);
        await RoadmapDraft.updateOne(failureFilter, {
          $set: {
            status: "failed",
            ...failure,
            roadmapId: null,
            result: null,
            updatedAt: new Date()
          }
        }).catch(() => {});
        if (error?.code !== "ROADMAP_ADMISSION_LEASE_LOST") {
          await addEvent(draft, {
            type: "error",
            state: "failed",
            draftId,
            message: failure.errorMessage,
            details: failure.errorDetails
          });
        }
      }
    } catch (error) {
      await RoadmapDraft.updateOne(
        {
          _id: draft._id,
          status: { $in: ["queued", "building"] },
          admissionLeaseToken: lease.leaseToken
        },
        {
          $set: {
            status: "failed",
            ...serializeRoadmapFailure(error),
            roadmapId: null,
            result: null,
            updatedAt: new Date()
          }
        }
      ).catch(() => {});
    } finally {
      clearInterval(heartbeatTimer);
      await heartbeatInFlight;
      admissionRuntimes.delete(draftId);
      await releaseAdmission({ draftId, leaseToken: lease.leaseToken }).catch(() => {});
    }
  });
  pump();
  return { draftId, status: "queued", reused: false };
}

export async function cancelQueuedRoadmapDraft(draftId, userId, dependencies = {}) {
  const releaseQueuedAdmission = dependencies.releaseQueuedRoadmapAdmission || releaseQueuedRoadmapAdmission;
  const cancelled = await RoadmapDraft.findOneAndUpdate(
    { draftId, userId, status: "queued" },
    { $set: { status: "cancelled", updatedAt: new Date() } },
    { new: true }
  );
  if (cancelled) {
    const runtime = admissionRuntimes.get(draftId);
    if (runtime) {
      clearInterval(runtime.heartbeatTimer);
      runtime.markLost();
      await runtime.waitForHeartbeat();
      await runtime.release().catch(() => {});
    } else {
      await releaseQueuedAdmission({ draftId, userId }).catch(() => {});
    }
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
  return {
    draftId,
    roadmapId: draft.roadmapId ? String(draft.roadmapId) : null,
    status: draft.status,
    nodes,
    result,
    errorMessage: draft.status === "failed" ? String(draft.errorMessage || "Roadmap build failed. Please retry.") : "",
    errorDetails: draft.status === "failed" && draft.errorDetails && typeof draft.errorDetails === "object" ? draft.errorDetails : null,
    events: draft.events || []
  };
}
