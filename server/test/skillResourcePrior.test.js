import test from "node:test";
import assert from "node:assert/strict";
import { rebuildSkillPriors, loadSkillResourcePriors } from "../src/services/skillResourcePrior.service.js";

test("rebuildSkillPriors aggregates feedback per canonical skill and video with a bounded score", async () => {
  let captured;
  const feedbackModel = {
    aggregate: async (pipeline) => {
      assert.equal(pipeline[0].$match.skillId.$type, "string");
      return [
        { _id: { skillId: "react-hooks", videoId: "video-a" }, positive: 8, negative: 2, n: 10 },
        { _id: { skillId: "react-hooks", videoId: "video-b" }, positive: 0, negative: 8, n: 8 }
      ];
    }
  };
  const priorModel = { bulkWrite: async (operations) => { captured = operations; return { upsertedCount: operations.length }; } };
  const result = await rebuildSkillPriors({ feedbackModel, priorModel, now: new Date("2026-10-24T00:00:00.000Z") });
  assert.equal(result.rebuilt, 2);
  assert.equal(captured[0].updateOne.update.$set.score, 0.6);
  assert.equal(captured[0].updateOne.update.$set.n, 10);
  assert.equal(captured[1].updateOne.update.$set.score, -1);
  assert.equal(captured[1].updateOne.filter.canonicalSkillId, "react-hooks");
});

test("loadSkillResourcePriors returns only priors with at least five observations", async () => {
  let query;
  const priorModel = { find: (value) => { query = value; return { lean: async () => [{ videoId: "video-a", score: 0.8, n: 5 }] }; } };
  const result = await loadSkillResourcePriors("react-hooks", ["video-a", "video-b"], { priorModel });
  assert.deepEqual(query, { canonicalSkillId: "react-hooks", videoId: { $in: ["video-a", "video-b"] }, n: { $gte: 5 } });
  assert.equal(result.get("video-a").score, 0.8);
  assert.equal(result.has("video-b"), false);
  assert.equal((await loadSkillResourcePriors("", ["video-a"], { priorModel })).size, 0);
});
