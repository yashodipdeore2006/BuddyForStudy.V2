const DEFAULT_MAX_SERIALIZED_LENGTH = 20000;

function safeLabel(value) {
  const label = String(value || "input").toLowerCase().replace(/[^a-z0-9_-]/g, "_").slice(0, 48);
  return label || "input";
}

/**
 * Serializes external/user/resource content as inert data for an LLM prompt.
 * JSON quoting prevents newline/quote breakout; escaping angle brackets prevents
 * data from closing the surrounding trust-boundary marker.
 */
export function serializeUntrustedPromptData(label, value, maxLength = DEFAULT_MAX_SERIALIZED_LENGTH) {
  const limit = Math.max(100, Math.min(100000, Number(maxLength) || DEFAULT_MAX_SERIALIZED_LENGTH));
  let serialized;
  try {
    serialized = JSON.stringify(value === undefined ? null : value);
  } catch {
    serialized = JSON.stringify(String(value));
  }
  if (typeof serialized !== "string") serialized = "null";
  if (serialized.length > limit) {
    serialized = JSON.stringify(serialized.slice(0, limit) + " [TRUNCATED]");
  }
  const inert = serialized.replace(/[<>&]/g, (character) => {
    if (character === "<") return "\\u003c";
    if (character === ">") return "\\u003e";
    return "\\u0026";
  });
  return `<untrusted_data label="${safeLabel(label)}">${inert}</untrusted_data>`;
}
