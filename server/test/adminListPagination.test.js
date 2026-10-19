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
