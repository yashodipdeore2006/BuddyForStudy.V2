/**
 * Gemini 3.8 Flash does not accept the MINIMAL thinking level.
 * Keep existing model defaults for other models, but safely downgrade this
 * one unsupported request level before sending a provider request.
 */
export function resolveGeminiThinkingLevel(model, requestedLevel = "LOW") {
  const modelId = String(model || "").trim().toLowerCase();
  const level = String(requestedLevel || "LOW").trim().toUpperCase();
  if (level === "MINIMAL" && /^gemini-3\.8-flash(?:-|$)/.test(modelId)) {
    return "LOW";
  }
  return level;
}
