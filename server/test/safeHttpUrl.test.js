import test from "node:test";
import assert from "node:assert/strict";
import { parseSafeHttpUrl } from "../src/utils/safeHttpUrl.js";

test("safe HTTP URL parser accepts ordinary HTTP and HTTPS resource URLs", () => {
  assert.equal(parseSafeHttpUrl("https://docs.example.com/guide").href, "https://docs.example.com/guide");
  assert.equal(parseSafeHttpUrl("http://localhost:5173/help").href, "http://localhost:5173/help");
});

test("safe HTTP URL parser rejects malformed URLs, unsafe schemes, deceptive protocol prefixes and credentials", () => {
  for (const value of [
    "",
    "not a URL",
    "javascript:alert(1)",
    "data:text/html,<h1>hello</h1>",
    "file:///etc/passwd",
    "ftp://docs.example.com/file",
    "httpfoo://docs.example.com/file",
    "https://user:password@docs.example.com/private",
    "https://"
  ]) {
    assert.equal(parseSafeHttpUrl(value), null, `expected URL to be rejected: ${value}`);
  }
  assert.equal(parseSafeHttpUrl(null), null);
  assert.equal(parseSafeHttpUrl(42), null);
});
