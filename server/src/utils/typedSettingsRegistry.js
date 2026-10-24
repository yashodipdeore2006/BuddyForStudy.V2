const definitions = [
  { key: "content_approval_ai_courses", type: "enum", options: ["manual", "automatic"], description: "Approval and publication policy for AI-generated and AI-assembled courses." },
  { key: "content_approval_user_reviews", type: "enum", options: ["manual", "automatic"], description: "Moderation policy for new learner reviews." },
  { key: "content_approval_ai_quizzes", type: "enum", options: ["manual", "automatic"], description: "Moderation policy for AI-generated practice quiz sets." },
  { key: "content_approval_ai_insights", type: "enum", options: ["manual", "automatic"], description: "Moderation policy for AI-generated lesson insights." },
  { key: "content_approval_ai_answers", type: "enum", options: ["manual", "automatic"], description: "Moderation policy for cached AI Q&A answers." },
  { key: "advanced_ai_questions_per_hour_video", type: "number", description: "Question budget per video hour.", minimum: 1, maximum: 100 },
  { key: "advanced_ai_questions_unknown_duration", type: "number", description: "Question budget when video duration is unknown.", minimum: 1, maximum: 100 },
  { key: "advanced_ai_max_questions_per_lesson", type: "number", description: "Hard question limit per lesson.", minimum: 1, maximum: 200 },
  { key: "advanced_ai_summary_enabled", type: "boolean", description: "Enable lesson summaries." },
  { key: "advanced_ai_qa_enabled", type: "boolean", description: "Enable lesson Q&A." },
  { key: "notification_email_enabled", type: "boolean", description: "Global email delivery switch." },
  { key: "notification_in_app_enabled", type: "boolean", description: "Global in-app notification switch." },
  { key: "notification_push_enabled", type: "boolean", description: "Global push delivery switch." },
  { key: "learning_reminders_enabled", type: "boolean", description: "Enable scheduled learning reminders." },
  { key: "learning_reminder_inactive_days", type: "number", description: "Inactive days before a learning reminder.", minimum: 1, maximum: 30 },
  { key: "subscription_expiry_reminders_enabled", type: "boolean", description: "Enable subscription expiry reminders." },
  { key: "subscription_expiry_reminder_days", type: "number", description: "Days before expiry to send a reminder.", minimum: 1, maximum: 14 },
  { key: "notification_email_retry_attempts", type: "number", description: "Maximum email retry attempts.", minimum: 1, maximum: 10 },
  { key: "notification_push_retry_attempts", type: "number", description: "Maximum push retry attempts.", minimum: 1, maximum: 6 }
];
const registry = new Map(definitions.map((definition) => [definition.key, Object.freeze(definition)]));
export function getTypedSettingsRegistry() { return definitions.map((definition) => ({ ...definition })); }
export function validateTypedSetting(key, value) {
  const definition = registry.get(String(key || ""));
  if (!definition) return { valid: true };
  if (definition.type === "number") {
    if (typeof value !== "number" || !Number.isFinite(value) || !Number.isInteger(value)) return { valid: false, message: `Setting ${key} must be an integer.` };
    if (value < definition.minimum || value > definition.maximum) return { valid: false, message: `Setting ${key} must be between ${definition.minimum} and ${definition.maximum}.` };
  } else if (definition.type === "boolean" && typeof value !== "boolean") {
    return { valid: false, message: `Setting ${key} must be a boolean.` };
  } else if (definition.type === "enum" && !definition.options.includes(value)) {
    return { valid: false, message: `Setting ${key} must be one of: ${definition.options.join(", ")}.` };
  }
  return { valid: true };
}
