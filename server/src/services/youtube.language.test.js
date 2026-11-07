import test from "node:test";
import assert from "node:assert/strict";

process.env.NODE_ENV = "test";
process.env.MONGO_URI ||= "mongodb://127.0.0.1:27017/buddyforstudy_youtube_language_test";
process.env.JWT_SECRET ||= "youtube-language-test-only-secret";
process.env.GEMINI_API_KEY = "";
process.env.YOUTUBE_API_KEY = "";

const { __youtubeSelectorTestUtils, getYouTubeSearchOptions } = await import("./youtube.service.js");

test("human-readable language choices normalize to YouTube language codes", () => {
  assert.equal(__youtubeSelectorTestUtils.normalizeYouTubeLanguage("English"), "en");
  assert.equal(__youtubeSelectorTestUtils.normalizeYouTubeLanguage("Tamil"), "ta");
  assert.equal(__youtubeSelectorTestUtils.normalizeYouTubeLanguage("en-IN"), "en");
  assert.deepEqual(getYouTubeSearchOptions("English", true), { relevanceLanguage: "en", regionCode: "IN" });
});

test("additional Indian and international language choices normalize to YouTube locale codes", () => {
  const cases = [
    ["Gujarati", "gu"], ["Kannada", "kn"], ["Malayalam", "ml"],
    ["Punjabi", "pa"], ["Urdu", "ur"], ["Odia", "or"],
    ["Marathi", "mr"], ["Bengali", "bn"], ["Tamil", "ta"], ["Telugu", "te"],
    ["Spanish", "es"], ["French", "fr"], ["German", "de"], ["Japanese", "ja"]
  ];
  for (const [label, code] of cases) {
    assert.equal(__youtubeSelectorTestUtils.normalizeYouTubeLanguage(label), code, label);
    const regionCode = ({ es: "ES", fr: "FR", de: "DE", ja: "JP" })[code] || "IN";
    assert.deepEqual(getYouTubeSearchOptions(label, true), { relevanceLanguage: code, regionCode });
  }
});

test("legacy video selection rejects explicitly non-English audio", () => {
  assert.equal(__youtubeSelectorTestUtils.candidateLanguageMatches({
    title: "Python complete course",
    defaultAudioLanguage: "ta"
  }, "en"), false);
  assert.equal(__youtubeSelectorTestUtils.candidateLanguageMatches({
    title: "Python complete course",
    defaultAudioLanguage: "en"
  }, "en"), true);
});

test("explicit English selection rejects unverified spoken-language metadata", () => {
  assert.equal(__youtubeSelectorTestUtils.candidateLanguageMatches({
    title: "Python full course தமிழில்",
    description: "Complete Python training"
  }, "English"), false);
  assert.equal(__youtubeSelectorTestUtils.candidateLanguageMatches({
    title: "Python full course for beginners",
    description: "Complete Python training in English"
  }, "English"), false, "English title/description cannot prove spoken audio language");
});


test("metadata language is not treated as proof of spoken audio language", () => {
  assert.equal(__youtubeSelectorTestUtils.candidateLanguageMatches({
    title: "Python tutorial",
    defaultLanguage: "ta"
  }, "en"), false, "metadata language is not spoken-audio evidence");
});


test("preferred resource languages are normalized, deduplicated and capped at four", () => {
  assert.deepEqual(
    __youtubeSelectorTestUtils.normalizePreferredResourceLanguages(["en", "hi", "mr", "gu", "ta", "hi"]),
    ["en", "hi", "mr", "gu"]
  );
  assert.deepEqual(__youtubeSelectorTestUtils.normalizePreferredResourceLanguages([], "hi"), ["hi"]);
  assert.deepEqual(__youtubeSelectorTestUtils.normalizePreferredResourceLanguages(["Hindi", "English"]), ["hi", "en"]);
});
