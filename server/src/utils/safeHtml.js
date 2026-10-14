const UNSAFE_TAG = /<\s*\/?\s*(?:script|iframe|object|embed|svg|math|form|input|button|meta|base|link|video|audio|style)\b/i;
const UNSAFE_EVENT_ATTRIBUTE = /\son[a-z][a-z0-9:_-]*\s*=/i;
const UNSAFE_URL_ATTRIBUTE = /\b(?:href|src|action|formaction|xlink:href)\s*=\s*(?:"\s*|'\s*|)\s*(?:javascript|vbscript)\s*:/i;
const UNSAFE_EMBEDDED_CONTENT = /\bsrcdoc\s*=|data\s*:\s*text\/html|expression\s*\(|url\s*\(\s*["']?\s*(?:javascript|vbscript)|@import/i;

export function hasUnsafeEmailMarkup(markup) {
  const source = String(markup || "");
  return UNSAFE_TAG.test(source) ||
    UNSAFE_EVENT_ATTRIBUTE.test(source) ||
    UNSAFE_URL_ATTRIBUTE.test(source) ||
    UNSAFE_EMBEDDED_CONTENT.test(source);
}
