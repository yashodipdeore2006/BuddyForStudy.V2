import test from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_AUTOMATED_TEMPLATES } from "../src/controllers/messageTemplate.controller.js";
import { hasUnsafeEmailMarkup } from "../src/utils/safeHtml.js";

const byKey = new Map(DEFAULT_AUTOMATED_TEMPLATES.map((template) => [template.key, template]));

test("critical billing events have both in-app and email templates", () => {
  const pairs = [
    ["course-purchase-confirmed-in-app", "course-purchase-confirmed-email"],
    ["subscription-activated-in-app", "subscription-activated-email"],
    ["subscription-payment-in-app", "subscription-payment-email"],
    ["payment-failed-in-app", "payment-failed-email"]
  ];

  for (const [inAppKey, emailKey] of pairs) {
    const inApp = byKey.get(inAppKey);
    const email = byKey.get(emailKey);
    assert.ok(inApp, `missing in-app template: ${inAppKey}`);
    assert.ok(email, `missing email template: ${emailKey}`);
    assert.equal(inApp.channel, "notification");
    assert.equal(email.channel, "email");
    assert.equal(inApp.messageType, "billing");
    assert.equal(email.messageType, "billing");
    assert.ok(email.subject.trim().length > 0);
  }
});

test("course purchase email contains the verified payment and enrollment context", () => {
  const template = byKey.get("course-purchase-confirmed-email");
  for (const placeholder of ["userName", "currency", "amount", "courseTitle", "purchaseDate", "paymentReference", "link"]) {
    assert.ok(template.body.includes(`{{${placeholder}}}`), `missing {{${placeholder}}}`);
  }
});

test("subscription activation and renewal receipts contain billing period and amount context", () => {
  const activation = byKey.get("subscription-activated-email");
  const renewal = byKey.get("subscription-payment-email");
  for (const placeholder of ["userName", "planName", "billingInterval", "currency", "amount", "periodSummary", "link"]) {
    assert.ok(activation.body.includes(`{{${placeholder}}}`), `activation missing {{${placeholder}}}`);
  }
  for (const placeholder of ["userName", "currency", "amount", "link"]) {
    assert.ok(renewal.body.includes(`{{${placeholder}}}`), `renewal missing {{${placeholder}}}`);
  }
});

test("payment failure email explains the incomplete payment and provides a recovery link", () => {
  const template = byKey.get("payment-failed-email");
  assert.match(template.body, /payment did not complete/i);
  assert.match(template.body, /{{link}}/);
});

test("default transactional email templates contain no unsafe markup or URL schemes", () => {
  for (const template of DEFAULT_AUTOMATED_TEMPLATES.filter((item) => item.channel === "email" && item.messageType === "billing")) {
    assert.equal(hasUnsafeEmailMarkup(template.body), false, template.key);
  }
});
