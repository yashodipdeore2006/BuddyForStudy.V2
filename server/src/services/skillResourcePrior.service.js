import { CourseCurationFeedback } from "../models/CourseCurationFeedback.js";
import { SkillResourcePrior } from "../models/SkillResourcePrior.js";

const POSITIVE_EVENTS = ["helpful", "completed", "thumbs_up", "save", "enroll"];
const NEGATIVE_EVENTS = ["outdated", "wrong_level", "abandoned", "thumbs_down", "report"];

export async function rebuildSkillPriors({ feedbackModel = CourseCurationFeedback, priorModel = SkillResourcePrior, now = new Date() } = {}) {
  const rows = await feedbackModel.aggregate([
    { $match: { skillId: { $type: "string", $ne: "" }, resourceId: { $type: "string", $ne: "" }, event: { $in: [...POSITIVE_EVENTS, ...NEGATIVE_EVENTS] } } },
    { $group: {
      _id: { skillId: "$skillId", videoId: "$resourceId" },
      positive: { $sum: { $cond: [{ $in: ["$event", POSITIVE_EVENTS] }, 1, 0] } },
      negative: { $sum: { $cond: [{ $in: ["$event", NEGATIVE_EVENTS] }, 1, 0] } },
      n: { $sum: 1 }
    } }
  ]);
  const operations = rows.map((row) => {
    const positive = Math.max(0, Number(row.positive) || 0);
    const negative = Math.max(0, Number(row.negative) || 0);
    const n = Math.max(0, Number(row.n) || positive + negative);
    const score = n ? Math.max(-1, Math.min(1, (positive - negative) / n)) : 0;
    return { updateOne: {
      filter: { canonicalSkillId: row._id.skillId, videoId: row._id.videoId },
      update: { $set: { score, n, updatedAt: now } },
      upsert: true
    } };
  });
  if (operations.length) await priorModel.bulkWrite(operations, { ordered: false });
  return { rebuilt: operations.length, updatedAt: now };
}

export async function loadSkillResourcePriors(skillId, videoIds, { priorModel = SkillResourcePrior } = {}) {
  if (!skillId || !Array.isArray(videoIds) || !videoIds.length) return new Map();
  const rows = await priorModel.find({ canonicalSkillId: String(skillId), videoId: { $in: [...new Set(videoIds.map(String))] }, n: { $gte: 5 } }).lean();
  return new Map(rows.map((row) => [String(row.videoId), row]));
}
