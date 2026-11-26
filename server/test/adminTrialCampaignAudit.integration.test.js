import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import mongoose from "mongoose";

import { User } from "../src/models/User.js";
import { SubscriptionPlan } from "../src/models/SubscriptionPlan.js";
import { TrialCampaign } from "../src/models/TrialCampaign.js";
import { AuditLog } from "../src/models/AuditLog.js";
import { AuditOutbox } from "../src/models/AuditOutbox.js";
import {
  createCampaign,
  updateCampaign,
  publishCampaign,
  pauseCampaign,
  disableCampaign
} from "../src/controllers/adminTrialCampaigns.controller.js";

const canRun = Boolean(process.env.MONGO_URI);
const dbName = `buddyforstudy_campaign_audit_${process.pid}_${Date.now()}`;

let administrator;
let trialPlan;

before(async () => {
  if (!canRun) return;
  await mongoose.connect(process.env.MONGO_URI, { dbName });
  await Promise.all([
    User.init(),
    SubscriptionPlan.init(),
    TrialCampaign.init(),
    AuditLog.init(),
    AuditOutbox.init()
  ]);

  administrator = await User.create({
    name: "Campaign Audit Administrator",
    email: `campaign-audit-admin-${crypto.randomUUID()}@example.test`,
    role: "admin",
    isActive: true,
    emailVerified: true
  });
  await SubscriptionPlan.create({
    name: "Campaign Audit Free",
    slug: `campaign-audit-free-${crypto.randomUUID()}`,
    price: 0,
    currency: "INR",
    isActive: true,
    isDefaultFree: true
  });
  trialPlan = await SubscriptionPlan.create({
    name: "Campaign Audit Trial",
    slug: `campaign-audit-trial-${crypto.randomUUID()}`,
    price: 0,
    currency: "INR",
    isActive: true,
    isDefaultFree: false
  });
}, { timeout: 30_000 });

after(async () => {
  if (mongoose.connection.readyState === 0) return;
  await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
});

function request(params = {}, body = {}) {
  return {
    params,
    body,
    user: { user: { _id: administrator._id } },
    ip: "127.0.0.1",
    get: (header) => header.toLowerCase() === "user-agent" ? "trial-campaign-audit-integration" : ""
  };
}

async function invoke(controller, req) {
  const res = {
    statusCode: 200,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    }
  };
  let nextError = null;
  await controller(req, res, (error) => { nextError = error; });
  if (nextError) throw nextError;
  assert.equal(res.body?.success, true, res.body?.message || "Campaign action failed");
  return res;
}

test("campaign lifecycle actions persist audit events and failed audit writes enter the durable outbox", {
  skip: !canRun && "MONGO_URI is not configured; MongoDB integration test skipped",
  timeout: 30_000
}, async () => {
  const token = crypto.randomUUID();
  const created = await invoke(createCampaign, request({}, {
    internalName: "Audit Regression " + token.slice(0, 8),
    internalReason: "Verify persistent audit events for campaign lifecycle actions.",
    offerTitle: "Campaign audit integration offer",
    offerDescription: "A test offer used to verify campaign audit records.",
    trialPlanId: String(trialPlan._id),
    trialDays: 7,
    startsAt: new Date(Date.now() - 60_000).toISOString(),
    endsAt: null,
    maxClaims: 10,
    eligibility: {
      requireActiveAccount: true,
      requireVerifiedEmail: true,
      requireNoActiveSubscription: true,
      requireNoPreviousTrial: true
    },
    conversionMode: "none",
    conversionPlanId: null
  }));
  const campaignId = created.body.campaign._id;
  assert.ok(campaignId);

  const updateReason = "Clarify the offer and audience after the policy review.";
  const updated = await invoke(updateCampaign, request({ campaignId }, {
    reason: updateReason,
    offerTitle: "Updated campaign audit integration offer",
    maxClaims: 12,
    eligibility: { requireNoPreviousTrial: false }
  }));
  assert.equal(updated.body.campaign.offerTitle, "Updated campaign audit integration offer");
  assert.equal(updated.body.campaign.maxClaims, 12);
  assert.equal(updated.body.campaign.eligibility.requireNoActiveSubscription, true);
  assert.equal(updated.body.campaign.eligibility.requireNoPreviousTrial, false);

  const updateAudit = await AuditLog.findOne({
    action: "trial_campaign.updated",
    targetId: String(campaignId)
  }).lean();
  assert.equal(updateAudit.reason, updateReason);
  assert.equal(updateAudit.before.offerTitle, "Campaign audit integration offer");
  assert.equal(updateAudit.after.offerTitle, "Updated campaign audit integration offer");

  await invoke(publishCampaign, request({ campaignId }));
  const originalCreate = AuditLog.create;
  try {
    AuditLog.create = async () => {
      throw new Error("Simulated audit collection write failure");
    };
    await invoke(pauseCampaign, request({ campaignId }));
  } finally {
    AuditLog.create = originalCreate;
  }

  const queued = await AuditOutbox.findOne({
    "event.action": "trial_campaign.paused",
    "event.targetId": String(campaignId)
  }).lean();
  assert.ok(queued, "failed campaign audit write should be durably queued");
  assert.equal(queued.status, "pending");
  assert.equal(queued.event.actor.toString(), String(administrator._id));
  assert.equal(queued.event.before.status, "published");
  assert.equal(queued.event.after.status, "paused");

  await invoke(publishCampaign, request({ campaignId }));
  await invoke(disableCampaign, request({ campaignId }));

  const persisted = await AuditLog.find({
    targetType: "TrialCampaign",
    targetId: String(campaignId)
  }).sort({ createdAt: 1 }).lean();
  assert.deepEqual(
    persisted.map((event) => event.action),
    [
      "trial_campaign.created",
      "trial_campaign.updated",
      "trial_campaign.published",
      "trial_campaign.published",
      "trial_campaign.disabled"
    ]
  );
  assert.ok(persisted.every((event) => String(event.actor) === String(administrator._id)));
  assert.ok(persisted.every((event) => event.before !== undefined && event.after !== undefined));

  const finalCampaign = await TrialCampaign.findById(campaignId).lean();
  assert.equal(finalCampaign.status, "ended");
  assert.equal(finalCampaign.endedAt instanceof Date, true);
});
