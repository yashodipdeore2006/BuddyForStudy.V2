import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const source = fs.readFileSync(path.join(here, "../src/pages/admin/AdminPlans.tsx"), "utf8");

const includes = (value, message = value) => assert.ok(source.includes(value), "missing pricing-plan studio contract: " + message);

test("subscription plans are separated into overview, catalogue, editor and creation workspaces", () => {
  for (const value of ["overview", "catalogue", "editor", "create"]) {
    includes('value: "' + value + '"');
  }
  includes("Subscription plan work areas");
  includes("Plan catalogue");
  includes("Plan details and billing");
  includes("Create subscription plan · Step");
});

test("overview reports plan totals and keeps global payment availability separate", () => {
  for (const label of ["Total plans", "Active plans", "Inactive plans", "Zero-priced plans", "Paid plans"]) includes(label);
  includes('apiFetch<{ paymentsEnabled?: boolean }>("/api/billing/plans")');
  includes("plan visibility and payment availability are separate controls");
  includes("Paid checkout disabled");
  includes("Paid checkout enabled");
});

test("default Free assignment is explicit and limited to active zero-priced plans", () => {
  includes("plan.isActive && isFreeCandidate(plan)");
  includes("Number(plan.price) === 0");
  includes("freePlanCandidates.find((plan) => plan.isDefaultFree === true)");
  includes("Explicit default selected");
  includes("isDefaultFree: true");
  includes("Set as default");
  includes("Only an active zero-priced plan can become the default Free assignment");
  includes("It cannot be disabled or repriced until you select another active zero-priced plan as the replacement");
  includes("Eligible free-assignment candidates");
  includes("No active default free plan found");
});

test("catalogue supports search and plan status, pricing type and billing interval filters", () => {
  for (const label of ["Search plans", "Plan availability filter", "Plan pricing filter", "Plan billing interval filter"]) includes(label);
  includes("matchesQuery && matchesStatus && matchesType && matchesInterval");
});

test("plan editor keeps details, features, limits and availability as separate save areas", () => {
  for (const label of ["Save plan details", "Save feature access", "Save usage limits", "Disable plan", "Confirm availability change"]) includes(label);
  includes("providerPlanId");
  includes("Create another plan to offer different billing terms");
});

test("plan creation retains the existing four-step validation and typed confirmation flow", () => {
  includes("const createPlanSteps =");
  includes("validateCreateStep(step: number)");
  includes('requiredText={confirmAction.kind === "create" ? "CREATE PLAN"');
  includes("reason.length < 10 || reason.length > 500");
});

test("existing subscriptions are preserved when a plan is disabled", () => {
  includes("Existing subscriptions and entitlements are not cancelled");
  includes("Disabling a plan removes it from the public plan catalogue");
});
