import test from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import { AdminInvitation } from "../src/models/AdminInvitation.js";

test("MongoDB atomically permits only one concurrent invitation claim", async (t) => {
  const uri = process.env.MONGO_URI;
  if (!uri) {
    t.skip("MONGO_URI is not configured; real MongoDB concurrency test is skipped");
    return;
  }

  await mongoose.connect(uri, { dbName: `buddyforstudy_invitation_race_${process.pid}` });
  try {
    await AdminInvitation.deleteMany({});
    const now = new Date();
    const invitation = await AdminInvitation.create({
      email: "race-test@example.com",
      name: "Race Test Admin",
      adminRole: "support_manager",
      tokenHash: `race-test-${process.pid}-${now.getTime()}`,
      invitedBy: new mongoose.Types.ObjectId(),
      expiresAt: new Date(now.getTime() + 60_000)
    });

    const claimAt = new Date();
    const filter = {
      _id: invitation._id,
      acceptedAt: null,
      revokedAt: null,
      expiresAt: { $gt: claimAt }
    };
    const claim = () => AdminInvitation.findOneAndUpdate(
      filter,
      { $set: { acceptedAt: claimAt } },
      { new: true }
    );
    const results = await Promise.all([claim(), claim()]);
    assert.equal(results.filter(Boolean).length, 1, "exactly one request must claim the invitation");
    const stored = await AdminInvitation.findById(invitation._id);
    assert.equal(stored.acceptedAt?.getTime(), claimAt.getTime());
  } finally {
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  }
});
