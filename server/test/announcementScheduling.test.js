import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");

test("announcement model has scheduled lifecycle, cancellation metadata and channel reports", async () => {
  const model = await read("../src/models/Announcement.js");
  assert.match(model, /enum: \["draft", "scheduled", "sending", "sent", "failed", "cancelled"\]/);
  for (const field of ["scheduledAt", "startedAt", "sentAt", "cancelledAt", "cancelledBy", "recipientIds", "nextRecipientIndex", "batchLockUntil", "nextBatchAt", "lastBatchAt"]) {
    assert.match(model, new RegExp(field + ":"));
  }
  for (const field of ["total", "sent", "pending", "failed", "skipped", "in_app", "email", "push"]) assert.match(model, new RegExp(field + ":"));
});

test("audience preview masks sample emails and reports channel reach after preferences and provider checks", async () => {
  const controller = await read("../src/controllers/adminPro.controller.js");
  const prefs = await read("../src/models/NotificationPreference.js");
  assert.match(controller, /export async function previewNotificationAudience/);
  assert.match(controller, /emailAnnouncements === true && Boolean\(p\.emailAnnouncementsConsentAt\)/);
  assert.match(controller, /pushEnabled === true/);
  assert.match(controller, /PushSubscription\.distinct\("user"/);
  assert.match(controller, /channelCounts/);
  assert.match(controller, /selectedChannels = parseAnnouncementChannels\(audienceInput\.channels\)/);
  assert.match(controller, /selected: !selectedChannels \|\| selectedChannels\.includes\("email"\)/);
  assert.match(controller, /email: maskEmail\(user\.email\)/);
  const communications = await read("../../src/pages/admin/AdminCommunications.tsx");
  assert.match(communications, /Not selected/);
  assert.match(communications, /channels \}\s*:\s*\{\}/);
  assert.match(prefs, /emailAnnouncementsConsentAt: \{ type: Date, default: null \}/);
  assert.match(prefs, /pushEnabled: \{ type: Boolean, default: false \}/);
});

test("announcements require a preview token and reason, then queue or schedule instead of sending in the request", async () => {
  const controller = await read("../src/controllers/adminPro.controller.js");
  const worker = await read("../src/jobs/worker.js");
  const service = await read("../src/services/announcement.service.js");
  const notificationService = await read("../src/services/notification.service.js");
  const send = controller.slice(controller.indexOf("export async function sendAnnouncement"), controller.indexOf("export async function listAnnouncements"));
  assert.match(send, /reason\.length < 10/);
  assert.match(send, /verifyAdminAudiencePreviewToken/);
  assert.match(send, /status = scheduledAt \? "scheduled" : "sending"/);
  assert.match(send, /Announcement\.create/);
  assert.doesNotMatch(send, /createNotificationEvent/);
  assert.match(worker, /setInterval\(\(\) => void runAnnouncementBatches\(\), 30 \* 1000\)/);
  assert.match(worker, /processScheduledAnnouncements\(new Date\(\), 1, 100\)/);
  assert.match(worker, /await deliverPendingNotificationEmails\(100\)/);
  assert.match(worker, /await deliverPendingNotificationPush\(100\)/);
  assert.match(worker, /for \(let batch = 0; batch < 5; batch \+= 1\)/);
  assert.match(worker, /processScheduledAnnouncements\(new Date\(\), 1, 100\)/);
  assert.match(worker, /Drain each newly queued batch before claiming more recipients/);
  assert.match(service, /eventKey: "announcement:" \+ announcement\._id \+ ":" \+ userId/);
  assert.match(service, /deferDispatch: true/);
  assert.match(service, /batchLockToken/);
  assert.match(service, /nextBatchAt/);
  assert.match(service, /const finished = stats\.pending === 0/);
  assert.match(service, /status: finished \? \(stats\.failed > 0 \? "failed" : "sent"\) : "sending"/);
  assert.match(service, /new Date\(now\.getTime\(\) \+ 30 \* 1000\)/);
  assert.match(notificationService, /explicitAnnouncementConsent/);
  assert.match(notificationService, /preferences\.emailAnnouncementsConsentAt/);
  assert.match(notificationService, /requestedChannels:/);
});

test("scheduled announcements can be cancelled only before the worker starts and reports refresh channel statistics", async () => {
  const controller = await read("../src/controllers/adminPro.controller.js");
  const service = await read("../src/services/announcement.service.js");
  const cancel = controller.slice(controller.indexOf("export async function cancelAnnouncement"), controller.indexOf("export async function announcementReport"));
  assert.match(cancel, /status: \{ \$in: \["draft", "scheduled"\] \}/);
  assert.match(cancel, /announcement\.cancelled/);
  assert.match(cancel, /reason/);
  assert.match(controller, /export async function announcementReport/);
  assert.match(service, /refreshAnnouncementStats/);
  assert.match(service, /email_pending/);
  assert.match(service, /push_failed/);
  assert.ok(service.includes("pending: { $sum: { $cond: [any(pendingConditions), 1, 0] } }"), "pending channel attempts must count even if another channel was accepted");
  assert.match(service, /announcement\.status === "cancelled"/);
  assert.match(service, /announcement\.status === "failed" \? unprocessed : 0/);
});

test("delivery log is paginated, masks recipients and retries only failed channel attempts with a reason", async () => {
  const controller = await read("../src/controllers/adminPro.controller.js");
  const routes = await read("../src/routes/adminPro.routes.js");
  const page = await read("../../src/pages/admin/AdminDeliveries.tsx");
  assert.match(controller, /export async function deliveryLog/);
  assert.match(controller, /email: maskEmail\(item\.user\.email\)/);
  assert.match(controller, /export async function retryDeliveryLog/);
  assert.match(controller, /Only failed deliveries can be retried from the delivery log/);
  assert.match(controller, /reason\.length < 10/);
  assert.match(routes, /router\.get\("\/deliveries", adminPermissionMiddleware\("notifications\.read"\)/);
  assert.match(routes, /router\.post\("\/deliveries\/:notificationId\/retry", adminPermissionMiddleware\("notifications\.retry"\)/);
  for (const token of ["recipient", "eventKey", "dateFrom", "dateTo", "Retry "]) assert.ok(page.includes(token), "missing delivery-log feature " + token);
  assert.match(page, /Sent = provider accepted/);
  const retry = (await read("../src/services/notification.service.js")).split("export async function retryNotificationDelivery")[1].split("export async function createNotificationEvent")[0];
  assert.match(retry, /findOneAndUpdate/);
  assert.match(retry, /queued: true/);
  assert.match(retry, /status: "pending"/);
  assert.doesNotMatch(retry, /dispatchEmail|dispatchPush/);
});

test("template preview validates placeholders and test send targets only the signed-in administrator with audit reason", async () => {
  const controller = await read("../src/controllers/messageTemplate.controller.js");
  const routes = await read("../src/routes/adminPro.routes.js");
  const page = await read("../../src/pages/admin/AdminCommunications.tsx");
  assert.match(controller, /export async function previewMessageTemplate/);
  assert.match(controller, /unknownPlaceholders/);
  assert.match(controller, /export async function testSendMessageTemplate/);
  assert.match(controller, /reason\.length < 10/);
  assert.match(controller, /User\.findById\(actorId\)/);
  assert.match(controller, /to: actor\.email/);
  assert.match(controller, /destination: "signed-in administrator"/);
  assert.match(controller, /Template keys are immutable after creation/);
  assert.match(controller, /findUnknownTemplatePlaceholders\(parsed\.value\)/);
  assert.match(controller, /Unsupported template placeholders/);
  assert.match(controller, /getTemplateUsage/);
  assert.match(controller, /hasUnsafeEmailMarkup\(preview\.body\)/);
  assert.match(routes, /router\.post\("\/message-templates\/preview", adminPermissionMiddleware\("communications\.manage"\)/);
  assert.match(routes, /router\.post\("\/message-templates\/:templateId\/test-send", adminPermissionMiddleware\("communications\.manage"\)/);
  assert.match(page, /Placeholder picker/);
  assert.match(page, /Rendered sample preview/);
  assert.match(page, /Send test to me/);
  assert.match(page, /Used by/);
});

test("new notification permissions are catalogued and used at route boundaries", async () => {
  const rbac = await read("../src/utils/adminRbac.js");
  const routes = await read("../src/routes/adminPro.routes.js");
  assert.match(rbac, /"notifications\.read", "notifications\.retry"/);
  assert.match(routes, /adminPermissionMiddleware\("notifications\.read"\)/);
  assert.match(routes, /adminPermissionMiddleware\("notifications\.retry"\)/);
});
