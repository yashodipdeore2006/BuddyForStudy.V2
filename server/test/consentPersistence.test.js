import test from "node:test";
import assert from "node:assert/strict";
import { User } from "../src/models/User.js";
import { LegalDocument } from "../src/models/LegalDocument.js";
import { NotificationPreference } from "../src/models/NotificationPreference.js";
import { UserConsentEvent } from "../src/models/UserConsentEvent.js";
import { acceptLegalPolicies, revokeMarketingEmailConsent } from "../src/services/consent.service.js";

function userQuery(user) {
  return {
    select() { return this; },
    lean() { return Promise.resolve(user); },
    then(resolve, reject) { return Promise.resolve(user).then(resolve, reject); }
  };
}

test("legal consent acceptance and promotional email withdrawal persist timestamps and synchronized preferences", async () => {
  const user = {
    _id: "507f1f77bcf86cd799439011",
    name: "Learner Example",
    email: "learner@example.test",
    authProvider: "local",
    isActive: true,
    termsAcceptedVersion: "",
    termsAcceptedAt: null,
    privacyAcknowledgedVersion: "",
    privacyAcknowledgedAt: null,
    marketingEmailConsent: false,
    marketingEmailConsentAt: null,
    phoneNumber: "",
    phoneNumberVerified: false,
    city: "",
    learningGoal: "",
    profileSetupSkippedAt: null,
    save: async () => { user.saveCount = (user.saveCount || 0) + 1; }
  };
  const original = {
    findById: User.findById,
    legalFind: LegalDocument.find,
    preferenceUpdate: NotificationPreference.findOneAndUpdate,
    eventCreate: UserConsentEvent.create
  };
  const preferenceUpdates = [];
  const events = [];

  User.findById = () => userQuery(user);
  LegalDocument.find = () => ({
    select() { return this; },
    lean: async () => []
  });
  NotificationPreference.findOneAndUpdate = async (filter, update, options) => {
    preferenceUpdates.push({ filter, update, options });
    return { user: filter.user, ...update.$set };
  };
  UserConsentEvent.create = async (event) => {
    events.push({ ...event, createdAt: new Date() });
    return event;
  };

  try {
    const accepted = await acceptLegalPolicies(user._id, {
      termsAccepted: true,
      privacyAcknowledged: true,
      marketingEmailConsent: true,
      source: "registration"
    });

    assert.equal(accepted.requiresLegalAcceptance, false);
    assert.match(user.termsAcceptedVersion, /^terms-of-service@v/);
    assert.match(user.privacyAcknowledgedVersion, /^privacy-policy@v/);
    assert.ok(user.termsAcceptedAt instanceof Date);
    assert.ok(user.privacyAcknowledgedAt instanceof Date);
    assert.ok(user.marketingEmailConsentAt instanceof Date);
    assert.equal(user.marketingEmailConsent, true);
    assert.deepEqual(preferenceUpdates[0].update.$set.emailAnnouncements, true);
    assert.ok(preferenceUpdates[0].update.$set.emailAnnouncementsConsentAt instanceof Date);
    assert.deepEqual(events.slice(0, 3).map(({ type, accepted, source }) => ({ type, accepted, source })), [
      { type: "terms", accepted: true, source: "registration" },
      { type: "privacy", accepted: true, source: "registration" },
      { type: "marketing_email", accepted: true, source: "registration" }
    ]);

    const withdrawn = await revokeMarketingEmailConsent(user._id);
    assert.equal(withdrawn.marketingEmailConsent, false);
    assert.equal(user.marketingEmailConsent, false);
    assert.ok(user.marketingEmailConsentAt instanceof Date);
    assert.equal(preferenceUpdates[1].update.$set.emailAnnouncements, false);
    assert.equal(preferenceUpdates[1].update.$set.emailAnnouncementsConsentAt, null);
    assert.deepEqual(events.at(-1) && {
      type: events.at(-1).type,
      accepted: events.at(-1).accepted,
      source: events.at(-1).source
    }, {
      type: "marketing_email",
      accepted: false,
      source: "email_unsubscribe"
    });
    assert.equal(events.length, 4);
  } finally {
    User.findById = original.findById;
    LegalDocument.find = original.legalFind;
    NotificationPreference.findOneAndUpdate = original.preferenceUpdate;
    UserConsentEvent.create = original.eventCreate;
  }
});

test("consent events persist a creation timestamp without allowing updatedAt to imply history replacement", () => {
  assert.deepEqual(UserConsentEvent.schema.options.timestamps, { createdAt: true, updatedAt: false });
  assert.equal(UserConsentEvent.schema.path("user").options.immutable, true);
  assert.equal(UserConsentEvent.schema.path("type").options.immutable, true);
  assert.equal(UserConsentEvent.schema.path("accepted").options.immutable, true);
  assert.equal(UserConsentEvent.schema.path("preferences").options.immutable, true);
});
