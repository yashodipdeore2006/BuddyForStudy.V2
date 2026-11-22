import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const source = fs.readFileSync(path.join(here, "../src/pages/Billing.tsx"), "utf8");
const routes = fs.readFileSync(path.join(here, "../../server/src/routes/billing.routes.js"), "utf8");

test("Billing displays the effective entitlement independently from a terminal subscription record", () => {
  assert.match(routes, /effectivePlan: effectivePlan \?/);
  assert.match(source, /type EffectivePlanSummary/);
  assert.match(source, /setEffectivePlan\(subscriptionData\.effectivePlan \|\| subscriptionData\.subscription\?\.plan \|\| null\)/);
  assert.match(source, /\{effectivePlan\?\.name \|\| "No active plan"\}/);
  assert.match(routes, /isDefaultFree: Boolean\(effectivePlan\.isDefaultFree\)/);
  assert.match(source, /const currentPlanIsFree = effectivePlan\?\.isDefaultFree === true/);
  assert.match(source, /Current entitlement/);
});
