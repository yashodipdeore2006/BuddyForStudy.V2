import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { FAQItem } from "../src/models/FAQItem.js";
import { cleanFaqInput } from "../src/controllers/faq.controller.js";
import { DEFAULT_FAQS, FAQ_CATEGORIES } from "../src/utils/faqContent.js";
import { ADMIN_PERMISSION_CATALOG, hasAdminPermission } from "../src/utils/adminRbac.js";

const valid = {
  question: "Where can I find learning roadmaps?",
  answer: "Open the Explore area and choose the learning path that matches your goal.",
  category: "courses-learning",
  displayOrder: 25,
  featured: true,
};

test("FAQ content is stored in a dedicated collection with publication and ordering fields", () => {
  assert.equal(FAQItem.collection.collectionName, "faq_items");
  assert.equal(FAQItem.schema.path("key").options.immutable, true);
  assert.equal(FAQItem.schema.path("question").options.maxlength, 220);
  assert.equal(FAQItem.schema.path("answer").options.maxlength, 6000);
  assert.ok(FAQItem.schema.path("status"));
  assert.ok(FAQItem.schema.path("displayOrder"));
  assert.ok(FAQItem.schema.path("featured"));
});

test("the existing public FAQ entries remain available as approved starter content", () => {
  assert.equal(DEFAULT_FAQS.length, 5);
  assert.ok(DEFAULT_FAQS.every((item) => item.question && item.answer && FAQ_CATEGORIES.includes(item.category)));
  assert.equal(new Set(DEFAULT_FAQS.map((item) => item.key)).size, DEFAULT_FAQS.length);
});

test("FAQ input accepts valid content and normalizes line endings", () => {
  const result = cleanFaqInput({ ...valid, answer: "First step.\r\nSecond step." });
  assert.equal(result.question, valid.question);
  assert.equal(result.category, valid.category);
  assert.equal(result.displayOrder, 25);
  assert.equal(result.featured, true);
  assert.equal(result.answer, "First step.\nSecond step.");
});

test("FAQ input rejects missing content, unsupported categories, invalid order and malformed flags", () => {
  assert.throws(() => cleanFaqInput({ ...valid, question: "Short" }), /Question is required/);
  assert.throws(() => cleanFaqInput({ ...valid, answer: "Tiny" }), /Answer is required/);
  assert.throws(() => cleanFaqInput({ ...valid, category: "not-a-category" }), /category/);
  assert.throws(() => cleanFaqInput({ ...valid, displayOrder: 2.5 }), /whole number/);
  assert.throws(() => cleanFaqInput({ ...valid, featured: "yes" }), /true or false/);
});

test("FAQ input rejects control characters that could corrupt text storage", () => {
  assert.throws(() => cleanFaqInput({ ...valid, question: "Question" + String.fromCharCode(1) + " text" }), /control characters/);
  assert.throws(() => cleanFaqInput({ ...valid, answer: "Answer" + String.fromCharCode(127) + " text" }), /control characters/);
});

test("FAQ management uses dedicated least-privilege permissions", () => {
  assert.ok(ADMIN_PERMISSION_CATALOG.includes("faqs.read"));
  assert.ok(ADMIN_PERMISSION_CATALOG.includes("faqs.manage"));
  assert.equal(hasAdminPermission("platform_admin", "faqs.read"), true);
  assert.equal(hasAdminPermission("platform_admin", "faqs.manage"), true);
  assert.equal(hasAdminPermission("super_admin", "faqs.manage"), true);
  assert.equal(hasAdminPermission("support_manager", "faqs.manage"), false);
  assert.equal(hasAdminPermission("analyst_auditor", "faqs.read"), false);
});

test("public FAQ reads and all admin FAQ mutations are registered behind the expected routes", async () => {
  const [publicRoutes, adminRoutes] = await Promise.all([
    readFile(new URL("../src/routes/publicSettings.routes.js", import.meta.url), "utf8"),
    readFile(new URL("../src/routes/adminPro.routes.js", import.meta.url), "utf8"),
  ]);
  assert.match(publicRoutes, /router\.get\("\/faqs",\s*getPublicFaqs\)/);
  assert.match(adminRoutes, /router\.get\("\/faqs",\s*adminPermissionMiddleware\("faqs\.read"\)/);
  assert.match(adminRoutes, /router\.post\("\/faqs",\s*adminPermissionMiddleware\("faqs\.manage"\)/);
  assert.match(adminRoutes, /router\.put\("\/faqs\/:faqId",\s*adminPermissionMiddleware\("faqs\.manage"\)/);
  assert.match(adminRoutes, /router\.patch\("\/faqs\/:faqId\/status",\s*adminPermissionMiddleware\("faqs\.manage"\)/);
  assert.match(adminRoutes, /router\.post\("\/faqs\/import-starter",\s*adminPermissionMiddleware\("faqs\.manage"\)/);
});
