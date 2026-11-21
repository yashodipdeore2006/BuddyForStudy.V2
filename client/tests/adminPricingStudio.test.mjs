import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const source = fs.readFileSync(path.join(here, "../src/pages/admin/AdminPricingStudio.tsx"), "utf8");
const packageJson = JSON.parse(fs.readFileSync(path.join(here, "../package.json"), "utf8"));

test("pricing studio is organized into five focused workspaces", () => {
  for (const workspace of ["overview", "catalogue", "bulk", "rules", "history"]) {
    assert.ok(source.includes('value: "' + workspace + '"'), "missing workspace " + workspace);
  }
  assert.match(source, /ariaLabel="Course pricing workspaces"/);
  assert.match(source, /Latest pricing activity/);
  assert.match(source, /Pricing batch history/);
});

test("catalogue supports pagination and explicit individual or all-matching selection", () => {
  assert.match(source, /AdminPagination page={cataloguePage}/);
  assert.match(source, /setCatalogueLimit/);
  assert.match(source, /mode: "selected", courseIds: selectedCourseIds/);
  assert.match(source, /mode: "all_matching"/);
  assert.match(source, /Maximum 500 courses per pricing batch/);
  assert.match(source, /Select all visible courses/);
  assert.match(source, /updateFilters/);
});

test("bulk pricing always previews selected scope before applying", () => {
  assert.match(source, /adminFetch\("\/api\/admin\/pricing\/preview"/);
  assert.match(source, /adminFetch\("\/api\/admin\/pricing\/apply"/);
  assert.match(source, /Preview and approval/);
  assert.match(source, /No course price is changed by preview generation/);
  assert.match(source, /confirm\("Apply only the course prices shown in this preview/);
  assert.match(source, /reason\.trim\(\)\.length < 10/);
});

test("rule management includes edit, enable-disable and guarded manual execution", () => {
  assert.match(source, /method: editingRuleId \? "PUT" : "POST"/);
  assert.match(source, /const editRule =/);
  assert.match(source, /const toggleRule =/);
  assert.match(source, /method: "PUT"/);
  assert.match(source, /Execute enabled automatic rules/);
  assert.match(source, /there is no background repricing worker/);
});

test("new-course pricing policy retains mode, level bands and generated course scope", () => {
  assert.match(source, /generatedPolicy\.mode/);
  assert.match(source, /levelBands/);
  assert.match(source, /applyTo\.includes/);
  assert.match(source, /generated-policy/);
  assert.match(source, /existing courses are not changed by this policy/);
});

test("history workspace paginates and inspects per-course audit details", () => {
  assert.match(source, /AdminPagination page={historyPage}/);
  assert.match(source, /\/api\/admin\/pricing\/history\/" \+ batchId/);
  assert.match(source, /Batch details/);
  assert.match(source, /Skipped reason/);
  assert.match(source, /Guarded rollback/);
});

test("frontend pricing studio regression test is part of the normal unit-test command", () => {
  assert.ok(packageJson.scripts["test:unit"].includes("tests/adminPricingStudio.test.mjs"));
});
