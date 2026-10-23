import { PlatformSetting } from "../models/PlatformSetting.js";
import { AIPromptVersion } from "../models/AIPromptVersion.js";
import { AI_PROMPT_FEATURES, renderPromptTemplate, validatePromptTemplate } from "../config/aiPromptTemplates.js";

export function getActivePromptSettingKey(feature) {
  if (!AI_PROMPT_FEATURES[feature]) throw new Error("Unsupported AI prompt feature: " + feature);
  return "ai_prompt_active_version_" + feature;
}

export async function getActiveAIPrompt(feature) {
  const definition = AI_PROMPT_FEATURES[feature];
  if (!definition) throw new Error("Unsupported AI prompt feature: " + feature);

  const activeSetting = await PlatformSetting.findOne({ key: getActivePromptSettingKey(feature) }).select("value").lean();
  const activeId = typeof activeSetting?.value === "string" ? activeSetting.value : "";
  if (activeId) {
    const version = await AIPromptVersion.findOne({ _id: activeId, feature }).lean();
    if (version) {
      return {
        feature,
        source: "version",
        versionId: String(version._id),
        version: version.version,
        name: version.name,
        prompt: version.prompt,
        contentHash: version.contentHash,
        createdAt: version.createdAt || null
      };
    }
  }

  return {
    feature,
    source: "built_in",
    versionId: null,
    version: null,
    name: definition.defaultName,
    prompt: definition.defaultPrompt,
    contentHash: "built_in_default",
    createdAt: null
  };
}

export function renderActivePrompt(activePrompt, values) {
  return renderPromptTemplate(activePrompt?.prompt, values);
}

export function validateUploadedPrompt(feature, prompt) {
  return validatePromptTemplate(feature, prompt);
}
