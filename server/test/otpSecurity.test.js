import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { AuthOtp } from "../src/models/AuthOtp.js";
import { env } from "../src/config/env.js";
import { verifyOtp } from "../src/services/otp.service.js";

const validCode = "123456";
const hash = (code) => crypto.createHmac("sha256", env.jwtSecret).update(code).digest("hex");

function makeRecord(overrides = {}) {
  return {
    _id: "otp-record-id",
    email: "learner@example.com",
    purpose: "email_verification",
    codeHash: hash(validCode),
    expiresAt: new Date(Date.now() + 60_000),
    attempts: 0,
    usedAt: null,
    ...overrides
  };
}

function installOtpMocks(record) {
  const original = {
    findOne: AuthOtp.findOne,
    updateOne: AuthOtp.updateOne,
    findOneAndUpdate: AuthOtp.findOneAndUpdate
  };
  let attemptsUpdated = 0;
  AuthOtp.findOne = (filter) => ({
    sort: async () => filter.usedAt === null && record.usedAt === null && filter.email === record.email && filter.purpose === record.purpose ? record : null
  });
  AuthOtp.updateOne = async (filter, update) => {
    attemptsUpdated += 1;
    if (record.usedAt !== null || record.expiresAt <= new Date() || record.attempts >= 5) {
      return { modifiedCount: 0 };
    }
    record.attempts += update.$inc.attempts;
    return { modifiedCount: 1 };
  };
  AuthOtp.findOneAndUpdate = async (filter, update) => {
    if (record.usedAt !== null || record.expiresAt <= update.$set.usedAt || record.attempts >= 5) return null;
    record.usedAt = update.$set.usedAt;
    return record;
  };
  return {
    record,
    attemptsUpdated: () => attemptsUpdated,
    restore() {
      AuthOtp.findOne = original.findOne;
      AuthOtp.updateOne = original.updateOne;
      AuthOtp.findOneAndUpdate = original.findOneAndUpdate;
    }
  };
}

test("valid OTP is consumed exactly once and uses a secret-keyed digest", async () => {
  const state = installOtpMocks(makeRecord());
  try {
    assert.match(state.record.codeHash, /^[a-f0-9]{64}$/);
    const result = await verifyOtp({ email: "Learner@example.com", purpose: "email_verification", code: validCode });
    assert.ok(result.usedAt instanceof Date);
    await assert.rejects(
      verifyOtp({ email: "learner@example.com", purpose: "email_verification", code: validCode }),
      (error) => error.status === 400 && /invalid or expired/i.test(error.message)
    );
  } finally {
    state.restore();
  }
});

test("concurrent valid submissions permit only one OTP consumption", async () => {
  const state = installOtpMocks(makeRecord());
  try {
    const results = await Promise.allSettled([
      verifyOtp({ email: "learner@example.com", purpose: "email_verification", code: validCode }),
      verifyOtp({ email: "learner@example.com", purpose: "email_verification", code: validCode })
    ]);
    assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
    assert.equal(results.filter((result) => result.status === "rejected").length, 1);
  } finally {
    state.restore();
  }
});

test("OTP expiry is inclusive at the exact expiry timestamp", async () => {
  const originalNow = Date.now;
  const fixedNow = 1_900_000_000_000;
  Date.now = () => fixedNow;
  const state = installOtpMocks(makeRecord({ expiresAt: new Date(fixedNow) }));
  try {
    await assert.rejects(
      verifyOtp({ email: "learner@example.com", purpose: "email_verification", code: validCode }),
      (error) => error.status === 400 && /invalid or expired/i.test(error.message)
    );
  } finally {
    Date.now = originalNow;
    state.restore();
  }
});

test("incorrect login OTP attempts increment atomically and stop after the attempt limit", async () => {
  const state = installOtpMocks(makeRecord({ purpose: "login_verification" }));
  try {
    await assert.rejects(
      verifyOtp({ email: "learner@example.com", purpose: "login_verification", code: "000000" }),
      (error) => error.status === 400 && error.message === "Incorrect OTP."
    );
    assert.equal(state.record.attempts, 1);
    state.record.attempts = 5;
    await assert.rejects(
      verifyOtp({ email: "learner@example.com", purpose: "login_verification", code: "000000" }),
      (error) => error.status === 429 && /Too many/i.test(error.message)
    );
  } finally {
    state.restore();
  }
});

test("login verification OTP is purpose-bound and expires before it can be replayed", async () => {
  const state = installOtpMocks(makeRecord({ purpose: "login_verification" }));
  try {
    const result = await verifyOtp({
      email: "learner@example.com",
      purpose: "login_verification",
      code: validCode
    });
    assert.ok(result.usedAt instanceof Date);

    await assert.rejects(
      verifyOtp({
        email: "learner@example.com",
        purpose: "email_verification",
        code: validCode
      }),
      (error) => error.status === 400 && /invalid or expired/i.test(error.message)
    );

    await assert.rejects(
      verifyOtp({
        email: "learner@example.com",
        purpose: "login_verification",
        code: validCode
      }),
      (error) => error.status === 400 && /invalid or expired/i.test(error.message)
    );
  } finally {
    state.restore();
  }
});

test("expired login OTP is rejected at its exact expiry boundary", async () => {
  const originalNow = Date.now;
  const fixedNow = 1_900_000_100_000;
  Date.now = () => fixedNow;
  const state = installOtpMocks(makeRecord({
    purpose: "login_verification",
    expiresAt: new Date(fixedNow)
  }));
  try {
    await assert.rejects(
      verifyOtp({
        email: "learner@example.com",
        purpose: "login_verification",
        code: validCode
      }),
      (error) => error.status === 400 && /invalid or expired/i.test(error.message)
    );
  } finally {
    Date.now = originalNow;
    state.restore();
  }
});

test("password-reset OTP is purpose-bound and can only be consumed once", async () => {
  const state = installOtpMocks(makeRecord({ purpose: "password_reset" }));
  try {
    const result = await verifyOtp({
      email: "learner@example.com",
      purpose: "password_reset",
      code: validCode
    });
    assert.ok(result.usedAt instanceof Date);

    await assert.rejects(
      verifyOtp({
        email: "learner@example.com",
        purpose: "password_reset",
        code: validCode
      }),
      (error) => error.status === 400 && /invalid or expired/i.test(error.message)
    );

    await assert.rejects(
      verifyOtp({
        email: "learner@example.com",
        purpose: "email_verification",
        code: validCode
      }),
      (error) => error.status === 400 && /invalid or expired/i.test(error.message)
    );
  } finally {
    state.restore();
  }
});

test("expired password-reset OTP is rejected at the exact expiry boundary", async () => {
  const originalNow = Date.now;
  const fixedNow = 1_900_000_200_000;
  Date.now = () => fixedNow;
  const state = installOtpMocks(makeRecord({
    purpose: "password_reset",
    expiresAt: new Date(fixedNow)
  }));
  try {
    await assert.rejects(
      verifyOtp({
        email: "learner@example.com",
        purpose: "password_reset",
        code: validCode
      }),
      (error) => error.status === 400 && /invalid or expired/i.test(error.message)
    );
  } finally {
    Date.now = originalNow;
    state.restore();
  }
});
