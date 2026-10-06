import * as service from "../services/achievement.service.js";
import { success } from "../utils/response.js";

export async function me(req, res, next) {
  try {
    const stats = await service.getLearningStats(req.user.userId);
    return success(res, { stats });
  } catch (e) { next(e); }
}
