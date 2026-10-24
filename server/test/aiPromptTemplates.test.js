import test from "node:test";
import assert from "node:assert/strict";
import {
  AI_PROMPT_FEATURES,
  AI_PROMPT_FEATURE_KEYS,
  renderPromptTemplate,
  validatePromptTemplate
} from "../src/config/aiPromptTemplates.js";

test("built-in Build with AI and lesson summary prompts satisfy their version contracts", () => {
  for (const feature of AI_PROMPT_FEATURE_KEYS) {
    const definition = AI_PROMPT_FEATURES[feature];
    const result = validatePromptTemplate(feature, definition.defaultPrompt);
    assert.equal(result.valid, true, `${feature}: ${result.message || "built-in prompt should be valid"}`);
    for (const placeholder of definition.requiredPlaceholders) {
      assert.ok(definition.defaultPrompt.includes(`{{${placeholder}}}`), `${feature} should contain {{${placeholder}}}`);
    }
  }
});

test("renders prompt variables as literal values, including dollar signs and newlines", () => {
  assert.equal(
    renderPromptTemplate("Topic {{topic}}\nContext {{context}}", { topic: "C++ $&", context: "line 1\nline 2" }),
    "Topic C++ $&\nContext line 1\nline 2"
  );
});

test("rejects a prompt without its required runtime placeholders", () => {
  const bad = AI_PROMPT_FEATURES.build_with_ai.defaultPrompt.replace("Topic: {{topic}}", "Topic: always use AI");
  const result = validatePromptTemplate("build_with_ai", bad);
  assert.equal(result.valid, false);
  assert.match(result.message, /{{topic}}/);
});

test("rejects unknown features, short prompts and content exceeding the configured limit", () => {
  assert.equal(validatePromptTemplate("unknown", "x".repeat(200)).valid, false);
  assert.equal(validatePromptTemplate("lesson_summary", "Too short").valid, false);
  const definition = AI_PROMPT_FEATURES.lesson_summary;
  assert.equal(validatePromptTemplate("lesson_summary", definition.defaultPrompt + "x".repeat(definition.maxLength)).valid, false);
});
