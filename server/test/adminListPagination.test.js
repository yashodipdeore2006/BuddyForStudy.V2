import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");

test("admin subscriptions use bounded server-side pagination", async () => {
  const controller = await read("../src/controllers/adminPro.controller.js");
  const section = controller.slice(controller.indexOf("export async function subscriptions"), controller.indexOf("export async function refunds"));
  assert.match(section, /\.skip\(\(page - 1\) \* limit\)\.limit\(limit\)/);
  assert.match(section, /UserSubscription\.countDocuments\(filter\)/);
  assert.match(section, /pages: Math\.max\(1, Math\.ceil\(total \/ limit\)\)/);
});

test("admin audit logs retain literal search while using server-side pagination", async () => {
  const controller = await read("../src/controllers/adminPro.controller.js");
  const section = controller.slice(controller.indexOf("export async function auditLogs"), controller.indexOf("export async function analytics"));
  assert.match(section, /q\.replace/);
  assert.match(section, /\.skip\(\(page - 1\) \* limit\)\.limit\(limit\)/);
  assert.match(section, /AuditLog\.countDocuments\(filter\)/);
});

test("support cases paginate and search safely across case descriptions and users", async () => {
  const controller = await read("../src/controllers/adminPro.controller.js");
  const section = controller.slice(controller.indexOf("export async function paymentIssues"), controller.indexOf("export async function updatePaymentIssue"));
  assert.match(section, /q\.replace/);
  assert.match(section, /User\.find\(\{ \$or: \[\{ name: searchPattern \}, \{ email: searchPattern \}\] \}\)/);
  assert.match(section, /\.skip\(\(page - 1\) \* limit\)\.limit\(limit\)/);
  assert.match(section, /PaymentIssue\.countDocuments\(filter\)/);
});

test("admin course catalogue supports bounded server-side pagination and literal search", async () => {
  const controller = await read("../src/controllers/adminPro.controller.js");
  const section = controller.slice(controller.indexOf("export async function courses"), controller.indexOf("function adminActorId"));
  assert.match(section, /escapeRegex\(q\)/);
  assert.match(section, /\.skip\(\(page - 1\) \* limit\)\.limit\(limit\)/);
  assert.match(section, /Course\.countDocuments\(filter\)/);
  assert.match(section, /pages: Math\.max\(1, Math\.ceil\(total \/ limit\)\)/);
});


test("admin payments are searchable and use bounded server-side pagination with global finance metrics", async () => {
  const controller = await read("../src/controllers/adminPro.controller.js");
  const section = controller.slice(controller.indexOf("export async function payments"), controller.indexOf("export async function subscriptions"));
  assert.match(section, /escapeRegex\(q\)/);
  assert.match(section, /\.skip\(\(page - 1\) \* limit\)\.limit\(limit\)/);
  assert.match(section, /Payment\.countDocuments\(filter\)/);
  assert.match(section, /paidTotal: Number\(paidValue\[0\]\?\.total \|\| 0\)/);
});

test("admin refunds are searchable and use bounded server-side pagination with status summaries", async () => {
  const controller = await read("../src/controllers/adminPro.controller.js");
  const section = controller.slice(controller.indexOf("export async function refunds"), controller.indexOf("export async function updateRefund"));
  assert.match(section, /escapeRegex\(q\)/);
  assert.match(section, /\.skip\(\(page - 1\) \* limit\)\.limit\(limit\)/);
  assert.match(section, /RefundRequest\.countDocuments\(filter\)/);
  assert.match(section, /summary/);
});

test("notification deliveries support bounded server pagination and literal search", async () => {
  const controller = await read("../src/controllers/adminPro.controller.js");
  const section = controller.slice(controller.indexOf("export async function notificationDeliveries"), controller.indexOf("export async function deliveryLog"));
  assert.ok(section.includes("escapeRegex(q)"));
  assert.ok(section.includes("Notification.countDocuments(filter)"));
  assert.ok(section.includes(".skip((page - 1) * limit).limit(limit)"));
  assert.ok(section.includes("pages: Math.max(1, Math.ceil(total / limit))"));
});

test("announcement campaigns support bounded pagination, status filters and literal search", async () => {
  const controller = await read("../src/controllers/adminPro.controller.js");
  const section = controller.slice(controller.indexOf("export async function listAnnouncements"), controller.indexOf("export async function cancelAnnouncement"));
  assert.ok(section.includes("escapeRegex(q)"));
  assert.ok(section.includes("Announcement.countDocuments(filter)"));
  assert.ok(section.includes(".skip((page - 1) * limit).limit(limit)"));
  assert.ok(section.includes("filter.status"));
});
