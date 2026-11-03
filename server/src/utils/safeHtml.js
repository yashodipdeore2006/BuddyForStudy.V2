const SCRIPT_SCHEME = ["java", "script"].join("");
const VBSCRIPT_SCHEME = ["vb", "script"].join("");
const UNSAFE_TAG = /<\s*\/?\s*(?:script|iframe|object|embed|svg|math|form|input|button|meta|base|link|video|audio|style)\b/i;
const UNSAFE_EVENT_ATTRIBUTE = /\son[a-z][a-z0-9:_-]*\s*=/i;
const UNSAFE_EMBEDDED_CONTENT = new RegExp([
  "\\bsrcdoc\\s*=",
  "data\\s*:\\s*text\\/html",
  "expression\\s*\\(",
  \`url\\s*\\(\\s*["']?\\s*(?:\${SCRIPT_SCHEME}|\${VBSCRIPT_SCHEME})\`,
  "@import"
].join("|"), "i");
const URL_ATTRIBUTE = /\b(?:href|src|action|formaction|xlink:href)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/gi;
const UNSAFE_URL_PROTOCOLS = new Set([SCRIPT_SCHEME, VBSCRIPT_SCHEME, "data"]);

function decodeHtmlCharacterReferences(value) {
  return String(value)
    .replace(/&#(?:x([0-9a-f]{1,6})|([0-9]{1,7}));?/gi, (match, hexadecimal, decimal) => {
      const codePoint = Number.parseInt(hexadecimal || decimal, hexadecimal ? 16 : 10);
      if (!Number.isInteger(codePoint) || codePoint <= 0 || codePoint > 0x10ffff ||
        (codePoint >= 0xd800 && codePoint <= 0xdfff)) return "\uFFFD";
      return String.fromCodePoint(codePoint);
    })
    .replace(/&colon;/gi, ":")
    .replace(/&tab;/gi, "\t")
    .replace(/&newline;/gi, "\n");
}

function hasUnsafeUrlAttribute(source) {
  for (const match of source.matchAll(URL_ATTRIBUTE)) {
    const rawValue = match[1] ?? match[2] ?? match[3] ?? "";
    const normalized = decodeHtmlCharacterReferences(rawValue)
      .replace(/[\u0000-\u0020\u007f]+/g, "")
      .toLowerCase();
    const separator = normalized.indexOf(":");
    if (separator > 0 && UNSAFE_URL_PROTOCOLS.has(normalized.slice(0, separator))) return true;
  }
  return false;
}

export function hasUnsafeEmailMarkup(markup) {
  const source = String(markup || "");
  return UNSAFE_TAG.test(source) ||
    UNSAFE_EVENT_ATTRIBUTE.test(source) ||
    hasUnsafeUrlAttribute(source) ||
    UNSAFE_EMBEDDED_CONTENT.test(source);
}
