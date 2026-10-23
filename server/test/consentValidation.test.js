import test from "node:test";
import assert from "node:assert/strict";
import {
  buildPushNotificationConsentEvent,
  normalizeCookiePreferences,
  normalizePhoneNumber
} from "../src/services/consent.service.js";

test("phone number normalization accepts formatted international numbers", () => {
  assert.equal(normalizePhoneNumber("+91 98765 43210"), "+919876543210");
  assert.equal(normalizePhoneNumber("(987) 654-3210"), "9876543210");
  assert.equal(normalizePhoneNumber("9876543210"), "9876543210");
});

test("phone number validation rejects malformed or out-of-range values", () => {
  assert.equal(normalizePhoneNumber(""), "");
  assert.equal(normalizePhoneNumber("   "), "");
  assert.equal(normalizePhoneNumber("12345"), null);
  assert.equal(normalizePhoneNumber("call-me-please"), null);
  assert.equal(normalizePhoneNumber("+12abc456789"), null);
  assert.equal(normalizePhoneNumber("123456789012345678"), null);
  assert.equal(normalizePhoneNumber("9".repeat(33)), null);
  assert.equal(normalizePhoneNumber(9876543210), null);
});

test("essential storage is always enabled and optional categories require explicit true", () => {
  assert.deepEqual(normalizeCookiePreferences({ necessary: false, analytics: true, marketing: false }), {
    necessary: true,
    analytics: true,
    marketing: false
  });
  assert.deepEqual(normalizeCookiePreferences({ analytics: 1, marketing: "yes" }), {
    necessary: true,
    analytics: false,
    marketing: false
  });
  assert.deepEqual(normalizeCookiePreferences(null), {
    necessary: true,
    analytics: false,
    marketing: false
  });
});


test("push consent records explicit enable and disable with an accurate event meaning", () => {
  assert.deepEqual(buildPushNotificationConsentEvent(true), {
    type: "push_notifications",
    version: "web-push@v1",
    accepted: true,
    source: "settings",
    changedFields: []
  });
  assert.deepEqual(buildPushNotificationConsentEvent(false), {
    type: "push_notifications",
    version: "web-push@v1",
    accepted: false,
    source: "settings",
    changedFields: []
  });
  assert.throws(() => buildPushNotificationConsentEvent("yes"), /must be true or false/i);
});
