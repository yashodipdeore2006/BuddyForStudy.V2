import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = await readFile(new URL("../src/controllers/adminPro.controller.js", import.meta.url), "utf8");

function functionSource(name) {
  const start = source.indexOf(`export async function ${name}`);
  assert.notEqual(start, -1, `missing controller function ${name}`);
  const end = source.indexOf("\nexport async function ", start + 1);
  return source.slice(start, end < 0 ? source.length : end);
}

test("campaign preview is dry-run only and returns channel counts plus a signed preview token", () => {
  const preview = functionSource("previewNotificationAudience");
  assert.match(preview, /channelCounts/);
  assert.match(preview, /previewToken: createAdminAudiencePreviewToken\(audienceInput, users\)/);
  assert.match(preview, /Audience preview ready/);
  assert.doesNotMatch(preview, /createNotificationEvent\(/);
});

test("announcement send requires a reason and the exact previewed recipient set before persistence", () => {
  const send = functionSource("sendAnnouncement");
  assert.match(send, /reason\.length < 10 \|\| reason\.length > 500/);
  assert.match(send, /verifyAdminAudiencePreviewToken\(req\.body\.previewToken, req\.body, users\)/);
  assert.ok(send.indexOf("verifyAdminAudiencePreviewToken") < send.indexOf("Announcement.create"));
  assert.match(send, /announcement\.send/);
});

test("email campaign send requires registered users, consent-aware notification delivery and a matching preview", () => {
  const send = functionSource("sendEmail");
  assert.match(send, /Campaign email can only be sent to registered users/);
  assert.match(send, /verifyAdminAudiencePreviewToken\(req\.body\.previewToken, audienceInput, users\)/);
  assert.match(send, /type: "promotion"/);
  assert.match(send, /email: true/);
  assert.match(send, /inApp: false/);
  assert.match(send, /audit\(req, "email\.queued"/);
});
