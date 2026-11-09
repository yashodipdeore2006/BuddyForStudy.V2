const BRAND = {
  ink: "#1A1B41",
  inkDeep: "#12132f",
  accent: "#8B5CF6",
  canvas: "#f5f6fb",
  text: "#292a40",
  muted: "#666980",
  line: "#e5e7ef",
  white: "#ffffff"
};

export function escapeEmailHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[character]);
}

function extractEmailContent(value) {
  const html = String(value || "");
  const body = html.match(/<body\\b[^>]*>([\\s\\S]*?)<\\/body>/i);
  return (body ? body[1] : html)
    .replace(/<!doctype[^>]*>/gi, "")
    .replace(/<html\\b[^>]*>|<\\/html>/gi, "")
    .replace(/<head\\b[^>]*>[\\s\\S]*?<\\/head>/gi, "")
    .trim();
}

export function emailHtmlToText(value) {
  return String(value || "")
    .replace(/<style\\b[^>]*>[\\s\\S]*?<\\/style>/gi, " ")
    .replace(/<script\\b[^>]*>[\\s\\S]*?<\\/script>/gi, " ")
    .replace(/<\\/(p|div|h[1-6]|tr|li|table)>/gi, "\\n")
    .replace(/<br\\s*\\/?\\s*>/gi, "\\n")
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&#(\\d+);/g, (_match, code) => String.fromCodePoint(Number(code)))
    .replace(/\\s+/g, " ")
    .trim();
}

/**
 * Wrap a trusted, already-sanitized message fragment in the BuddyForStudy
 * email shell. The layout uses tables and inline styles for email-client
 * compatibility; all dynamic text/URLs must be escaped by the caller.
 */
export function renderBrandedEmail({
  contentHtml,
  preheader = "An update from BuddyForStudy",
  appUrl = "https://buddyforstudy.in",
  footerNote = "You are receiving this email because of activity on your BuddyForStudy account."
} = {}) {
  const safeAppUrl = escapeEmailHtml(String(appUrl || "https://buddyforstudy.in").replace(/\\/$/, ""));
  const safePreheader = escapeEmailHtml(preheader);
  const safeFooter = escapeEmailHtml(footerNote);
  const content = extractEmailContent(contentHtml);
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="color-scheme" content="light">
  <title>BuddyForStudy</title>
</head>
<body style="margin:0;padding:0;background-color:${BRAND.canvas};font-family:Arial,Helvetica,sans-serif;color:${BRAND.text};">
  <div style="display:none!important;visibility:hidden;opacity:0;color:transparent;height:0;width:0;overflow:hidden;mso-hide:all;">${safePreheader}</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:${BRAND.canvas};margin:0;padding:32px 12px;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;background-color:${BRAND.white};border:1px solid ${BRAND.line};border-radius:18px;overflow:hidden;">
        <tr><td style="height:6px;background-color:${BRAND.accent};font-size:0;line-height:0;">&nbsp;</td></tr>
        <tr><td style="padding:26px 32px 22px;background-color:${BRAND.ink};">
          <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
            <td valign="middle" style="width:38px;height:38px;border-radius:11px;background-color:${BRAND.accent};color:#ffffff;text-align:center;font-size:20px;font-weight:800;">B</td>
            <td valign="middle" style="padding-left:12px;color:#ffffff;font-size:19px;font-weight:700;letter-spacing:-.3px;">BuddyForStudy</td>
          </tr></table>
          <p style="margin:13px 0 0;color:#d9d9ed;font-size:12px;line-height:1.5;letter-spacing:1.2px;text-transform:uppercase;">Your learning companion</p>
        </td></tr>
        <tr><td style="padding:34px 32px 30px;font-size:15px;line-height:1.7;color:${BRAND.text};">
          ${content}
        </td></tr>
        <tr><td style="padding:22px 32px 26px;border-top:1px solid ${BRAND.line};background-color:#fbfbfe;">
          <p style="margin:0 0 8px;color:${BRAND.ink};font-size:13px;font-weight:700;">BuddyForStudy</p>
          <p style="margin:0 0 12px;color:${BRAND.muted};font-size:12px;line-height:1.6;">${safeFooter}</p>
          <p style="margin:0;color:${BRAND.muted};font-size:12px;"><a href="${safeAppUrl}" style="color:${BRAND.ink};font-weight:700;text-decoration:underline;">Visit BuddyForStudy</a></p>
        </td></tr>
      </table>
      <p style="margin:18px 0 0;color:#8588a0;font-size:11px;line-height:1.5;text-align:center;">© ${new Date().getFullYear()} BuddyForStudy. All rights reserved.</p>
    </td></tr>
  </table>
</body>
</html>`;
}
