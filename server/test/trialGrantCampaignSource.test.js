import test from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import { TrialGrant } from "../src/models/TrialGrant.js";

test("administrator grants remain the default source and require grantedBy", async () => {
  const grant = new TrialGrant({
    user: new mongoose.Types.ObjectId(),
    plan: new mongoose.Types.ObjectId(),
    campaignName: "Admin support trial",
    reason: "Support exception approved by administrator.",
    startsAt: new Date(),
    endsAt: new Date(Date.now() + 86400000),
    idempotencyKey: "admin-trial-provenance-0001"
  });
  const error = await grant.validate().then(() => null).catch(value => value);
  assert.ok(error);
  assert.ok(error.errors.grantedBy);
  assert.equal(grant.source, "admin");
});

test("campaign grant records campaign/claim/learner provenance without an invented admin actor", async () => {
  const base = {
    user: new mongoose.Types.ObjectId(),
    plan: new mongoose.Types.ObjectId(),
    campaignName: "Welcome trial [campaign-id]",
    reason: "Configured campaign trial claimed by learner.",
    source: "campaign",
    startsAt: new Date(),
    endsAt: new Date(Date.now() + 86400000),
    idempotencyKey: "campaign-grant-provenance-0001"
  };
  const invalid = new TrialGrant({ ...base, claimedBy: base.user });
  const error = await invalid.validate().then(() => null).catch(value => value);
  assert.ok(error.errors.campaign);
  assert.ok(error.errors.campaignClaim);

  const valid = new TrialGrant({
    ...base,
    campaign: new mongoose.Types.ObjectId(),
    campaignClaim: new mongoose.Types.ObjectId(),
    claimedBy: base.user,
    grantedBy: null
  });
  await valid.validate();
});
