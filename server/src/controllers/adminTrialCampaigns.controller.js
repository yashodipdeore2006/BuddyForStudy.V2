import { z } from "zod";
import { TrialCampaign } from "../models/TrialCampaign.js";
import { SubscriptionPlan } from "../models/SubscriptionPlan.js";
import { recordAuditEvent } from "../services/auditOutbox.service.js";
import { failure, success } from "../utils/response.js";
import { isValidObjectId } from "../utils/ids.js";
import { escapeRegex } from "../utils/escapeRegex.js";
import { getTrialCampaignPresets } from "../config/trialCampaignPresets.js";
import {
  TRIAL_CAMPAIGN_STATUSES,
  trialCampaignCreateSchema,
  trialCampaignUpdateSchema
} from "../utils/trialCampaignAdminValidation.js";

const populatedFields = [
  { path: "trialPlan", select: "name price currency billingInterval isActive" },
  { path: "conversionPlan", select: "name price currency billingInterval isActive" },
  { path: "createdBy", select: "name email" },
  { path: "updatedBy", select: "name email" },
  { path: "publishedBy", select: "name email" }
];

function actorId(req) {
  return req.user?.user?._id || req.user?.userId || null;
}

function campaignSnapshot(campaign) {
  if (!campaign) return null;
  const referenceId = (value) => value?._id ? String(value._id) : value ? String(value) : null;
  return {
    internalName: campaign.internalName,
    offerTitle: campaign.offerTitle,
    trialPlan: referenceId(campaign.trialPlan),
    trialDays: campaign.trialDays,
    status: campaign.status,
    startsAt: campaign.startsAt,
    endsAt: campaign.endsAt,
    maxClaims: campaign.maxClaims,
    claimedCount: campaign.claimedCount,
    conversionMode: campaign.conversionMode,
    conversionPlan: referenceId(campaign.conversionPlan)
  };
}

async function auditCampaign(req, action, campaign, before, after, reason) {
  const actor = actorId(req);
  if (!actor) {
    console.error("[trial-campaign-audit] Missing administrator actor; audit event was not submitted.");
    return { recorded: false, queued: false };
  }
  return recordAuditEvent({
    actor,
    action,
    targetType: "TrialCampaign",
    targetId: String(campaign._id),
    before: campaignSnapshot(before),
    after: campaignSnapshot(after),
    reason: String(reason || "").trim().slice(0, 500),
    ip: String(req.ip || "").slice(0, 100),
    userAgent: String(req.get("user-agent") || "").slice(0, 500)
  });
}

function parseObjectId(value, field, res) {
  if (!isValidObjectId(value)) {
    failure(res, "Invalid " + field, 400);
    return false;
  }
  return true;
}

function validationFailure(error, res, message) {
  if (error instanceof z.ZodError) {
    return failure(res, message, 400, error.flatten().fieldErrors);
  }
  throw error;
}

async function validatePlanReferences({ trialPlanId, conversionMode, conversionPlanId }) {
  const trialPlan = await SubscriptionPlan.findOne({ _id: trialPlanId, isActive: true }).lean();
  if (!trialPlan) {
    return { valid: false, message: "Trial entitlement plan must exist and be active." };
  }

  if (conversionMode === "none") {
    if (conversionPlanId) {
      return { valid: false, message: "A conversion plan cannot be set when conversion is disabled." };
    }
    return { valid: true };
  }

  if (!conversionPlanId) {
    return { valid: false, message: "Choose an active recurring paid conversion plan." };
  }
  if (String(trialPlanId) === String(conversionPlanId)) {
    return { valid: false, message: "Trial and conversion plans must be different." };
  }

  const conversionPlan = await SubscriptionPlan.findOne({
    _id: conversionPlanId,
    isActive: true,
    price: { $gt: 0 },
    billingInterval: { $in: ["monthly", "quarterly", "yearly"] }
  }).lean();

  if (!conversionPlan) {
    return { valid: false, message: "Conversion plan must be an active recurring paid plan." };
  }
  return { valid: true };
}

function campaignDateWindowIsValid(startsAt, endsAt) {
  return !endsAt || new Date(endsAt).getTime() > new Date(startsAt || Date.now()).getTime();
}

export function listCampaignPresets(_req, res) {
  return success(res, {
    presets: getTrialCampaignPresets(),
    valuesEditable: true
  }, "Quick-trial presets ready. Campaign values remain editable before creation.");
}

export async function listCampaigns(req, res, next) {
  try {
    const page = Math.min(10000, Math.max(1, Number.parseInt(String(req.query.page || "1"), 10) || 1));
    const limit = Math.min(100, Math.max(1, Number.parseInt(String(req.query.limit || "25"), 10) || 25));
    const filter = {};
    const status = req.query.status == null ? "" : String(req.query.status).trim();
    if (status) {
      if (!TRIAL_CAMPAIGN_STATUSES.includes(status)) return failure(res, "Invalid campaign status filter.", 400);
      filter.status = status;
    }
    const query = String(req.query.q || "").trim().slice(0, 100);
    if (query) {
      const safePattern = new RegExp(escapeRegex(query), "i");
      filter.$or = [{ internalName: safePattern }, { offerTitle: safePattern }];
    }

    const [campaigns, total] = await Promise.all([
      TrialCampaign.find(filter).populate(populatedFields).sort({ updatedAt: -1, _id: -1 })
        .skip((page - 1) * limit).limit(limit).lean(),
      TrialCampaign.countDocuments(filter)
    ]);
    return success(res, {
      campaigns,
      total,
      page,
      pages: Math.max(1, Math.ceil(total / limit)),
      limit
    });
  } catch (error) {
    return next(error);
  }
}

export async function getCampaign(req, res, next) {
  try {
    if (!parseObjectId(req.params.campaignId, "campaignId", res)) return;
    const campaign = await TrialCampaign.findById(req.params.campaignId).populate(populatedFields).lean();
    if (!campaign) return failure(res, "Trial campaign not found.", 404);
    return success(res, { campaign });
  } catch (error) {
    return next(error);
  }
}

export async function createCampaign(req, res, next) {
  try {
    const input = trialCampaignCreateSchema.parse(req.body || {});
    const planValidation = await validatePlanReferences({
      trialPlanId: input.trialPlanId,
      conversionMode: input.conversionMode,
      conversionPlanId: input.conversionPlanId
    });
    if (!planValidation.valid) return failure(res, planValidation.message, 400);

    const actor = actorId(req);
    if (!actor) return failure(res, "Administrator identity is required.", 401);

    const campaign = await TrialCampaign.create({
      internalName: input.internalName,
      internalReason: input.internalReason,
      offerTitle: input.offerTitle,
      offerDescription: input.offerDescription,
      trialPlan: input.trialPlanId,
      trialDays: input.trialDays,
      status: "draft",
      startsAt: input.startsAt || new Date(),
      endsAt: input.endsAt ?? null,
      maxClaims: input.maxClaims,
      eligibility: input.eligibility,
      conversionMode: input.conversionMode,
      conversionPlan: input.conversionPlanId,
      createdBy: actor
    });
    await auditCampaign(req, "trial_campaign.created", campaign, null, campaign, input.internalReason);
    await campaign.populate(populatedFields);
    return success(res, { campaign }, "Trial campaign created as a draft.", 201);
  } catch (error) {
    if (error instanceof z.ZodError) return validationFailure(error, res, "Invalid trial campaign input.");
    if (error?.code === 11000) return failure(res, "A campaign with a conflicting unique value already exists.", 409);
    return next(error);
  }
}

export async function updateCampaign(req, res, next) {
  try {
    if (!parseObjectId(req.params.campaignId, "campaignId", res)) return;
    const input = trialCampaignUpdateSchema.parse(req.body || {});
    const campaign = await TrialCampaign.findById(req.params.campaignId);
    if (!campaign) return failure(res, "Trial campaign not found.", 404);
    if (!["draft", "paused"].includes(campaign.status)) {
      return failure(res, "Only draft or paused campaigns can be edited.", 409);
    }
    if (campaign.claimedCount > 0) {
      return failure(res, "Campaign settings are locked after the first learner claim.", 409);
    }

    const startsAt = input.startsAt === undefined ? campaign.startsAt : input.startsAt;
    const endsAt = input.endsAt === undefined ? campaign.endsAt : input.endsAt;
    if (!campaignDateWindowIsValid(startsAt, endsAt)) {
      return failure(res, "Campaign end must be later than its start.", 400);
    }

    const trialPlanId = input.trialPlanId || String(campaign.trialPlan);
    const conversionMode = input.conversionMode || campaign.conversionMode;
    const conversionPlanId = Object.hasOwn(input, "conversionPlanId")
      ? input.conversionPlanId
      : campaign.conversionPlan ? String(campaign.conversionPlan) : null;
    const planValidation = await validatePlanReferences({ trialPlanId, conversionMode, conversionPlanId });
    if (!planValidation.valid) return failure(res, planValidation.message, 400);

    const updates = {};
    for (const field of [
      "internalName", "internalReason", "offerTitle", "offerDescription",
      "trialDays", "startsAt", "endsAt", "maxClaims", "conversionMode"
    ]) {
      if (input[field] !== undefined) updates[field] = input[field];
    }
    if (input.trialPlanId !== undefined) updates.trialPlan = input.trialPlanId;
    if (Object.hasOwn(input, "conversionPlanId")) updates.conversionPlan = input.conversionPlanId;
    if (input.eligibility !== undefined) {
      updates.eligibility = {
        ...campaign.eligibility.toObject(),
        ...input.eligibility
      };
    }
    const actor = actorId(req);
    if (!actor) return failure(res, "Administrator identity is required.", 401);
    updates.updatedBy = actor;

    const updated = await TrialCampaign.findOneAndUpdate(
      { _id: campaign._id, status: campaign.status, claimedCount: 0 },
      { $set: updates },
      { new: true, runValidators: true }
    );
    if (!updated) {
      return failure(res, "Campaign changed while the update was being saved. Refresh and try again.", 409);
    }
    await auditCampaign(req, "trial_campaign.updated", updated, campaign, updated, input.reason);
    await updated.populate(populatedFields);
    return success(res, { campaign: updated }, "Trial campaign updated.");
  } catch (error) {
    if (error instanceof z.ZodError) return validationFailure(error, res, "Invalid trial campaign update.");
    return next(error);
  }
}

export async function publishCampaign(req, res, next) {
  try {
    if (!parseObjectId(req.params.campaignId, "campaignId", res)) return;
    const campaign = await TrialCampaign.findById(req.params.campaignId);
    if (!campaign) return failure(res, "Trial campaign not found.", 404);
    if (!["draft", "paused"].includes(campaign.status)) {
      return failure(res, "Only draft or paused campaigns can be published.", 409);
    }
    if (campaign.endsAt && campaign.endsAt <= new Date()) {
      return failure(res, "An expired campaign cannot be published.", 400);
    }

    const planValidation = await validatePlanReferences({
      trialPlanId: String(campaign.trialPlan),
      conversionMode: campaign.conversionMode,
      conversionPlanId: campaign.conversionPlan ? String(campaign.conversionPlan) : null
    });
    if (!planValidation.valid) return failure(res, planValidation.message, 400);

    const actor = actorId(req);
    if (!actor) return failure(res, "Administrator identity is required.", 401);
    const now = new Date();
    const updated = await TrialCampaign.findOneAndUpdate(
      { _id: campaign._id, status: campaign.status },
      { $set: {
        status: "published",
        publishedAt: now,
        publishedBy: actor,
        pausedAt: null,
        endedAt: null,
        updatedBy: actor
      } },
      { new: true, runValidators: true }
    );
    if (!updated) return failure(res, "Campaign lifecycle changed concurrently. Refresh and try again.", 409);
    await auditCampaign(req, "trial_campaign.published", updated, campaign, updated, "Campaign published by administrator.");
    await updated.populate(populatedFields);
    return success(res, { campaign: updated }, "Trial campaign published.");
  } catch (error) {
    return next(error);
  }
}

export async function pauseCampaign(req, res, next) {
  try {
    if (!parseObjectId(req.params.campaignId, "campaignId", res)) return;
    const campaign = await TrialCampaign.findById(req.params.campaignId);
    if (!campaign) return failure(res, "Trial campaign not found.", 404);
    if (campaign.status !== "published") {
      return failure(res, "Only published campaigns can be paused.", 409);
    }

    const actor = actorId(req);
    if (!actor) return failure(res, "Administrator identity is required.", 401);
    const now = new Date();
    const updated = await TrialCampaign.findOneAndUpdate(
      { _id: campaign._id, status: "published" },
      { $set: { status: "paused", pausedAt: now, updatedBy: actor } },
      { new: true, runValidators: true }
    );
    if (!updated) return failure(res, "Campaign lifecycle changed concurrently. Refresh and try again.", 409);
    await auditCampaign(req, "trial_campaign.paused", updated, campaign, updated, "Campaign paused by administrator.");
    await updated.populate(populatedFields);
    return success(res, { campaign: updated }, "Trial campaign paused.");
  } catch (error) {
    return next(error);
  }
}

export async function disableCampaign(req, res, next) {
  try {
    if (!parseObjectId(req.params.campaignId, "campaignId", res)) return;
    const campaign = await TrialCampaign.findById(req.params.campaignId);
    if (!campaign) return failure(res, "Trial campaign not found.", 404);
    if (campaign.status === "ended") return failure(res, "Trial campaign is already disabled.", 409);

    const actor = actorId(req);
    if (!actor) return failure(res, "Administrator identity is required.", 401);
    const now = new Date();
    const updated = await TrialCampaign.findOneAndUpdate(
      { _id: campaign._id, status: { $in: ["draft", "published", "paused"] } },
      { $set: { status: "ended", endedAt: now, updatedBy: actor } },
      { new: true, runValidators: true }
    );
    if (!updated) return failure(res, "Campaign lifecycle changed concurrently. Refresh and try again.", 409);
    // Disabling stops new offers; it does not revoke or rewrite existing learner entitlements.
    await auditCampaign(req, "trial_campaign.disabled", updated, campaign, updated, "Campaign disabled by administrator.");
    await updated.populate(populatedFields);
    return success(res, { campaign: updated }, "Trial campaign disabled. Existing learner claims are unchanged.");
  } catch (error) {
    return next(error);
  }
}
