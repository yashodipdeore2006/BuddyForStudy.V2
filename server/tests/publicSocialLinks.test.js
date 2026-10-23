import test from "node:test";
import assert from "node:assert/strict";
import {
  normalizePublicSocialUrl,
  toPublicSocialLinks,
  validateSocialSettingValue
} from "../src/utils/publicSocialLinks.js";

test("normalizes HTTPS social profile URLs", () => {
  assert.equal(normalizePublicSocialUrl("  https://www.instagram.com/buddyforstudy  "), "https://www.instagram.com/buddyforstudy");
});

test("allows blank values to disable a social link", () => {
  assert.equal(normalizePublicSocialUrl("   "), "");
  assert.deepEqual(validateSocialSettingValue("social_x_url", ""), {
    isSocialSetting: true,
    valid: true,
    value: ""
  });
});

test("rejects invalid, insecure, credential-bearing and non-string social URLs", () => {
  assert.equal(normalizePublicSocialUrl("http://example.com/profile"), null);
  assert.equal(normalizePublicSocialUrl("javascript:alert(1)"), null);
  assert.equal(normalizePublicSocialUrl("https://user:pass@example.com/profile"), null);
  assert.equal(normalizePublicSocialUrl(42), null);
  assert.equal(validateSocialSettingValue("social_instagram_url", "http://example.com").valid, false);
});

test("publishes only allowlisted, explicitly public social link values", () => {
  assert.deepEqual(toPublicSocialLinks([
    { key: "social_instagram_url", value: "https://instagram.com/bfs", isPublic: true },
    { key: "social_linkedin_url", value: "https://linkedin.com/company/bfs", isPublic: false },
    { key: "social_youtube_url", value: "javascript:alert(1)", isPublic: true },
    { key: "smtp_password", value: "must-never-leak", isPublic: true }
  ]), {
    instagram: "https://instagram.com/bfs/",
    youtube: ""
  });
});
