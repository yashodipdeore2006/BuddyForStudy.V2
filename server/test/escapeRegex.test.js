import test from "node:test";
import assert from "node:assert/strict";
import { escapeRegex } from "../src/utils/escapeRegex.js";

test("escapes regex metacharacters so searches remain literal", () => {
  const input = ".*+?^${}()|[]\\";
  const escaped = escapeRegex(input);
  assert.equal(new RegExp(escaped).test(input), true);
  assert.equal(new RegExp(escaped).test("different text"), false);
});

test("leaves ordinary search terms unchanged", () => {
  assert.equal(escapeRegex("MERN stack"), "MERN stack");
});

test("converts non-string inputs safely", () => {
  assert.equal(escapeRegex(123), "123");
  assert.equal(escapeRegex(null), "null");
});

test("escapes each special character independently", () => {
  for (const character of [".", "*", "+", "?", "^", "$", "{", "}", "(", ")", "|", "[", "]", "\\"]) {
    assert.equal(new RegExp(escapeRegex(character)).test(character), true, character);
  }
});
