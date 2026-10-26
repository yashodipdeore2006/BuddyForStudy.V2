import test from "node:test";
import assert from "node:assert/strict";
import { getOtpResendCooldownSeconds } from "../src/services/otp.service.js";

const base = new Date("2026-10-26T12:00:00.000Z");

test("OTP resend cooldown returns remaining seconds using ceiling semantics", () => {
  assert.equal(getOtpResendCooldownSeconds(base, base), 60);
  assert.equal(getOtpResendCooldownSeconds(base, new Date(base.getTime() + 1)), 60);
  assert.equal(getOtpResendCooldownSeconds(base, new Date(base.getTime() + 1_000)), 59);
  assert.equal(getOtpResendCooldownSeconds(base, new Date(base.getTime() + 59_001)), 1);
});

test("OTP resend becomes allowed exactly at the cooldown boundary", () => {
  assert.equal(getOtpResendCooldownSeconds(base, new Date(base.getTime() + 60_000)), 0);
  assert.equal(getOtpResendCooldownSeconds(base, new Date(base.getTime() + 120_000)), 0);
});

test("invalid timestamps do not create an infinite cooldown", () => {
  assert.equal(getOtpResendCooldownSeconds("not-a-date", base), 0);
  assert.equal(getOtpResendCooldownSeconds(base, "not-a-date"), 0);
});
