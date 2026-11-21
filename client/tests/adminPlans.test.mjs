import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const source = fs.readFileSync(path.join(here, "../src/pages/admin/AdminPlans.tsx"), "utf8");

test("subscription plans are separated into overview, catalogue, editor and creation workspaces", () => {
  for (const value of ["overview", "catalogue", "editor", "create"]) {
    assert.ok(source.includes('value: "' + value + '"') || source.includes('value: "' + value + '" as const'));
  }
  assert.match(source, /Subscription plan work areas/);
  assert.match(source, /Plan catalogue/);
  assert.match(source, /Plan details and billing/);
  assert.match(source, /Create subscription plan · Step/);
});

test("overview reports plan totals and keeps global payment availability separate", () => {
  assert.match(source, /Total plans/);
  assert.match(source, /Active plans/);
  assert.match(source, /Inactive plans/);
  assert.match(source, /Free plans/);
  assert.match(source, /Paid plans/);
  assert.match(source, /apiFetch<\{ paymentsEnabled\?: boolean \}>\\("\\/api\\/billing\\/plans"\\)/);
  assert.match(source, /Plan visibility and payment availability are separate controls/);
  assert.match(source, /Paid checkout disabled/);
  assert.match(source, /Paid checkout enabled/);
});

test("default free assignment display matches the existing active slug-or-zero-price sort rule", () => {
  assert.match(source, /plan\\.isActive && isFreeCandidate\\(plan\\)/);
  assert.match(source, /plan\\.slug === "free" \\|\\| Number\\(plan\\.price\\) === 0/);
  assert.match(source, /Number\\(left\\.sortOrder \\|\\| 0\\) - Number\\(right\\.sortOrder \\|\\| 0\\)/);
  assert.match(source, /Eligible free-assignment candidates/);
  assert.match(source, /No active default free plan found/);
  assert.match(source, /freePlanCandidates\\[0\\]/);
});

test("catalogue supports search and plan status, pricing type and billing interval filters", () => {
  assert.match(source, /aria-label="Search plans"/);
  assert.match(source, /Plan availability filter/);
  assert.match(source, /Plan pricing filter/);
  assert.match(source, /Plan billing interval filter/);
  assert.match(source, /matchesQuery && matchesStatus && matchesType && matchesInterval/);
});

test("plan editor keeps details, features, limits and availability as separate save areas", () => {
  assert.match(source, /Save plan details/);
  assert.match(source, /Save feature access/);
  assert.match(source, /Save usage limits/);
  assert.match(source, /Disable plan/);
  assert.match(source, /Confirm availability change/);
  assert.match(source, /providerPlanId/);
  assert.match(source, /Create another plan to offer different billing terms/);
});

test("plan creation retains the existing four-step validation and typed confirmation flow", () => {
  assert.match(source, /const createPlanSteps =/);
  assert.match(source, /validateCreateStep\\(step: number\\)/);
  assert.match(source, /step: number/);
  assert.match(source, /requiredText=\\{confirmAction\\.kind === "create" \\? "CREATE PLAN"/);
  assert.match(source, /A reason between 10 and 500 characters/);
});

test("existing subscriptions are not represented as revoked when a plan is disabled", () => {
  assert.match(source, /Existing subscriptions and entitlements are not cancelled/);
  assert.match(source, /Disabling a plan removes it from the public plan catalogue/);
});
