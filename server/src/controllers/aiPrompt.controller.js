import { createHash } from "node:crypto";
import { AIPromptVersion } from "../models/AIPromptVersion.js";
import { PlatformSetting } from "../models/PlatformSetting.js";
import { recordAuditEvent } from "../services/auditOutbox.service.js";
import { getActiveAIPrompt, getActivePromptSettingKey, validateUploadedPrompt } from "../services/aiPrompt.service.js";
import { AI_PROMPT_FEATURES, AI_PROMPT_FEATURE_KEYS } from "../config/aiPromptTemplates.js";
import { failure, success } from "../utils/response.js";
import { isValidObjectId } from "../utils/ids.js";

function cleanReason(value, action) {
  const reason = typeof value === "string" ? value.trim() : "";
  if (reason.length < 10 || reason.length > 500) {
    const error = new Error("A reason of 10–500 characters is required to " + action + ".");
    error.status = 400;
    throw error;
  }
  return reason;
}

function isValidFeature(feature) {
  return AI_PROMPT_FEATURE_KEYS.includes(String(feature || ""));
}

function publicVersion(version, includePrompt = false) {
  if (!version) return null;
  const result = {
    id: String(version._id),
    feature: version.feature,
    version: version.version,
    name: version.name,
    contentHash: version.contentHash,
    notes: version.notes || "",
    createdBy: version.createdBy ? String(version.createdBy) : null,
    createdAt: version.createdAt || null,
    updatedAt: version.updatedAt || null
  };
  if (includePrompt) result.prompt = version.prompt;
  return result;
}

async function writePromptAudit(req, { action, feature, version, before, after, reason }) {
  const actor = req.user?.user?._id || req.user?.userId;
  if (!actor) {
    console.error("[ai-prompt-audit] Missing actor identity; audit event was not submitted.");
    return { recorded: false, queued: false };
  }
  return recordAuditEvent({
    actor,
    action,
    targetType: "AIPromptVersion",
    targetId: version?.id || version?._id ? String(version.id || version._id) : feature,
    before: before || null,
    after: after || null,
    reason,
    ip: String(req.ip || "").slice(0, 100),
    userAgent: String(req.get?.("user-agent") || "").slice(0, 500)
  });
}

async function changeActiveVersion(req, feature, version, reason) {
  const key = getActivePromptSettingKey(feature);
  const existing = await PlatformSetting.findOne({ key }).select("value").lean();
  const beforeId = typeof existing?.value === "string" ? existing.value : "";
  const nextId = version ? String(version._id) : "";

  if (beforeId === nextId) {
    return { changed: false, beforeId, activeVersion: version ? publicVersion(version) : null };
  }

  if (version) {
    await PlatformSetting.findOneAndUpdate(
      { key },
      {
        $set: {
          value: nextId,
          description: "Active immutable prompt version for " + AI_PROMPT_FEATURES[feature].label + ".",
          isPublic: false,
          updatedBy: req.user?.user?._id || req.user?.userId
        }
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
  } else if (beforeId) {
    await PlatformSetting.deleteOne({ key });
  }

  const beforeVersion = beforeId
    ? await AIPromptVersion.findOne({ _id: beforeId, feature }).select("version name contentHash").lean()
    : null;
  const afterMeta = version ? { id: String(version._id), version: version.version, name: version.name, contentHash: version.contentHash } : { source: "built_in", name: AI_PROMPT_FEATURES[feature].defaultName };
  await writePromptAudit(req, {
    action: version ? "ai_prompt.version.activated" : "ai_prompt.built_in.activated",
    feature,
    version,
    before: beforeVersion ? { feature, version: beforeVersion.version, name: beforeVersion.name, contentHash: beforeVersion.contentHash } : { feature, source: "built_in" },
    after: { feature, ...afterMeta },
    reason
  });
  return { changed: true, beforeId, activeVersion: version ? publicVersion(version) : null };
}

export async function listPromptVersions(req, res, next) {
  try {
    const prompts = await Promise.all(AI_PROMPT_FEATURE_KEYS.map(async (feature) => {
        const [activePrompt, versions] = await Promise.all([
        getActiveAIPrompt(feature),
        AIPromptVersion.find({ feature })
          .select("feature version name contentHash notes createdBy createdAt updatedAt")
          .sort({ version: -1 })
          .lean()
      ]);
      return {
        feature,
        label: definition.label,
        description: definition.description,
        requiredPlaceholders: definition.requiredPlaceholders,
        maxLength: definition.maxLength,
        builtInDefault: {
          name: definition.defaultName,
          prompt: definition.defaultPrompt
        },
        active: activePrompt,
        versions: versions.map((version) => publicVersion(version))
      };
    }));
    res.set("Cache-Control", "no-store");
    return success(res, { prompts }, "AI prompt versions loaded");
  } catch (error) {
    next(error);
  }
}

export async function getPromptVersion(req, res, next) {
  try {
    const { feature, versionId } = req.params;
    if (!isValidFeature(feature)) return failure(res, "Unsupported AI prompt feature.", 400);
    if (!isValidObjectId(versionId)) return failure(res, "Invalid prompt version ID.", 400);
    const version = await AIPromptVersion.findOne({ _id: versionId, feature }).lean();
    if (!version) return failure(res, "Prompt version not found for this feature.", 404);
    return success(res, { version: publicVersion(version, true) }, "AI prompt version loaded");
  } catch (error) {
    next(error);
  }
}

export async function createPromptVersion(req, res, next) {
  try {
    const { feature } = req.params;
    if (!isValidFeature(feature)) return failure(res, "Unsupported AI prompt feature.", 400);
    const definition = AI_PROMPT_FEATURES[feature];
    const reason = cleanReason(req.body?.reason, "create an AI prompt version");
    const checked = validateUploadedPrompt(feature, req.body?.prompt);
    if (!checked.valid) return failure(res, checked.message, 400);

    const name = String(req.body?.name || "").trim();
    if (!name || name.length > 120) return failure(res, "Version name is required and must be 120 characters or fewer.", 400);
    const notes = String(req.body?.notes || "").trim();
    if (notes.length > 500) return failure(res, "Version notes must be 500 characters or fewer.", 400);
    if (req.body?.activate !== undefined && typeof req.body.activate !== "boolean") {
      return failure(res, "The activate field must be a boolean.", 400);
    }

    const actor = req.user?.user?._id || req.user?.userId;
    if (!actor) return failure(res, "Administrator identity could not be verified.", 401);

    let version;
    for (let attempt = 0; attempt < 4; attempt += 1) {
      const latest = await AIPromptVersion.findOne({ feature }).sort({ version: -1 }).select("version").lean();
      const nextVersion = Number(latest?.version || 0) + 1;
      try {
        version = await AIPromptVersion.create({
          feature,
          version: nextVersion,
          name,
          prompt: checked.value,
          contentHash: createHash("sha256").update(checked.value).digest("hex"),
          notes,
          createdBy: actor
        });
        break;
      } catch (error) {
        if (error?.code !== 11000 || attempt === 3) throw error;
      }
    }
    if (!version) return failure(res, "Unable to allocate a prompt version. Refresh and try again.", 409);

    await writePromptAudit(req, {
      action: "ai_prompt.version.created",
      feature,
      version,
      before: null,
      after: { feature, version: version.version, name: version.name, contentHash: version.contentHash, notes: version.notes },
      reason
    });

    let activeChanged = false;
    if (req.body?.activate === true) {
      const activated = await changeActiveVersion(req, feature, version, reason);
      activeChanged = activated.changed;
    }

    return success(res, {
      version: publicVersion(version),
      active: req.body?.activate === true ? (await getActiveAIPrompt(feature)) : null,
      activeChanged
    }, req.body?.activate === true ? "Prompt version created and activated." : "Prompt version created. The current active version was not changed.", 201);
  } catch (error) {
    if (error?.status === 400) return failure(res, error.message, 400);
    next(error);
  }
}

export async function activatePromptVersion(req, res, next) {
  try {
    const { feature } = req.params;
    if (!isValidFeature(feature)) return failure(res, "Unsupported AI prompt feature.", 400);
    const reason = cleanReason(req.body?.reason, "switch the active AI prompt");
    const versionId = req.body?.versionId;
    let version = null;
    if (versionId !== null && versionId !== undefined && versionId !== "") {
      if (!isValidObjectId(versionId)) return failure(res, "Invalid prompt version ID.", 400);
      version = await AIPromptVersion.findOne({ _id: versionId, feature });
      if (!version) return failure(res, "Prompt version not found for this feature.", 404);
    }

    const result = await changeActiveVersion(req, feature, version, reason);
    const active = await getActiveAIPrompt(feature);
    return success(res, {
      active,
      changed: result.changed
    }, version ? "Active prompt switched to version " + version.version + "." : "Built-in default prompt activated.");
  } catch (error) {
    if (error?.status === 400) return failure(res, error.message, 400);
    next(error);
  }
}
