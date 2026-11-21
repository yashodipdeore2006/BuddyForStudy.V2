import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import ts from "typescript";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const source = fs.readFileSync(path.join(root, "src/lib/trialBilling.ts"), "utf8");
const js = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText;
const loadedModule = { exports: {} };
vm.runInNewContext(js, { exports: loadedModule.exports, module: loadedModule, Date, Number, String, Math }, {
  filename: "trialBilling.ts",
});
const { formatTrialRemaining, getTrialStatusLabel, isTrialCurrentlyActive } = loadedModule.exports;

test("remaining trial duration is shown as days and hours", () => {
  const now = Date.parse("2026-11-21T10:15:00.000Z");
  assert.equal(formatTrialRemaining("2026-11-23T13:30:00.000Z", now), "2d 3h remaining");
});
test("short trial durations show hours/minutes and minutes", () => {
  const now = Date.parse("2026-11-21T10:00:00.000Z");
  assert.equal(formatTrialRemaining("2026-11-21T11:35:00.000Z", now), "1h 35m remaining");
  assert.equal(formatTrialRemaining("2026-11-21T10:25:00.000Z", now), "25m remaining");
});
test("expired and malformed dates do not produce negative or misleading durations", () => {
  const now = Date.parse("2026-11-21T10:00:00.000Z");
  assert.equal(formatTrialRemaining("2026-11-21T09:59:00.000Z", now), "Ended");
  assert.equal(formatTrialRemaining("not-a-date", now), "Unavailable");
});
test("trial status distinguishes active, ending soon and terminal states", () => {
  const now = Date.parse("2026-11-21T10:00:00.000Z");
  assert.equal(getTrialStatusLabel("trialing", "2026-11-25T10:00:00.000Z", now), "Active");
  assert.equal(getTrialStatusLabel("trialing", "2026-11-21T22:00:00.000Z", now), "Ending soon");
  assert.equal(getTrialStatusLabel("expired", "2026-11-20T10:00:00.000Z", now), "Ended");
  assert.equal(getTrialStatusLabel("revoked", "2026-11-25T10:00:00.000Z", now), "Revoked");
  assert.equal(getTrialStatusLabel("converted", "2026-11-20T10:00:00.000Z", now), "Converted to paid");
});
test("only a future trialing grant is treated as active", () => {
  const now = Date.parse("2026-11-21T10:00:00.000Z");
  assert.equal(isTrialCurrentlyActive("trialing", "2026-11-22T10:00:00.000Z", now), true);
  assert.equal(isTrialCurrentlyActive("trialing", "2026-11-20T10:00:00.000Z", now), false);
  assert.equal(isTrialCurrentlyActive("expired", "2026-11-22T10:00:00.000Z", now), false);
});
test("Billing uses learner trial lifecycle fields and only offers cancellation for provider-backed subscriptions", () => {
  const page = fs.readFileSync(path.join(root, "src/pages/Billing.tsx"), "utf8");
  assert.match(page, /formatTrialRemaining/);
  assert.match(page, /getTrialStatusLabel/);
  assert.match(page, /trial\.startsAt/);
  assert.match(page, /trial\.payment\?\.autopayAuthorized/);
  assert.match(page, /subscription\.provider === "razorpay"/);
});
