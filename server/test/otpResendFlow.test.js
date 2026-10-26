import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";

process.env.MONGO_URI ||= "mongodb://127.0.0.1:27017/otp-resend-test";
process.env.JWT_SECRET ||= "unit-test-only-secret-that-is-long-enough";
process.env.SMTP_HOST = "smtp.example.test";
process.env.SMTP_PORT = "587";
process.env.SMTP_SECURE = "false";
process.env.SMTP_USER = "mailer@example.test";
process.env.SMTP_PASS = "unit-test-password";
process.env.MAIL_FROM = "mailer@example.test";

const { AuthOtp } = await import("../src/models/AuthOtp.js");
const { sendOtp } = await import("../src/services/otp.service.js");
const mailerModule = await import("nodemailer");
const nodemailer = mailerModule.default ?? mailerModule;

function mockUser() {
  return { _id: "synthetic-user-id", email: "learner@example.test", name: "Learner Example" };
}

function installMocks({ existingOtp }) {
  const originals = {
    findOne: AuthOtp.findOne,
    deleteMany: AuthOtp.deleteMany,
    create: AuthOtp.create,
    createTransport: nodemailer.createTransport
  };
  const calls = { deletions: [], creations: [], messages: [], transportOptions: [] };
  AuthOtp.findOne = () => ({ sort: async () => existingOtp });
  AuthOtp.deleteMany = async (filter) => {
    calls.deletions.push(filter);
    return { deletedCount: 1 };
  };
  AuthOtp.create = async (record) => {
    calls.creations.push(record);
    return record;
  };
  nodemailer.createTransport = (options) => {
    calls.transportOptions.push(options);
    return { sendMail: async (message) => calls.messages.push(message) };
  };

  return {
    calls,
    restore() {
      AuthOtp.findOne = originals.findOne;
      AuthOtp.deleteMany = originals.deleteMany;
      AuthOtp.create = originals.create;
      nodemailer.createTransport = originals.createTransport;
    }
  };
}

test("OTP resend inside the cooldown is rejected before replacing or mailing a code", async () => {
  const existingOtp = { lastSentAt: new Date(Date.now() - 10_000) };
  const state = installMocks({ existingOtp });
  try {
    await assert.rejects(
      sendOtp(mockUser(), "email_verification"),
      (error) => error.status === 429 && error.isOperational === true &&
        Number.isInteger(error.retryAfter) && error.retryAfter > 0 && error.retryAfter <= 60
    );
    assert.deepEqual(state.calls.deletions, []);
    assert.deepEqual(state.calls.creations, []);
    assert.deepEqual(state.calls.messages, []);
  } finally {
    state.restore();
  }
});

test("OTP resend after cooldown stores only a keyed digest and sends the matching six-digit code", async () => {
  const existingOtp = { lastSentAt: new Date(Date.now() - 61_000) };
  const state = installMocks({ existingOtp });
  try {
    const result = await sendOtp(mockUser(), "email_verification");
    assert.deepEqual(result, { email: "learner@example.test" });
    assert.equal(state.calls.deletions.length, 1);
    assert.equal(state.calls.creations.length, 1);
    assert.equal(state.calls.messages.length, 1);

    const stored = state.calls.creations[0];
    const message = state.calls.messages[0];
    const code = message.html.match(/color:#2563eb">([0-9]{6})<\/div>/)?.[1];
    assert.ok(code, "the outgoing email should contain a six-digit OTP");
    assert.match(stored.codeHash, /^[a-f0-9]{64}$/);
    assert.equal(stored.codeHash, crypto.createHmac("sha256", process.env.JWT_SECRET).update(code).digest("hex"));
    assert.equal(stored.email, "learner@example.test");
    assert.equal(stored.purpose, "email_verification");
    assert.equal(stored.attempts, 0);
    assert.ok(stored.expiresAt.getTime() > Date.now());
    assert.ok(stored.expiresAt.getTime() <= Date.now() + 10 * 60 * 1000 + 1000);
    assert.equal(message.to, "learner@example.test");
    assert.equal(state.calls.transportOptions[0].requireTLS, true);
  } finally {
    state.restore();
  }
});
