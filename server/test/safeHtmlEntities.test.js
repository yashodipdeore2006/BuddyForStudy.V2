import test from "node:test";
import assert from "node:assert/strict";
import { hasUnsafeEmailMarkup } from "../src/utils/safeHtml.js";

test("email markup rejects URL schemes obfuscated with HTML character references", () => {
  const protocol = ["java", "script"].join("");
  const candidates = [
    protocol.slice(0, 4) + "&#x73;" + protocol.slice(5) + ":blocked",
    protocol.slice(0, 4) + "&#115;" + protocol.slice(5) + ":blocked",
    protocol.slice(0, 4) + "&Tab;" + protocol.slice(4) + "&colon;blocked",
    protocol.slice(0, 4) + "&#x0a;" + protocol.slice(4) + ":blocked",
    protocol.slice(0, 4) + "&NewLine;" + protocol.slice(4) + ":blocked"
  ];

  for (const candidate of candidates) {
    const markup = '<a href="' + candidate + '">link</a>';
    assert.equal(hasUnsafeEmailMarkup(markup), true, markup);
  }
});

test("email markup rejects dangerous unquoted URL attributes and keeps HTTPS links", () => {
  const protocol = ["java", "script:"].join("");
  assert.equal(hasUnsafeEmailMarkup("<img src=" + protocol + "blocked>"), true);
  assert.equal(hasUnsafeEmailMarkup('<a href="https://docs.example.com/guide">safe</a>'), false);
});
