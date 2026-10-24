import { z } from "zod";
import { User } from "../models/User.js";
import { SubscriptionPlan } from "../models/SubscriptionPlan.js";
import { UserSubscription } from "../models/UserSubscription.js";
import { TrialGrant } from "../models/TrialGrant.js";
import { recordAuditEvent } from "../services/auditOutbox.service.js";
import { failure, success } from "../utils/response.js";
import { isValidObjectId } from "../utils/ids.js";
import { resolveAdminAudience } from "../services/adminAudience.service.js";

const filterSchema = z.object({
  q: z.string().trim().max(100).optional().or(z.literal("")),
  status: z.enum(["active", "disabled", ""]).optional(),
  role: z.enum(["user", "admin", ""]).optional(),
  emailVerified: z.enum(["yes", "no", "any"]).default("yes"),
  authProvider: z.enum(["local", "google", "local_google", "any"]).default("any"),
  subscriptionStatus: z.enum(["none", "trialing", "active", "past_due", "cancelled", "expired", "expired_or_cancelled", "any"]).default("none"),
  planId: z.string().optional().or(z.literal("")),
  expiresWithinDays: z.coerce.number().int().min(1).max(365).optional(),
  courseId: z.string().optional().or(z.literal("")),
  enrollmentStatus: z.enum(["active", "completed", "cancelled", ""]).optional(),
  progressMin: z.coerce.number().min(0).max(100).optional(),
  progressMax: z.coerce.number().min(0).max(100).optional(),
  inactiveDays: z.coerce.number().int().min(1).max(365).optional(),
  totalSpendMin: z.coerce.number().min(0).max(100000000).optional(),
  courseCountMin: z.coerce.number().int().min(1).max(1000).optional(),
  planSegment: z.enum(["popular", "paid", "free", "premium", ""]).optional(),
  courseSegment: z.enum(["popular", "paid", "free", "featured", ""]).optional(),
  registeredAfter: z.string().optional().or(z.literal("")),
  registeredBefore: z.string().optional().or(z.literal("")),
  createdAfter: z.string().datetime().optional().or(z.literal("")),
  createdBefore: z.string().datetime().optional().or(z.literal("")),
  priorTrial: z.enum(["never", "any"]).default("never")
}).strict();

const previewSchema = z.object({
  planId: z.string().min(1),
  conversionPlanId: z.string().optional().or(z.literal("")),
  campaignName: z.string().trim().min(3).max(120),
  reason: z.string().trim().min(10).max(500),
  trialDays: z.coerce.number().int().min(1).max(30),
  filters: filterSchema
}).strict();

function actorId(req) { return req.user?.user?._id || req.user?.userId; }
async function resolveAudience(rawFilters) {
  const filters = filterSchema.parse(rawFilters || {});
  const sharedFilters = {
    ...filters,
    role: "user",
    status: "active",
    emailVerified: filters.emailVerified === "any" ? undefined : filters.emailVerified === "yes",
    authProvider: filters.authProvider === "any" ? undefined : filters.authProvider,
    subscriptionStatus: undefined,
    registeredAfter: filters.registeredAfter || (filters.createdAfter ? new Date(filters.createdAfter).toISOString().slice(0, 10) : undefined),
    registeredBefore: filters.registeredBefore || (filters.createdBefore ? new Date(filters.createdBefore).toISOString().slice(0, 10) : undefined),
    createdAfter: undefined,
    createdBefore: undefined
  };
  // Use the same audience resolver as email campaigns so filter semantics stay aligned.
  const users = await resolveAdminAudience(
    { audience: "all", filters: sharedFilters },
    { select: "_id name email createdAt authProvider emailVerified phoneNumberVerified marketingEmailConsent profileSetupSkippedAt city learningGoal", limit: null }
  );
  const matchingUsers = users.filter((user) => {
    if (filters.phoneVerified !== "any" && Boolean(user.phoneNumberVerified) !== (filters.phoneVerified === "yes")) return false;
    if (filters.marketingConsent !== "any" && Boolean(user.marketingEmailConsent) !== (filters.marketingConsent === "yes")) return false;
    if (filters.city && !String(user.city || "").toLowerCase().includes(filters.city.toLowerCase())) return false;
    if (filters.learningGoal && !String(user.learningGoal || "").toLowerCase().includes(filters.learningGoal.toLowerCase())) return false;
    if (filters.profileSetup === "complete" && user.profileSetupSkippedAt) return false;
    if (filters.profileSetup === "skipped" && !user.profileSetupSkippedAt) return false;
    if (filters.profileSetup === "incomplete" && !user.profileSetupSkippedAt && user.city && user.learningGoal) return false;
    return true;
  });
  const ids = matchingUsers.map((user) => user._id);
  const [subs, previousTrials] = await Promise.all([
    UserSubscription.find({ user: { $in: ids } }).select("user status currentPeriodEnd").lean(),
    filters.priorTrial === "never" ? TrialGrant.find({ user: { $in: ids } }).select("user").lean() : Promise.resolve([])
  ]);
  const subsByUser = new Map();
  for (const sub of subs) {
    const key = String(sub.user);
    const list = subsByUser.get(key) || [];
    list.push(sub);
    subsByUser.set(key, list);
  }
  const priorSet = new Set(previousTrials.map((grant) => String(grant.user)));
  const now = new Date();
  const eligible = [], skipped = [];
  for (const user of matchingUsers) {
    const id = String(user._id);
    const userSubs = subsByUser.get(id) || [];
    const active = userSubs.some((sub) => ["trialing", "active", "past_due"].includes(sub.status) && (!sub.currentPeriodEnd || new Date(sub.currentPeriodEnd) > now));
    const hasExpiredOrCancelled = userSubs.some((sub) => ["expired", "cancelled", "expired_or_cancelled"].includes(sub.status));
    const hasRequestedSubscription = filters.subscriptionStatus === "any" ||
      (filters.subscriptionStatus === "none") ||
      (filters.subscriptionStatus === "expired_or_cancelled" && hasExpiredOrCancelled) ||
      (["trialing", "active", "past_due", "cancelled", "expired"].includes(filters.subscriptionStatus) && userSubs.some((sub) => sub.status === filters.subscriptionStatus));
    const existingGrant = priorSet.has(id);
    const skipReason = filters.priorTrial === "never" && existingGrant ? "Previously received a trial"
      : active ? "Has an active subscription"
      : !hasRequestedSubscription ? "Does not match subscription status filter"
      : "";
    const row = { id, name: user.name, email: user.email, createdAt: user.createdAt, authProvider: user.authProvider, emailVerified: user.emailVerified };
    if (skipReason) skipped.push({ ...row, reason: skipReason });
    else eligible.push(row);
  }
  return { filters, eligible, skipped, totalEligibleBeforeLimit: eligible.length };
}

export async function preview(req, res, next) {
  try {
    const input = previewSchema.parse(req.body || {});
    if (!isValidObjectId(input.planId)) return failure(res, "Choose a valid trial entitlement plan.", 400);
    const plan = await SubscriptionPlan.findOne({ _id: input.planId, isActive: true });
    if (!plan) return failure(res, "Trial entitlement plan is unavailable.", 404);
    if (input.conversionPlanId && !isValidObjectId(input.conversionPlanId)) return failure(res, "Choose a valid conversion plan.", 400);
    if (input.conversionPlanId && input.conversionPlanId === input.planId) return failure(res, "Trial and paid conversion plans must be different.", 400);
    if (input.conversionPlanId && !await SubscriptionPlan.exists({ _id: input.conversionPlanId, isActive: true, price: { $gt: 0 }, billingInterval: { $ne: "one_time" } })) return failure(res, "Conversion plan must be an active recurring paid plan.", 400);
    const audience = await resolveAudience(input.filters);
    return success(res, {
      campaign: { campaignName: input.campaignName, trialDays: input.trialDays, plan: { id: String(plan._id), name: plan.name }, conversionPlanId: input.conversionPlanId || null },
      eligibleCount: audience.eligible.length,
      totalEligibleBeforeLimit: audience.totalEligibleBeforeLimit,
      skippedCount: audience.skipped.length,
      eligible: audience.eligible.slice(0, 50),
      skipped: audience.skipped.slice(0, 50),
      filters: audience.filters
    }, "Audience preview only. No trial grants or payments have been created.");
  } catch (error) {
    if (error instanceof z.ZodError) return failure(res, "Invalid trial campaign input.", 400, error.flatten().fieldErrors);
    next(error);
  }
}

export async function grant(req, res, next) {
  try {
    const input = previewSchema.extend({ confirm: z.literal(true), idempotencyKey: z.string().trim().min(12).max(120) }).parse(req.body || {});
    const plan = await SubscriptionPlan.findOne({ _id: input.planId, isActive: true });
    if (!plan) return failure(res, "Trial entitlement plan is unavailable.", 404);
    const audience = await resolveAudience(input.filters);
    if (!audience.eligible.length) return success(res, { granted: 0, skipped: audience.skipped.length }, "No eligible users to grant.");
    const now = new Date();
    const endsAt = new Date(now.getTime() + input.trialDays * 24 * 60 * 60 * 1000);
    let granted = 0, skipped = audience.skipped.length;
    for (const user of audience.eligible) {
      const key = input.idempotencyKey + ":" + String(user.id);
      if (await TrialGrant.exists({ idempotencyKey: key })) { skipped++; continue; }
      const activeSub = await UserSubscription.findOne({ user: user.id, status: { $in: ["trialing", "active", "past_due"] }, $or: [{ currentPeriodEnd: null }, { currentPeriodEnd: { $gt: now } }] });
      const existingTrial = await TrialGrant.exists({ user: user.id, status: { $in: ["trialing", "converted"] } });
      if (activeSub || (input.filters.priorTrial === "never" && existingTrial)) { skipped++; continue; }
      try {
        const grant = await TrialGrant.create({
          user: user.id, plan: plan._id, campaignName: input.campaignName, reason: input.reason,
          grantedBy: actorId(req), startsAt: now, endsAt, status: "trialing",
          conversionPlan: input.conversionPlanId || null,
          conversionConsentStatus: input.conversionPlanId ? "pending_user_consent" : "not_requested",
          idempotencyKey: key
        });
        await UserSubscription.findOneAndUpdate(
          { user: user.id },
          { $set: {
            plan: plan._id, status: "trialing", provider: "manual", providerSubscriptionId: "",
            currentPeriodStart: now, currentPeriodEnd: endsAt, cancelAtPeriodEnd: false, cancelledAt: null
          } },
          { upsert: true, new: true, setDefaultsOnInsert: true }
        );
        await recordAuditEvent({
          actor: actorId(req), action: "trial.granted", targetType: "TrialGrant", targetId: String(grant._id),
          before: null, after: { userId: String(user.id), planId: String(plan._id), endsAt, conversionPlanId: input.conversionPlanId || null },
          reason: input.reason, ip: String(req.ip || "").slice(0, 100), userAgent: String(req.get("user-agent") || "").slice(0, 500)
        });
        granted++;
      } catch (error) {
        if (error?.code === 11000) skipped++;
        else throw error;
      }
    }
    return success(res, { granted, skipped, endsAt, conversionRequiresUserConsent: Boolean(input.conversionPlanId) }, "Trial grants processed. No recurring payment was initiated; paid conversion requires the learner's explicit authorization.");
  } catch (error) {
    if (error instanceof z.ZodError) return failure(res, "Invalid trial grant input.", 400, error.flatten().fieldErrors);
    next(error);
  }
}

export async function listGrants(req, res, next) {
  try {
    const page = Math.max(1, Math.min(10000, Number(req.query.page) || 1));
    const limit = Math.max(1, Math.min(100, Number(req.query.limit) || 25));
    const [grants, total] = await Promise.all([
      TrialGrant.find().populate("user", "name email").populate("plan", "name price currency").populate("conversionPlan", "name price currency billingInterval").populate("grantedBy", "name email").sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
      TrialGrant.countDocuments()
    ]);
    return success(res, { grants, total, page, pages: Math.max(1, Math.ceil(total / limit)) });
  } catch (error) { next(error); }
}
