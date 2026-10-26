import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

async function source(path) {
  return readFile(new URL(path, import.meta.url), "utf8");
}

test("progress reads and mutations use the authenticated principal, not a caller-selected user ID", async () => {
  const [routes, controller, service] = await Promise.all([
    source("../src/routes/progress.routes.js"),
    source("../src/controllers/progress.controller.js"),
    source("../src/services/progress.service.js")
  ]);

  assert.match(routes, /router\.use\(authMiddleware\)/);
  assert.match(controller, /service\.getProgress\(req\.user\.userId, req\.params\.courseId\)/);
  assert.match(controller, /service\.completeItem\(req\.user\.userId, courseId, itemId\)/);
  assert.match(controller, /service\.uncompleteItem\(req\.user\.userId, courseId, itemId\)/);
  assert.match(service, /Enrollment\.findOne\(\{ user: userId, course: courseId/);
  assert.match(service, /Progress\.findOne\(\{ user: userId, course: courseId \}\)/);
  assert.doesNotMatch(controller, /req\.(?:body|query|params)\.userId/);
});

test("saved-course queries and writes are scoped to the authenticated user", async () => {
  const [routes, controller] = await Promise.all([
    source("../src/routes/savedCourse.routes.js"),
    source("../src/controllers/savedCourse.controller.js")
  ]);

  assert.match(routes, /router\.use\(authMiddleware\)/);
  assert.match(controller, /SavedCourse\.find\(\{ user: req\.user\.userId \}\)/);
  assert.match(controller, /\{ user: req\.user\.userId, course: course\.\_id \}/);
  assert.match(controller, /findOneAndDelete\(\{\s*user: req\.user\.userId,\s*course: courseId\s*\}\)/);
  assert.doesNotMatch(controller, /req\.(?:body|query|params)\.userId/);
});

test("profile and consent mutations derive account identity from the authenticated request", async () => {
  const [meRoutes, consentRoutes, consentController] = await Promise.all([
    source("../src/routes/me.routes.js"),
    source("../src/routes/consent.routes.js"),
    source("../src/controllers/consent.controller.js")
  ]);

  assert.match(meRoutes, /router\.put\("\/learning-pace", authMiddleware,/);
  for (const route of [
    'router.get("/status", authMiddleware, controller.status)',
    'router.post("/accept", authMiddleware, controller.acceptLegal)',
    'router.put("/cookies", authMiddleware, controller.saveCookiePreferences)',
    'router.put("/profile", authMiddleware, controller.updateProfileDetails)',
    'router.put("/marketing-email", authMiddleware, controller.updateMarketingConsent)'
  ]) assert.ok(consentRoutes.includes(route), "Expected authenticated consent route: " + route);

  assert.match(consentController, /function actorId\(req\)\s*\{\s*return req\.user\?\.user\?\._id \|\| req\.user\?\.userId;/);
  assert.doesNotMatch(consentController, /req\.(?:body|query)\.userId/);
});
