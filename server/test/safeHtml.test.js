import test from "node:test";
import assert from "node:assert/strict";
import { hasUnsafeEmailMarkup } from "../src/utils/safeHtml.js";

test("safe transactional email markup and placeholders are allowed", () => {
  assert.equal(hasUnsafeEmailMarkup('<h1>Receipt</h1><p>Paid {{currency}} {{amount}}</p><a href="{{link}}">View billing</a>'), false);
});

test("script and embedded executable elements are rejected", () => {
  assert.equal(hasUnsafeEmailMarkup('<script>alert(1)</script>'), true);
  assert.equal(hasUnsafeEmailMarkup('<iframe srcdoc="<script>bad()</script>"></iframe>'), true);
  assert.equal(hasUnsafeEmailMarkup('<svg onload="alert(1)"></svg>'), true);
});

test("event-handler attributes and dangerous URL schemes are rejected", () => {
  assert.equal(hasUnsafeEmailMarkup('<img src="x" onerror="alert(1)">'), true);
  assert.equal(hasUnsafeEmailMarkup('<a href="javascript:alert(1)">click</a>'), true);
  assert.equal(hasUnsafeEmailMarkup('<a href="vbscript:msgbox(1)">click</a>'), true);
});

test("CSS-based embedded execution and HTML data URLs are rejected", () => {
  assert.equal(hasUnsafeEmailMarkup('<p style="width:expression(alert(1))">x</p>'), true);
  assert.equal(hasUnsafeEmailMarkup('<a href="data:text/html,hello">open</a>'), true);
});
