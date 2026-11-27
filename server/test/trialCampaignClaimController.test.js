import test from "node:test";
import assert from "node:assert/strict";
import { claimCampaign } from "../src/controllers/trialCampaignClaim.controller.js";

const campaignId = "507f1f77bcf86cd799439011";
const authenticatedLearnerId = "507f1f77bcf86cd799439012";
const attackerSuppliedUserId = "507f1f77bcf86cd799439099";
const idempotencyKey = "learner-trial-claim-0001";

function request({
  campaign = campaignId,
  authenticatedUserId = authenticatedLearnerId,
  headerKey = idempotencyKey,
  bodyKey,
  body = {},
} = {}) {
  return {
    params: { campaignId: campaign },
    user: authenticatedUserId ? { userId: authenticatedUserId, role: "user" } : undefined,
    body,
    get(name) {
      return name === "Idempotency-Key" ? headerKey : undefined;
    },
  };
}

function responseRecorder() {
  return {
    statusCode: 200,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
  };
}

test("claim controller binds the entitlement to the authenticated learner, never a body-supplied user ID", async () => {
  const calls = [];
  const res = responseRecorder();
  await claimCampaign(
    request({ body: { userId: attackerSuppliedUserId } }),
    res,
    assert.fail,
    {
      claimTrialCampaign: async (input) => {
        calls.push(input);
        return { ok: true, replayed: false, claim: { id: "claim-1" } };
      },
    },
  );

  assert.deepEqual(calls, [{
    campaignId,
    userId: authenticatedLearnerId,
    idempotencyKey,
  }]);
  assert.equal(res.statusCode, 201);
  assert.equal(res.body.success, true);
  assert.equal(res.body.claim.id, "claim-1");
  assert.equal(res.body.idempotentReplay, false);
  assert.match(res.body.message, /No payment or recurring authorization/);
});

test("claim controller returns an existing entitlement as an idempotent 200 replay", async () => {
  const res = responseRecorder();
  let calls = 0;

  await claimCampaign(request(), res, assert.fail, {
    claimTrialCampaign: async () => {
      calls += 1;
      return { ok: true, replayed: true, claim: { id: "claim-existing" } };
    },
  });

  assert.equal(calls, 1);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.idempotentReplay, true);
  assert.equal(res.body.claim.id, "claim-existing");
});

test("claim controller rejects invalid campaign IDs before calling the claim service", async () => {
  const res = responseRecorder();
  let calls = 0;

  await claimCampaign(request({ campaign: "not-an-object-id" }), res, assert.fail, {
    claimTrialCampaign: async () => { calls += 1; return { ok: true }; },
  });

  assert.equal(res.statusCode, 400);
  assert.equal(res.body.success, false);
  assert.equal(calls, 0);
});

test("claim controller requires a bounded idempotency key and rejects header/body mismatch", async () => {
  for (const input of [
    { headerKey: "", body: {} },
    { headerKey: idempotencyKey, body: { idempotencyKey: "different-key-0001" } },
  ]) {
    const res = responseRecorder();
    let calls = 0;
    await claimCampaign(request(input), res, assert.fail, {
      claimTrialCampaign: async () => { calls += 1; return { ok: true }; },
    });
    assert.equal(res.statusCode, 400);
    assert.equal(res.body.success, false);
    assert.equal(calls, 0);
  }
});

test("claim controller maps eligibility and concurrency failures without changing their status or code", async () => {
  const res = responseRecorder();
  await claimCampaign(request(), res, assert.fail, {
    claimTrialCampaign: async () => ({
      ok: false,
      status: 409,
      code: "CAMPAIGN_ALREADY_CLAIMED",
      message: "This learner has already claimed this trial campaign.",
      reasons: [{ code: "CAMPAIGN_ALREADY_CLAIMED" }],
    }),
  });

  assert.equal(res.statusCode, 409);
  assert.equal(res.body.success, false);
  assert.equal(res.body.errors.code, "CAMPAIGN_ALREADY_CLAIMED");
  assert.deepEqual(res.body.errors.reasons, [{ code: "CAMPAIGN_ALREADY_CLAIMED" }]);
});

test("claim controller forwards unexpected service failures to Express error handling", async () => {
  const res = responseRecorder();
  const error = new Error("transaction unavailable");
  let forwarded;

  await claimCampaign(request(), res, (nextError) => { forwarded = nextError; }, {
    claimTrialCampaign: async () => { throw error; },
  });

  assert.equal(forwarded, error);
  assert.equal(res.body, null);
});
