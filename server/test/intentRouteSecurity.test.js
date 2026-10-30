import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import intentRouter from "../src/routes/intent.routes.js";
import { authMiddleware } from "../src/middleware/auth.js";
import { parseIntentController } from "../src/controllers/intent.controller.js";

const routeSource = await readFile(new URL("../src/routes/intent.routes.js", import.meta.url), "utf8");
const controllerSource = await readFile(new URL("../src/controllers/intent.controller.js", import.meta.url), "utf8");

function getIntentParseRoute() {
  return (intentRouter.stack || []).find((layer) =>
    layer.route?.path === "/parse" && layer.route.methods?.post
  )?.route;
}

test("intent parse endpoint requires authentication before both subscription entitlements", () => {
  const route = getIntentParseRoute();
  assert.ok(route, "POST /parse must be registered");
  const handlers = route.stack.map((layer) => layer.handle);

  assert.equal(handlers[0], authMiddleware, "authentication must be the first middleware");
  assert.equal(handlers.length, 5, "expected auth, two feature gates, rate limiter and controller");
  assert.equal(handlers[4], parseIntentController, "controller must run only after all guards");
  assert.match(
    routeSource,
    /router\.post\("\/parse",\s*authMiddleware,\s*requireFeature\("ai_course_builder"\),\s*requireFeature\("personalized_roadmaps"\),\s*intentParseLimiter,\s*parseIntentController\)/
  );
});

test("intent parse endpoint rate limit is bounded to 20 requests per minute", () => {
  assert.match(routeSource, /windowMs:\s*60\s*\*\s*1000/);
  assert.match(routeSource, /limit:\s*20/);
  assert.match(routeSource, /standardHeaders:\s*true/);
  assert.match(routeSource, /legacyHeaders:\s*false/);
  const route = getIntentParseRoute();
  assert.equal(typeof route.stack[3].handle, "function");
  assert.equal(route.stack[3].handle.name, "rateLimitMiddleware");
});

test("intent parser feature flag is checked server-side before processing input", () => {
  assert.match(controllerSource, /if\s*\(!env\.intentV2\)\s*return failure\(res,\s*"Intent v2 is not enabled\.",\s*404\)/);
  assert.ok(controllerSource.indexOf("if (!env.intentV2)") < controllerSource.indexOf("parseIntent(body.query)"));
});
