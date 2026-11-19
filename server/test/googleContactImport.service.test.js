import test from "node:test";
import assert from "node:assert/strict";
import { importGoogleContactData } from "../src/services/googleContactImport.service.js";

function mockFetch(responses) {
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({ url, options });
    const next = responses.shift();
    if (!next) throw new Error("Unexpected Google API request");
    return {
      ok: next.status >= 200 && next.status < 300,
      status: next.status,
      json: async () => next.body
    };
  };
  return { fetchImpl, calls };
}

const linkedUser = {
  _id: "507f1f77bcf86cd799439011",
  email: "learner@example.com",
  googleId: "google-sub-123"
};

test("Google contact import verifies the linked identity and returns optional phone and address suggestions", async () => {
  const { fetchImpl, calls } = mockFetch([
    { status: 200, body: { sub: "google-sub-123", email: "learner@example.com", email_verified: true } },
    { status: 200, body: { phoneNumbers: [{ canonicalForm: "+919876543210" }] } },
    { status: 200, body: { addresses: [{ streetAddress: "12 Learning Road", extendedAddress: "Flat 4", city: "Pune", region: "Maharashtra", postalCode: "411001", country: "India", formattedValue: "Flat 4, 12 Learning Road, Pune" }] } }
  ]);

  const result = await importGoogleContactData(linkedUser, "a".repeat(40), { fetchImpl });

  assert.equal(result.phoneNumber, "+919876543210");
  assert.equal(result.phoneNumberVerified, false);
  assert.equal(result.address.line1, "12 Learning Road");
  assert.equal(result.address.line2, "Flat 4");
  assert.equal(result.address.city, "Pune");
  assert.equal(result.address.state, "Maharashtra");
  assert.equal(result.address.postalCode, "411001");
  assert.deepEqual(result.availability, { phoneNumbers: true, addresses: true });
  assert.equal(calls.length, 3);
  assert.ok(calls.every((call) => call.options.headers.Authorization === "Bearer " + "a".repeat(40)));
});

test("Google contact import supports granular consent when one private-data scope is denied", async () => {
  const { fetchImpl } = mockFetch([
    { status: 200, body: { sub: "google-sub-123", email: "learner@example.com", email_verified: true } },
    { status: 403, body: {} },
    { status: 200, body: { addresses: [{ city: "Mumbai", region: "Maharashtra" }] } }
  ]);

  const result = await importGoogleContactData(linkedUser, "b".repeat(40), { fetchImpl });
  assert.equal(result.phoneNumber, "");
  assert.equal(result.city, "Mumbai");
  assert.deepEqual(result.availability, { phoneNumbers: false, addresses: true });
});

test("Google contact import rejects a token for a different Google account", async () => {
  const { fetchImpl, calls } = mockFetch([
    { status: 200, body: { sub: "another-google-user", email: "learner@example.com", email_verified: true } }
  ]);

  await assert.rejects(
    importGoogleContactData(linkedUser, "c".repeat(40), { fetchImpl }),
    (error) => error.status === 403
  );
  assert.equal(calls.length, 1);
});

test("Google contact import rejects unverified or mismatched email identities", async () => {
  for (const identity of [
    { sub: "google-sub-123", email: "learner@example.com", email_verified: false },
    { sub: "google-sub-123", email: "someone-else@example.com", email_verified: true }
  ]) {
    const { fetchImpl } = mockFetch([{ status: 200, body: identity }]);
    await assert.rejects(
      importGoogleContactData(linkedUser, "d".repeat(40), { fetchImpl }),
      (error) => error.status === 403
    );
  }
});

test("Google contact import requires a linked Google account and a bounded access token", async () => {
  await assert.rejects(importGoogleContactData({ ...linkedUser, googleId: "" }, "e".repeat(40)), (error) => error.status === 403);
  await assert.rejects(importGoogleContactData(linkedUser, "short"), (error) => error.status === 400);
});
