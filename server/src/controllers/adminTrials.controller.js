import { z } from "zod";
import { User } from "../models/User.js";
import { SubscriptionPlan } from "../models/SubscriptionPlan.js";
import { UserSubscription } from "../models/UserSubscription.js";
import { TrialGrant } from "../models/TrialGrant.js";
import { recordAuditEvent } from "../services/auditOutbox.service.js";
import { failure, success } from "../utils/response.js";
import { isValidObjectId } from "../utils/ids.js";

const filterSchema = z.object({
  createdAfter: z.string().datetime().optional().or(z.literal("")),
  createdBefore: z.string().datetime().optional().or(z.literal("")),
  authProvider: z.enum(["local", "google", "local_google", "any"]).default("any"),
  emailVerified: z.enum(["yes", "no", "any"]).default("yes"),
  phoneVerified: z.enum(["yes", "no", "any"]).default("any"),
  marketingConsent: z.enum(["yes", "no", "any"]).default("any"),
  profileSetup: z.enum(["complete", "skipped", "incomplete", "any"]).default("any"),
  city: z.string().trim().max(100).optional().or(z.literal("")),
  learningGoal: z.string().trim().max(240).optional().or(z.literal("")),
  priorTrial: z.enum(["never", "any"]).default("never"),
  subscriptionStatus: z.enum(["none", "expired_or_cancelled", "any"]).default("none")
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
function escapeRegex(value) { return value.split("").map((char) => ".+?^${}()|[]\\\\".includes(char) ? "\\" + char : char).join(""); }

async function resolveAudience(rawFilters) {
  const filters = filterSchema.parse(rawFilters || {});
  const userFilter = { role: "user", isActive: true };
  if (filters.emailVerified !== "any") userFilter.emailVerified = filters.emailVerified === "yes";
  if (filters.authProvider !== "any") userFilter.authProvider = filters.authProvider;
  if (filters.phoneVerified !== "any") userFilter.phoneNumberVerified = filters.phoneVerified === "yes";
  if (filters.marketingConsent !== "any") userFilter.marketingEmailConsent = filters.marketingConsent === "yes";
  if (filters.city) userFilter.city = { $regex: escapeRegex(filters.city), $options: "i" };
  if (filters.learningGoal) userFilter.learningGoal = { $regex: escapeRegex(filters.learningGoal), $options: "i" };
  if (filters.profileSetup === "complete") userFilter.profileSetupSkippedAt = null;
  if (filters.profileSetup === "skipped") userFilter.profileSetupSkippedAt = { $ne: null };
  if (filters.profileSetup === "incomplete") userFilter.$or = [{ profileSetupSkippedAt: { $ne: null } }, { city: "" }, { learningGoal: "" }];
  if (filters.createdAfter || filters.createdBefore) {
    userFilter.createdAt = {};
    if (filters.createdAfter) userFilter.createdAt.$gte = new Date(filters.createdAfter);
    if (filters.createdBefore) userFilter.createdAt.$lte = new Date(filters.createdBefore);
  }
  const users = await User.find(userFilter).select("_id name email createdAt authProvider emailVerified").sort({ createdAt: -1 }).lean();
  const ids = users.map((user) => user._id);
  const [subs, previousTrials] = await Promise.all([
    UserSubscription.find({ user: { $in: ids } }).select("user status currentPeriodEnd").lean(),
    filters.priorTrial === "never" ? TrialGrant.find({ user: { $in: ids } }).select("user").lean() : Promise.resolve([])
  ]);
  const subByUser = new Map(subs.map((sub) => [String(sub.user), sub]));
  const priorSet = new Set(previousTrials.map((grant) => String(grant.user)));
  const eligible = [], skipped = [];
  for (const user of users) {
    const id = String(user._id);
    const sub = subByUser.get(id);
    const active = sub && ["trialing", "active", "past_due"].includes(sub.status) && (!sub.currentPeriodEnd || new Date(sub.currentPeriodEnd) > new Date());
    const existingGrant = priorSet.has(id);
    const skipReason = filters.priorTrial === "never" && existingGrant ? "Previously received a trial"
      : active ? "Has an active subscription"
      : filters.subscriptionStatus === "expired_or_cancelled" && (!sub || !["expired", "cancelled", "expired_or_cancelled"].includes(sub.status)) ? "No expired/cancelled subscription"
      : "";
    if (skipReason) skipped.push({ id, name: user.name, email: user.email, reason: skipReason });
    else eligible.push({ id, name: user.name, email: user.email, createdAt: user.createdAt, authProvider: user.authProvider, emailVerified: user.emailVerified });
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
