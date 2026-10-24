import test from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import { AdminInvitation } from "../src/models/AdminInvitation.js";

test("MongoDB serializes concurrent invitation acceptance and revocation transitions", async (t) => {
  const uri = process.env.MONGO_URI;
  if (!uri) {
    t.skip("MONGO_URI is not configured; real MongoDB concurrency test is skipped");
    return;
  }

  const dbName = `buddyforstudy_invitation_races_${process.pid}`;
  await mongoose.connect(uri, { dbName });
  try {
    await AdminInvitation.deleteMany({});
    const now = new Date();
    const inviter = new mongoose.Types.ObjectId();
    const createInvitation = (suffix) => AdminInvitation.create({
      email: `${suffix}-race-test@example.com`,
      name: "Race Test Admin",
      adminRole: "support_manager",
      tokenHash: `${suffix}-race-${process.pid}-${now.getTime()}`,
      invitedBy: inviter,
      expiresAt: new Date(now.getTime() + 60_000)
    });

    const claimInvitation = await createInvitation("claim");
    const claimAt = new Date();
    const claimFilter = {
      _id: claimInvitation._id,
      acceptedAt: null,
      revokedAt: null,
      expiresAt: { $gt: claimAt }
    };
    const claims = await Promise.all([
      AdminInvitation.findOneAndUpdate(claimFilter, { $set: { acceptedAt: claimAt } }, { new: true }),
      AdminInvitation.findOneAndUpdate(claimFilter, { $set: { acceptedAt: claimAt } }, { new: true })
    ]);
    assert.equal(claims.filter(Boolean).length, 1, "only one concurrent acceptance claim may succeed");

    const transitionInvitation = await createInvitation("transition");
    const transitionAt = new Date();
    const transitionFilter = {
      _id: transitionInvitation._id,
      acceptedAt: null,
      revokedAt: null,
      expiresAt: { $gt: transitionAt }
    };
    const [claim, revoke] = await Promise.all([
      AdminInvitation.findOneAndUpdate(transitionFilter, { $set: { acceptedAt: transitionAt } }, { new: true }),
      AdminInvitation.findOneAndUpdate(transitionFilter, { $set: { revokedAt: transitionAt } }, { new: true })
    ]);
    assert.equal(Number(Boolean(claim)) + Number(Boolean(revoke)), 1,
      "exactly one of acceptance claim or revocation must win");
    const stored = await AdminInvitation.findById(transitionInvitation._id);
    assert.equal(Boolean(stored.acceptedAt) !== Boolean(stored.revokedAt), true,
      "invitation must end in exactly one terminal state");
  } finally {
    await AdminInvitation.deleteMany({}).catch(() => {});
    await mongoose.disconnect();
  }
});
