import { getLearnerTrialOffer } from "../services/trialCampaignOffer.service.js";
import { failure, success } from "../utils/response.js";

export async function getLearnerOffer(req, res, next) {
  try {
    if (req.user?.role !== "user") {
      return failure(res, "Only learner accounts can request trial offers.", 403);
    }
    const result = await getLearnerTrialOffer({ userId: req.user.userId });
    return success(
      res,
      result,
      result.available ? "An eligible trial offer is available." : "No eligible trial offer is currently available."
    );
  } catch (error) {
    return next(error);
  }
}
