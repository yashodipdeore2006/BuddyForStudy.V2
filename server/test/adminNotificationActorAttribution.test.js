import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");

function section(source, startMarker, endMarker) {
  const start = source.indexOf(startMarker);
  assert.notEqual(start, -1, `missing section start: ${startMarker}`);
  const end = source.indexOf(endMarker, start + startMarker.length);
  assert.notEqual(end, -1, `missing section end: ${endMarker}`);
  return source.slice(start, end);
}

test("admin notification and email campaigns bind each recipient event to the authenticated initiator", async () => {
  const controller = await read("../src/controllers/adminPro.controller.js");
  const sendNotification = section(
    controller,
    "export async function sendNotification",
    "export async function sendEmail"
  );
  const sendEmail = section(
    controller,
    "export async function sendEmail",
    "export async function sendAnnouncement"
  );

  for (const [name, handler, eventPrefix, sourceName] of [
    ["notification", sendNotification, "admin-notification", "admin-broadcast"],
    ["email", sendEmail, "admin-email-campaign", "admin-email-campaign"]
  ]) {
    assert.match(handler, /verifyAdminAudiencePreviewToken/);
    assert.match(handler, /userId: String\(user\._id\)/);
    assert.ok(handler.includes("eventKey: `" + eventPrefix + ":"));
    assert.match(handler, new RegExp(`source: "${sourceName}"`));
    assert.match(handler, /initiatedBy: String\(req\.user\.user\._id\)/);
    assert.doesNotMatch(handler, /initiatedBy:\s*req\.body|actorId:\s*req\.body|sentBy:\s*req\.body/i);
    assert.ok(
      handler.indexOf("verifyAdminAudiencePreviewToken") < handler.indexOf("createNotificationEvent"),
      `${name} campaign must validate the signed audience before creating recipient notifications`
    );
    assert.match(handler, /audit\(req,/);
  }
});

test("scheduled announcement worker preserves creator attribution and recipient-level idempotency", async () => {
  const controller = await read("../src/controllers/adminPro.controller.js");
  const model = await read("../src/models/Announcement.js");
  const worker = await read("../src/services/announcement.service.js");

  const send = section(
    controller,
    "export async function sendAnnouncement",
    "export async function listAnnouncements"
  );
  assert.match(send, /createdBy: req\.user\.user\._id/);
  assert.doesNotMatch(send, /createdBy:\s*req\.body/);
  assert.match(send, /audit\(req, scheduledAt \? "announcement\.scheduled" : "announcement\.send"/);
  assert.match(model, /createdBy: \{ type: mongoose\.Schema\.Types\.ObjectId, ref: "User", required: true \}/);

  assert.match(worker, /userId: String\(userId\)/);
  assert.match(worker, /eventKey: "announcement:" \+ announcement\._id \+ ":" \+ userId/);
  assert.match(worker, /initiatedBy: String\(announcement\.createdBy\)/);
  assert.match(worker, /deferDispatch: true/);
  assert.match(worker, /batchLockToken/);
  assert.match(worker, /nextRecipientIndex: start/);
});

test("both administrative manual-retry routes pass the signed-in actor and audit the queued retry", async () => {
  const controller = await read("../src/controllers/adminPro.controller.js");
  const service = await read("../src/services/notification.service.js");
  const model = await read("../src/models/Notification.js");

  const retryDeliveries = section(
    controller,
    "export async function retryNotificationDeliveryAdmin",
    "export async function notificationDeliveries"
  );
  const retryDeliveryLog = section(
    controller,
    "export async function retryDeliveryLog",
    "export async function payments"
  );
  for (const [name, handler] of [
    ["notification delivery", retryDeliveries],
    ["communications delivery log", retryDeliveryLog]
  ]) {
    assert.match(handler, /Only failed deliveries can be retried/);
    assert.match(handler, /reason\.length < 10/);
    assert.match(handler, /retryNotificationDelivery\(/);
    assert.match(handler, /actorId:\s*req\.user(?:\?\.user\?\._id\s*\|\|\s*req\.user\?\.userId\s*\|\|\s*null|\.user\._id)/);
    assert.match(handler, /audit\(req, "notification\.delivery\.retried"/);
    assert.ok(handler.indexOf("retryNotificationDelivery(") < handler.indexOf("audit(req,"), `${name} must audit only after a retry was successfully claimed`);
  }

  const retryPipeline = section(
    service,
    "export function buildManualNotificationRetryPipeline",
    "export async function retryNotificationDelivery"
  );
  assert.match(retryPipeline, /actorId: \{ \$literal: actorId \|\| null \}/);
  assert.match(retryPipeline, /reason: \{ \$literal: String\(reason \|\| ""\)\.slice\(0, 500\) \}/);
  assert.match(model, /actorId: \{ type: mongoose\.Schema\.Types\.ObjectId, ref: "User", default: null \}/);
  assert.match(model, /reason: \{ type: String, maxlength: 500, default: "" \}/);
});

test("operational admin alerts require active recipients with the requested permission and deduplicate per administrator", async () => {
  const service = await read("../src/services/notification.service.js");
  const routing = await read("../src/utils/adminNotificationRouting.js");
  const start = service.indexOf("export async function notifyActiveAdmins");
  assert.notEqual(start, -1);
  const notify = service.slice(start, service.indexOf("\n}", start) + 2);

  assert.match(notify, /User\.find\(\{ role: "admin", isActive: true \}\)/);
  assert.match(notify, /selectAdminNotificationRecipients\(admins, requiredPermission\)/);
  assert.match(notify, /admin-alert:\$\{eventKey\}:\$\{String\(admin\._id\)\}/);
  assert.match(notify, /requiredPermission/);
  assert.match(notify, /Promise\.allSettled/);
  assert.match(routing, /hasAdminPermission\(/);
  assert.match(routing, /admin\.adminPermissionOverrides \|\| \[\]/);
});

test("payment-support notifications remain linked to an actor-attributed state change", async () => {
  const controller = await read("../src/controllers/adminPro.controller.js");
  const updateIssue = section(
    controller,
    "export async function updatePaymentIssue",
    "\n}"
  );
  assert.match(updateIssue, /resolvedBy: nowResolved \? \(currentIssue\.resolvedBy \|\| req\.user\.user\?\._id \|\| req\.user\.userId\)/);
  assert.match(updateIssue, /author: req\.user\.user\?\._id \|\| req\.user\.userId/);
  assert.match(updateIssue, /audit\(req, "payment_issue\.updated"/);
  assert.match(updateIssue, /userId: String\(issue\.user\)/);
  assert.match(updateIssue, /eventKey: `payment-issue-status:/);
  assert.doesNotMatch(updateIssue, /resolvedBy:\s*req\.body|author:\s*req\.body/i);
});
