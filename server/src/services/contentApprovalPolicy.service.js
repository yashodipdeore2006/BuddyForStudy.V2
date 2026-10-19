import { PlatformSetting } from "../models/PlatformSetting.js";

export const CONTENT_APPROVAL_POLICIES = Object.freeze({
  aiCourses: {
    key: "content_approval_ai_courses",
    label: "AI-generated and AI-assembled courses",
    description: "Controls AI roadmaps, AI-built courses, search-assembled courses, and learner-specific course copies."
  },
  userReviews: {
    key: "content_approval_user_reviews",
    label: "Learner reviews",
    description: "Controls whether new learner reviews require moderation before appearing publicly."
  },
  aiQuizzes: {
    key: "content_approval_ai_quizzes",
    label: "AI-generated quizzes",
    description: "Controls whether AI-generated practice question sets require moderation before reuse."
  },
  aiInsights: {
    key: "content_approval_ai_insights",
    label: "AI lesson insights",
    description: "Controls whether generated lesson summaries and key notes are held for moderation."
  },
  aiAnswers: {
    key: "content_approval_ai_answers",
    label: "AI Q&A answers",
    description: "Controls whether cached AI answers require moderation before they can be reused or shown."
  }
});

export const CONTENT_APPROVAL_MODES = Object.freeze(["manual", "automatic"]);

export async function getContentApprovalPolicies() {
  const definitions = Object.values(CONTENT_APPROVAL_POLICIES);
  const saved = await PlatformSetting.find({ key: { $in: definitions.map((item) => item.key) } })
    .select("key value updatedAt")
    .lean();
  const byKey = new Map(saved.map((item) => [item.key, item]));
  return Object.fromEntries(Object.entries(CONTENT_APPROVAL_POLICIES).map(([id, definition]) => {
    const setting = byKey.get(definition.key);
    const mode = CONTENT_APPROVAL_MODES.includes(setting?.value) ? setting.value : "manual";
    return [id, {
      id,
      key: definition.key,
      label: definition.label,
      description: definition.description,
      mode,
      updatedAt: setting?.updatedAt || null
    }];
  }));
}

export async function getContentApprovalMode(id) {
  const definition = CONTENT_APPROVAL_POLICIES[id];
  if (!definition) throw new Error("Unknown content approval policy: " + id);
  const setting = await PlatformSetting.findOne({ key: definition.key }).select("value").lean();
  return CONTENT_APPROVAL_MODES.includes(setting?.value) ? setting.value : "manual";
}

export async function isAutomaticContentApproval(id) {
  return (await getContentApprovalMode(id)) === "automatic";
}
