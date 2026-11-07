import test from "node:test";
import assert from "node:assert/strict";
import { resolveGeminiThinkingLevel } from "../src/utils/geminiThinking.js";

test("downgrades MINIMAL to LOW for Gemini 3.8 Flash", () => {
  assert.equal(resolveGeminiThinkingLevel("gemini-3.8-flash", "MINIMAL"), "LOW");
  assert.equal(resolveGeminiThinkingLevel("Gemini-3.8-Flash", "minimal"), "LOW");
  assert.equal(resolveGeminiThinkingLevel("gemini-3.8-flash-preview", "MINIMAL"), "LOW");
});

test("preserves supported levels for Gemini 3.8 Flash", () => {
  assert.equal(resolveGeminiThinkingLevel("gemini-3.8-flash", "LOW"), "LOW");
  assert.equal(resolveGeminiThinkingLevel("gemini-3.8-flash", "MEDIUM"), "MEDIUM");
  assert.equal(resolveGeminiThinkingLevel("gemini-3.8-flash", "HIGH"), "HIGH");
});

test("does not rewrite MINIMAL for other model IDs", () => {
  assert.equal(resolveGeminiThinkingLevel("gemini-2.5-flash", "MINIMAL"), "MINIMAL");
  assert.equal(resolveGeminiThinkingLevel("custom-model", "MINIMAL"), "MINIMAL");
});

test("uses LOW as the default and normalizes the requested level", () => {
  assert.equal(resolveGeminiThinkingLevel("gemini-3.8-flash"), "LOW");
  assert.equal(resolveGeminiThinkingLevel("custom-model", "low"), "LOW");
});
