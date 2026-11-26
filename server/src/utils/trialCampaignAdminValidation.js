import { z } from "zod";

const objectIdSchema = z.string().trim().regex(/^[a-f0-9]{24}$/i, "Must be a valid MongoDB ObjectId");
const dateTimeSchema = z.string().datetime({ offset: true }).transform((value) => new Date(value));

const eligibilityCreateSchema = z.object({
  requireActiveAccount: z.boolean().default(true),
  requireVerifiedEmail: z.boolean().default(true),
  requireNoActiveSubscription: z.literal(true).default(true),
  requireNoPreviousTrial: z.boolean().default(true)
}).strict();

const eligibilityUpdateSchema = z.object({
  requireActiveAccount: z.boolean().optional(),
  requireVerifiedEmail: z.boolean().optional(),
  requireNoActiveSubscription: z.literal(true).optional(),
  requireNoPreviousTrial: z.boolean().optional()
}).strict();

function addDateWindowIssue(input, context, startValue, endValue) {
  const start = startValue || new Date();
  const end = endValue || null;
  if (end && end <= start) {
    context.addIssue({
      code: "custom",
      path: ["endsAt"],
      message: "Campaign end must be later than its start"
    });
  }
}

export const trialCampaignCreateSchema = z.object({
  internalName: z.string().trim().min(3).max(120),
  internalReason: z.string().trim().min(10).max(500),
  offerTitle: z.string().trim().min(3).max(120),
  offerDescription: z.string().trim().min(10).max(1000),
  trialPlanId: objectIdSchema,
  trialDays: z.number().int().min(1).max(30),
  startsAt: dateTimeSchema.optional(),
  endsAt: z.union([dateTimeSchema, z.null()]).optional().default(null),
  maxClaims: z.number().int().min(1).max(1_000_000).default(100),
  eligibility: eligibilityCreateSchema.default({
    requireActiveAccount: true,
    requireVerifiedEmail: true,
    requireNoActiveSubscription: true,
    requireNoPreviousTrial: true
  }),
  conversionMode: z.enum(["none", "consent_required"]).default("none"),
  conversionPlanId: z.union([objectIdSchema, z.null()]).optional().default(null)
}).strict().superRefine((input, context) => {
  addDateWindowIssue(input, context, input.startsAt, input.endsAt);
  if (input.conversionMode === "consent_required" && !input.conversionPlanId) {
    context.addIssue({
      code: "custom",
      path: ["conversionPlanId"],
      message: "A paid conversion plan is required when consent-based conversion is enabled"
    });
  }
  if (input.conversionMode === "none" && input.conversionPlanId) {
    context.addIssue({
      code: "custom",
      path: ["conversionPlanId"],
      message: "A conversion plan cannot be set when conversion is disabled"
    });
  }
  if (input.conversionPlanId && input.conversionPlanId === input.trialPlanId) {
    context.addIssue({
      code: "custom",
      path: ["conversionPlanId"],
      message: "Trial and conversion plans must be different"
    });
  }
});

export const trialCampaignUpdateSchema = z.object({
  reason: z.string().trim().min(10).max(500),
  internalName: z.string().trim().min(3).max(120).optional(),
  internalReason: z.string().trim().min(10).max(500).optional(),
  offerTitle: z.string().trim().min(3).max(120).optional(),
  offerDescription: z.string().trim().min(10).max(1000).optional(),
  trialPlanId: objectIdSchema.optional(),
  trialDays: z.number().int().min(1).max(30).optional(),
  startsAt: dateTimeSchema.optional(),
  endsAt: z.union([dateTimeSchema, z.null()]).optional(),
  maxClaims: z.number().int().min(1).max(1_000_000).optional(),
  eligibility: eligibilityUpdateSchema.optional(),
  conversionMode: z.enum(["none", "consent_required"]).optional(),
  conversionPlanId: z.union([objectIdSchema, z.null()]).optional()
}).strict().superRefine((input, context) => {
  const mutableKeys = Object.keys(input).filter((key) => key !== "reason");
  if (mutableKeys.length === 0) {
    context.addIssue({
      code: "custom",
      path: [],
      message: "Provide at least one campaign field to update"
    });
  }
  if (input.startsAt && input.endsAt && input.endsAt <= input.startsAt) {
    context.addIssue({
      code: "custom",
      path: ["endsAt"],
      message: "Campaign end must be later than its start"
    });
  }
  if (input.conversionMode === "consent_required" && input.conversionPlanId === null) {
    context.addIssue({
      code: "custom",
      path: ["conversionPlanId"],
      message: "A paid conversion plan is required when consent-based conversion is enabled"
    });
  }
  if (input.conversionMode === "none" && input.conversionPlanId) {
    context.addIssue({
      code: "custom",
      path: ["conversionPlanId"],
      message: "A conversion plan cannot be set when conversion is disabled"
    });
  }
  if (input.trialPlanId && input.conversionPlanId && input.trialPlanId === input.conversionPlanId) {
    context.addIssue({
      code: "custom",
      path: ["conversionPlanId"],
      message: "Trial and conversion plans must be different"
    });
  }
});

export const TRIAL_CAMPAIGN_STATUSES = Object.freeze(["draft", "published", "paused", "ended"]);
