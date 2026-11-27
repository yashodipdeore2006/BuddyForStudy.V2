import test from "node:test";
import assert from "node:assert/strict";
import { UserSubscription } from "../src/models/UserSubscription.js";

test("user subscription keeps campaign trial references for expiry and revocation", () => {
  assert.equal(UserSubscription.schema.path("trialGrant").options.default, null);
  assert.equal(UserSubscription.schema.path("trialCampaign").options.default, null);
  assert.ok(UserSubscription.schema.indexes().some(([keys]) => keys.trialCampaign === 1 && keys.status === 1));
});
