import test from "node:test";
import assert from "node:assert/strict";
import router from "../src/routes/trialCampaign.routes.js";
import { authMiddleware } from "../src/middleware/auth.js";
import { readFile } from "node:fs/promises";

test("learner campaign claim route is authenticated and POST-only", () => {
  const authLayer = router.stack.find((layer) => !layer.route);
  assert.equal(authLayer?.handle, authMiddleware);
  const claimLayer = router.stack.find((layer) => layer.route?.path === "/campaigns/:campaignId/claim");
  assert.ok(claimLayer);
  assert.equal(claimLayer.route.methods.post, true);
  assert.equal(claimLayer.route.methods.get, undefined);
});

test("learner offer route is authenticated and GET-only", () => {
  const authLayer = router.stack.find((layer) => !layer.route);
  assert.equal(authLayer?.handle, authMiddleware);
  const offerLayer = router.stack.find((layer) => layer.route?.path === "/offer");
  assert.ok(offerLayer);
  assert.equal(offerLayer.route.methods.get, true);
  assert.equal(offerLayer.route.methods.post, undefined);
});

test("learner trial router is mounted under the trial API namespace", async () => {
  const source = await readFile(new URL("../src/server.js", import.meta.url), "utf8");
  assert.match(source, /app\.use\("\/api\/trials", trialCampaignRoutes\)/);
});
