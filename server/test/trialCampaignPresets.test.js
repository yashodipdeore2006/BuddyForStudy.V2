import test from "node:test";
import assert from "node:assert/strict";
import { getTrialCampaignPresets } from "../src/config/trialCampaignPresets.js";
import { listCampaignPresets } from "../src/controllers/adminTrialCampaigns.controller.js";

test("quick-trial catalogue exposes exactly the supported 7, 14 and 30-day presets", () => {
  const presets = getTrialCampaignPresets();
  assert.deepEqual(presets.map((preset) => preset.trialDays), [7, 14, 30]);
  assert.deepEqual(presets.map((preset) => preset.id), ["7_days", "14_days", "30_days"]);
  assert.deepEqual(presets.map((preset) => preset.label), ["7 days", "14 days", "30 days"]);
});

test("every quick-trial preset uses conservative eligibility, capacity and no-conversion defaults", () => {
  for (const preset of getTrialCampaignPresets()) {
    assert.equal(preset.maxClaims, 100);
    assert.equal(preset.conversionMode, "none");
    assert.equal(preset.conversionPlanId, null);
    assert.deepEqual(preset.eligibility, {
      requireActiveAccount: true,
      requireVerifiedEmail: true,
      requireNoActiveSubscription: true,
      requireNoPreviousTrial: true
    });
  }
});

test("preset values are fresh editable copies and cannot mutate the server catalogue", () => {
  const firstResponse = getTrialCampaignPresets();
  firstResponse[0].trialDays = 29;
  firstResponse[0].maxClaims = 999999;
  firstResponse[0].eligibility.requireVerifiedEmail = false;

  const secondResponse = getTrialCampaignPresets();
  assert.equal(secondResponse[0].trialDays, 7);
  assert.equal(secondResponse[0].maxClaims, 100);
  assert.equal(secondResponse[0].eligibility.requireVerifiedEmail, true);
});

test("preset endpoint returns the catalogue as editable defaults without creating a campaign", () => {
  const response = { statusCode: 200, body: null };
  const res = {
    status(code) {
      response.statusCode = code;
      return this;
    },
    json(body) {
      response.body = body;
      return this;
    }
  };

  const returned = listCampaignPresets({}, res);
  assert.equal(returned, res);
  assert.equal(response.statusCode, 200);
  assert.equal(response.body.success, true);
  assert.equal(response.body.valuesEditable, true);
  assert.deepEqual(response.body.presets.map((preset) => preset.trialDays), [7, 14, 30]);
  assert.equal(response.body.message.includes("remain editable"), true);
});
