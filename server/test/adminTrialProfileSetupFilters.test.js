import test from "node:test";
import assert from "node:assert/strict";
import { isProfileSetupComplete, matchesProfileSetupFilter } from "../src/utils/adminProfileSetupFilters.js";

test("profile setup complete requires both required profile fields and must not be skipped", () => {
  assert.equal(isProfileSetupComplete({ city: "Nashik", learningGoal: "Backend development" }), true);
  assert.equal(isProfileSetupComplete({ city: "Nashik", learningGoal: "  " }), false);
  assert.equal(isProfileSetupComplete({ city: " ", learningGoal: "Backend development" }), false);
  assert.equal(isProfileSetupComplete({ city: "Nashik", learningGoal: "Backend development", profileSetupSkippedAt: new Date() }), false);
});

test("complete, incomplete and skipped trial-audience filters are mutually consistent", () => {
  const complete = { city: "Pune", learningGoal: "MERN stack" };
  const incomplete = { city: "Pune", learningGoal: "" };
  const skipped = { city: "", learningGoal: "", profileSetupSkippedAt: new Date() };

  assert.equal(matchesProfileSetupFilter(complete, "complete"), true);
  assert.equal(matchesProfileSetupFilter(incomplete, "complete"), false);
  assert.equal(matchesProfileSetupFilter(skipped, "complete"), false);

  assert.equal(matchesProfileSetupFilter(complete, "incomplete"), false);
  assert.equal(matchesProfileSetupFilter(incomplete, "incomplete"), true);
  assert.equal(matchesProfileSetupFilter(skipped, "incomplete"), false);

  assert.equal(matchesProfileSetupFilter(complete, "skipped"), false);
  assert.equal(matchesProfileSetupFilter(incomplete, "skipped"), false);
  assert.equal(matchesProfileSetupFilter(skipped, "skipped"), true);
  assert.equal(matchesProfileSetupFilter(skipped, "any"), true);
});
