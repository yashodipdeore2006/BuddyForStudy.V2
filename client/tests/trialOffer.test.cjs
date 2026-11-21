const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("typescript");
const root = path.resolve(__dirname, "..");
const source = fs.readFileSync(path.join(root, "src/lib/trialOffer.ts"), "utf8");
const js = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText;
const loadedModule = { exports: {} };
vm.runInNewContext(js, {
  exports: loadedModule.exports,
  module: loadedModule,
  globalThis: { crypto: { randomUUID: () => "123e4567-e89b-12d3-a456-426614174000" } },
  Date, Math, encodeURIComponent, Number, String,
}, { filename: "trialOffer.ts" });
const {
  TRIAL_OFFER_DISMISSAL_COOLDOWN_MS, trialOfferDismissalStorageKey,
  getTrialOfferDismissalRemainingMs, isTrialOfferDismissed,
  rememberTrialOfferDismissal, createTrialClaimIdempotencyKey,
} = loadedModule.exports;
function fakeStorage() {
  const values = new Map();
  return {
    values,
    getItem(key) { return values.has(key) ? values.get(key) : null; },
    setItem(key, value) { values.set(key, String(value)); },
    removeItem(key) { values.delete(key); },
  };
}
test("trial offer dismissal is isolated by learner and campaign", () => {
  const storage = fakeStorage();
  const now = 1_800_000_000_000;
  rememberTrialOfferDismissal("learner-a", "campaign-1", now, storage);
  assert.equal(isTrialOfferDismissed("learner-a", "campaign-1", now + 1, storage), true);
  assert.equal(isTrialOfferDismissed("learner-b", "campaign-1", now + 1, storage), false);
  assert.equal(isTrialOfferDismissed("learner-a", "campaign-2", now + 1, storage), false);
  assert.equal(getTrialOfferDismissalRemainingMs("learner-a", "campaign-1", now, storage), TRIAL_OFFER_DISMISSAL_COOLDOWN_MS);
  assert.ok(trialOfferDismissalStorageKey("learner-a", "campaign-1").includes("learner-a"));
});
test("trial offer dismissal expires after the 24-hour cooldown", () => {
  const storage = fakeStorage();
  const now = 1_800_000_000_000;
  rememberTrialOfferDismissal("learner-a", "campaign-1", now, storage);
  assert.equal(isTrialOfferDismissed("learner-a", "campaign-1", now + TRIAL_OFFER_DISMISSAL_COOLDOWN_MS - 1, storage), true);
  assert.equal(isTrialOfferDismissed("learner-a", "campaign-1", now + TRIAL_OFFER_DISMISSAL_COOLDOWN_MS, storage), false);
  assert.equal(storage.values.size, 0);
});
test("claim idempotency keys conform to the server's accepted key format", () => {
  assert.match(createTrialClaimIdempotencyKey(), /^[A-Za-z0-9][A-Za-z0-9._:-]{15,119}$/);
});
