import { claimTrialCampaign } from "../services/trialCampaignClaim.service.js";
import { failure, success } from "../utils/response.js";
import { isValidObjectId } from "../utils/ids.js";

export async function claimCampaign(req, res, next) {
  try {
    if (!isValidObjectId(req.params.campaignId)) return failure(res, "Invalid campaignId", 400);
    const headerKey = String(req.get("Idempotency-Key") || "").trim();
    const bodyKey = String(req.body?.idempotencyKey || "").trim();
    if (headerKey && bodyKey && headerKey !== bodyKey) return failure(res, "Idempotency-Key header and body value must match.", 400);
    const idempotencyKey = headerKey || bodyKey;
    if (!idempotencyKey) return failure(res, "An Idempotency-Key header is required.", 400);
    const result = await claimTrialCampaign({
      campaignId: req.params.campaignId, userId: req.user?.userId, idempotencyKey
    });
    if (!result.ok) return failure(res, result.message, result.status || 400, { code: result.code, reasons: result.reasons || [] });
    return success(res, {
      claim: result.claim, idempotentReplay: Boolean(result.replayed)
    }, result.replayed ? "The existing trial claim reservation was returned."
      : "Trial claim reserved. Trial entitlement activation is handled by the next rollout step.",
    result.replayed ? 200 : 202);
  } catch (error) { return next(error); }
}
