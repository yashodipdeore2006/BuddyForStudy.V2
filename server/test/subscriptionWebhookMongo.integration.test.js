import test from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import { WebhookEvent } from "../src/models/WebhookEvent.js";
import { UserSubscription } from "../src/models/UserSubscription.js";
import { subscriptionEventFreshnessFilter } from "../src/services/subscriptionWebhookTransitions.js";

const enabled = Boolean(process.env.MONGO_URI);
let connection;
let dbName;

test("MongoDB enforces webhook event uniqueness and subscription event ordering", {
  skip: !enabled && "MONGO_URI is not configured; database integration test skipped"
}, async (t) => {
  dbName = `subscription_webhook_it_${process.pid}_${Date.now()}`;
  connection = mongoose.createConnection(process.env.MONGO_URI, { dbName });
  await connection.asPromise();

  const WebhookEventModel = connection.model("WebhookEvent", WebhookEvent.schema);
  const UserSubscriptionModel = connection.model("UserSubscription", UserSubscription.schema);

  t.after(async () => {
    await connection.dropDatabase();
    await connection.close();
  });

  await Promise.all([WebhookEventModel.init(), UserSubscriptionModel.init()]);

  const duplicateClaims = await Promise.allSettled([
    WebhookEventModel.create({ eventId: "evt_concurrent_duplicate", event: "subscription.activated", status: "processing" }),
    WebhookEventModel.create({ eventId: "evt_concurrent_duplicate", event: "subscription.activated", status: "processing" })
  ]);
  assert.equal(duplicateClaims.filter((result) => result.status === "fulfilled").length, 1);
  assert.equal(duplicateClaims.filter((result) => result.status === "rejected" && result.reason?.code === 11000).length, 1);

  const user = new mongoose.Types.ObjectId();
  const plan = new mongoose.Types.ObjectId();
  const newerAt = new Date("2026-10-18T12:00:02.000Z");
  const olderAt = new Date("2026-10-18T12:00:01.000Z");

  await UserSubscriptionModel.create({
    user,
    plan,
    provider: "razorpay",
    providerSubscriptionId: "sub_integration_test",
    status: "active",
    providerEventAt: newerAt,
    providerEventId: "evt_new_activation",
    providerEventName: "subscription.activated"
  });

  const staleUpdate = await UserSubscriptionModel.findOneAndUpdate(
    { user, ...subscriptionEventFreshnessFilter(olderAt, "evt_old_cancel", "subscription.cancelled") },
    { $set: { status: "cancelled", providerEventAt: olderAt, providerEventId: "evt_old_cancel", providerEventName: "subscription.cancelled" } },
    { new: true }
  );
  assert.equal(staleUpdate, null);

  const conflictingSameSecondUpdate = await UserSubscriptionModel.findOneAndUpdate(
    { user, ...subscriptionEventFreshnessFilter(newerAt, "evt_same_second_cancel", "subscription.cancelled") },
    { $set: { status: "cancelled", providerEventAt: newerAt, providerEventId: "evt_same_second_cancel", providerEventName: "subscription.cancelled" } },
    { new: true }
  );
  assert.equal(conflictingSameSecondUpdate, null);

  const persisted = await UserSubscriptionModel.findOne({ user }).select("+providerEventAt +providerEventId +providerEventName");
  assert.equal(persisted.status, "active");
  assert.equal(persisted.providerEventId, "evt_new_activation");
});
