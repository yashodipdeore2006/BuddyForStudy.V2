import test from "node:test";
import assert from "node:assert/strict";
import { emailHtmlToText, escapeEmailHtml, renderBrandedEmail } from "../src/utils/brandedEmail.js";
import { buildOtpEmail } from "../src/services/otp.service.js";

test("BuddyForStudy email shell uses the product brand and a responsive email-safe layout", () => {
  const html = renderBrandedEmail({
    contentHtml: "<h1>Welcome</h1><p>Your account is ready.</p>",
    preheader: "Welcome to BuddyForStudy",
    appUrl: "https://buddyforstudy.in"
  });

  assert.match(html, /BuddyForStudy/);
  assert.match(html, /#1A1B41/i);
  assert.match(html, /#8B5CF6/i);
  assert.match(html, /role="presentation"/);
  assert.match(html, /max-width:600px/);
  assert.match(html, /Welcome to BuddyForStudy/);
  assert.match(html, /https://buddyforstudy\.in/);
  assert.match(html, /<h1>Welcome<\/h1>/);
});

test("branded email renderer extracts an existing full HTML document without nesting documents", () => {
  const html = renderBrandedEmail({
    contentHtml: "<!doctype html><html><head><title>Custom</title></head><body><h1>Receipt</h1><p>Paid</p></body></html>"
  });

  assert.equal((html.match(/<html lang="en">/g) || []).length, 1);
  assert.equal((html.match(/<body /g) || []).length, 1);
  assert.match(html, /<h1>Receipt<\/h1>/);
  assert.match(html, /<p>Paid<\/p>/);
});

test("email text alternative contains readable content and excludes HTML markup", () => {
  const text = emailHtmlToText(renderBrandedEmail({
    contentHtml: "<h1>Payment received</h1><p>Amount: &amp;#8377; 500</p>"
  }));

  assert.match(text, /Payment received/);
  assert.match(text, /BuddyForStudy/);
  assert.doesNotMatch(text, /<[^>]+>/);
});

test("email HTML escaping prevents user-controlled markup injection", () => {
  assert.equal(escapeEmailHtml("<img src=x onerror=alert(1)>"), "&lt;img src=x onerror=alert(1)&gt;");
});

test("verification, login and password reset OTPs use the same branded shell", () => {
  for (const purpose of ["email_verification", "login_verification", "password_reset"]) {
    const email = buildOtpEmail(purpose, "012345", "<img src=x onerror=alert(1)>");
    assert.match(email.html, /BuddyForStudy/);
    assert.match(email.html, /#1A1B41/i);
    assert.match(email.html, /012345/);
    assert.match(email.html, /&lt;img src=x onerror=alert\(1\)&gt;/);
    assert.doesNotMatch(email.html, /<img src=x onerror=alert/);
    assert.match(email.text, /012345/);
    assert.ok(email.subject.startsWith(purpose === "password_reset" ? "Reset" : purpose === "login_verification" ? "Your" : "Verify"));
  }
});
