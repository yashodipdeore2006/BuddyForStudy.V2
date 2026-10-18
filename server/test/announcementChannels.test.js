import test from "node:test";
import assert from "node:assert/strict";
import { parseAnnouncementChannels } from "../src/utils/announcementChannels.js";

test("announcement channel defaults to in-app", () => {
  assert.deepEqual(parseAnnouncementChannels(undefined), ["in_app"]);
  assert.deepEqual(parseAnnouncementChannels("email"), ["email"]);
  assert.deepEqual(parseAnnouncementChannels("push"), ["push"]);
});

test("channel list is deduplicated", () => {
  assert.deepEqual(parseAnnouncementChannels(["email", "email", "in_app", "push", "push"]), ["email", "in_app", "push"]);
});

test("empty and unsupported channel selections are rejected", () => {
  assert.equal(parseAnnouncementChannels([]), null);
  assert.equal(parseAnnouncementChannels(["in_app", "sms"]), null);
});
