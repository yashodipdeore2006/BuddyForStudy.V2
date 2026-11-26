import test from "node:test";
import assert from "node:assert/strict";
import { getBuildProgress } from "../src/lib/buildProgress.js";

test("uses indeterminate progress before lesson nodes exist", () => {
  const progress = getBuildProgress("building", []);
  assert.equal(progress.stage, "curriculum");
  assert.equal(progress.total, 0);
  assert.equal(progress.progressValue, null);
  assert.equal(progress.isIndeterminate, true);
});

test("counts resource lessons and excludes quiz nodes", () => {
  const progress = getBuildProgress("building", [
    { type: "lesson", state: "ready" }, { type: "lesson", state: "queued" }, { type: "quiz", state: "pending" }
  ]);
  assert.equal(progress.total, 2);
  assert.equal(progress.completed, 1);
  assert.equal(progress.ready, 1);
  assert.equal(progress.remaining, 1);
  assert.equal(progress.progressValue, 50);
  assert.equal(progress.stage, "resources");
});

test("failed and quota-limited work counts as processed but needs attention", () => {
  const progress = getBuildProgress("building", [
    { type: "lesson", state: "ready" }, { type: "lesson", state: "failed" },
    { type: "lesson", state: "quota_limited" }, { type: "lesson", state: "low_confidence" }
  ]);
  assert.equal(progress.completed, 4);
  assert.equal(progress.ready, 1);
  assert.equal(progress.attention, 3);
  assert.equal(progress.remaining, 0);
  assert.equal(progress.stage, "finalizing");
});

test("represents queued and terminal roadmap states", () => {
  assert.equal(getBuildProgress("ready", []).stage, "complete");
  assert.equal(getBuildProgress("failed", []).stage, "failed");
  assert.equal(getBuildProgress("queued", []).stage, "queued");
});
