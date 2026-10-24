import * as service from "../services/achievement.service.js";
import { failure, success } from "../utils/response.js";

export async function me(req, res, next) {
  try {
    const stats = await service.getLearningStats(req.user.userId);
    return success(res, { stats });
  } catch (e) { next(e); }
}

export async function updatePreferences(req, res, next) {
  try {
    const dailyGoalLessons = Number(req.body?.dailyGoalLessons);
    if (!Number.isInteger(dailyGoalLessons) || dailyGoalLessons < 1 || dailyGoalLessons > 20) {
      return failure(res, "Daily goal must be a whole number between 1 and 20 lessons.", 400);
    }
    const stats = await service.updateLearningPreferences(req.user.userId, { dailyGoalLessons });
    return success(res, { stats }, "Learning goal updated");
  } catch (e) { next(e); }
}
