import { z } from "zod";
import { failure, success } from "../utils/response.js";
import { getEntitlement, getActivePlanForUser } from "../services/subscriptionEntitlement.service.js";
import { createRoadmapDraft, getDraftForUser, waitForDraft, attachDraftEvents, getRoadmapPoll } from "../services/asyncRoadmap.service.js";

const profileSchema = z.object({
  topic: z.string().trim().min(2).max(200),
  level: z.enum(["Beginner", "Intermediate", "Advanced"]).default("Beginner"),
  goals: z.array(z.string().trim().min(1)).max(20).default([]),
  studyTimeMinutesPerDay: z.number().int().min(15).max(720).default(60),
  knownSkills: z.array(z.string().trim().min(1)).max(50).default([]),
  goal: z.enum(["job_ready", "exam", "project", "learn"]).optional(),
  intentProfile: z.record(z.unknown()).optional(),
  language: z.string().max(10).optional(),
  targetRole: z.string().max(120).nullable().optional(),
  targetCompany: z.string().max(120).nullable().optional(),
  examName: z.string().max(120).nullable().optional(),
  examDate: z.string().max(40).nullable().optional(),
  syllabusText: z.string().max(20000).nullable().optional(),
  projectIdea: z.string().max(200).nullable().optional(),
  deadline: z.string().max(40).nullable().optional()
});

async function authorize(req, res) {
  const personalized = await getEntitlement(req.user.userId, "personalized_roadmaps");
  const builder = await getEntitlement(req.user.userId, "ai_course_builder");
  if (!personalized.allowed || !builder.allowed) {
    failure(res, "AI roadmap building is not included in your current plan.", 403, { feature: !builder.allowed ? "ai_course_builder" : "personalized_roadmaps", plan: (await getActivePlanForUser(req.user.userId))?.name || "Free" });
    return false;
  }
  return true;
}

export async function createDraft(req, res, next, dependencies = {}) {
  const authorizeRequest = dependencies.authorize || authorize;
  const createDraftRecord = dependencies.createRoadmapDraft || createRoadmapDraft;
  try {
    if (!await authorizeRequest(req, res)) return;
    const profile = profileSchema.parse(req.body.profile || req.body);
    if (profile.intentProfile) Object.assign(profile, profile.intentProfile);
    const draft = await createDraftRecord({ userId: req.user.userId, profile });
    return success(res, draft, "Roadmap draft queued");
  } catch (error) {
    if (error instanceof z.ZodError) return failure(res, "Validation failed", 400, error.flatten().fieldErrors);
    if (error?.code === "ROADMAP_USER_RATE_LIMIT" || error?.code === "ROADMAP_USER_QUEUE_LIMIT" || error?.code === "ROADMAP_QUEUE_FULL") {
      return failure(res, error.message, error.status || 503, { code: error.code, retryable: true });
    }
    next(error);
  }
}

export async function finalizeDraft(req, res, next, dependencies = {}) {
  const authorizeRequest = dependencies.authorize || authorize;
  const getDraft = dependencies.getDraftForUser || getDraftForUser;
  const waitForCurrentDraft = dependencies.waitForDraft || waitForDraft;
  try {
    if (!await authorizeRequest(req, res)) return;
    const draftId = z.string().uuid().parse(req.body?.draftId);
    const suppliedProfile = req.body?.profile ? profileSchema.parse(req.body.profile) : null;
    let draft = await getDraft(draftId, req.user.userId);
    if (!draft) return failure(res, "Roadmap draft not found", 404);
    if (suppliedProfile && JSON.stringify(suppliedProfile) !== JSON.stringify(draft.profile)) {
      // A changed goal/profile must create a new draft; never mutate a running idempotent build.
      return failure(res, "Profile changed. Start a new roadmap draft.", 409);
    }
    draft = await waitForCurrentDraft(draftId, req.user.userId, 2000);
    if (draft?.status === "ready") return success(res, draft.result, "Learning roadmap generated successfully");
    if (draft?.status === "failed") return failure(res, "Roadmap build failed. Please retry.", 502, { draftId, retryable: true });
    return success(res, { ...(draft?.result || {}), draftId, status: draft?.status || "queued", roadmapId: draft?.roadmapId ? String(draft.roadmapId) : null, modules: draft?.result?.course?.modules || [], eventsUrl: `/api/ai/roadmap/${draftId}/events`, pollUrl: `/api/ai/roadmap/${draftId}` }, "Roadmap is still building");
  } catch (error) {
    if (error instanceof z.ZodError) return failure(res, "Validation failed", 400, error.flatten().fieldErrors);
    next(error);
  }
}

export async function pollDraft(req, res, next) {
  try {
    if (!await authorize(req, res)) return;
    const result = await getRoadmapPoll(req.params.draftId, req.user.userId);
    return result ? success(res, result, "Roadmap build status") : failure(res, "Roadmap draft not found", 404);
  } catch (error) { next(error); }
}

export async function streamDraft(req, res, next) {
  try {
    if (!await authorize(req, res)) return;
    const ok = await attachDraftEvents(req, res, req.params.draftId, req.user.userId);
    if (!ok) return failure(res, "Roadmap draft not found", 404);
  } catch (error) { if (!res.headersSent) next(error); else res.end(); }
}
