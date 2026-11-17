import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");

function section(source, startMarker, endMarker) {
  const start = source.indexOf(startMarker);
  assert.notEqual(start, -1, `missing section start: ${startMarker}`);
  const end = source.indexOf(endMarker, start + startMarker.length);
  assert.notEqual(end, -1, `missing section end: ${endMarker}`);
  return source.slice(start, end);
}

test("admin resource-recovery endpoint passes authenticated actor provenance into the course revision service", async () => {
  const controller = await read("../src/controllers/adminPro.controller.js");
  const handler = section(
    controller,
    "export async function fillMissingCourseResources",
    "export async function courseReadiness"
  );

  assert.match(handler, /isValidObjectId\(req\.params\.courseId\)/);
  assert.match(handler, /recoverCourseMissingResources\(req\.params\.courseId,\s*\{/);
  assert.match(handler, /actor: adminActorId\(req\)/);
  assert.match(handler, /source: "admin"/);
  assert.match(handler, /reason/);
  assert.match(handler, /audit\(req, "course\.resources\.recovered"/);
  assert.ok(handler.indexOf("recoverCourseMissingResources(") < handler.indexOf('audit(req, "course.resources.recovered"'));
});

test("admin course-journey edit and regeneration pass the authenticated actor into revision creation", async () => {
  const controller = await read("../src/controllers/courseJourneyRoadmap.controller.js");
  const update = section(
    controller,
    "export async function updateAdmin",
    "export async function regenerateAdmin"
  );
  const regenerate = section(
    controller,
    "export async function regenerateAdmin",
    "\n}"
  );

  for (const handler of [update, regenerate]) {
    assert.match(handler, /actor: req\.user\?\.user\?\._id \|\| req\.user\?\.userId \|\| null/);
    assert.match(handler, /source: "admin"/);
    assert.match(handler, /reason:/);
    assert.match(handler, /summary:/);
    assert.match(handler, /recordRoadmapAudit\(req,/);
  }
});

test("administrative background-capable course actions remain behind named course-management permission", async () => {
  const routes = await read("../src/routes/adminPro.routes.js");
  assert.match(routes, /router\.post\("\/courses\/:courseId\/resources\/fill-missing", adminPermissionMiddleware\("courses\.manage"\)/);
  assert.match(routes, /router\.put\("\/courses\/:courseId\/roadmap", adminPermissionMiddleware\("courses\.manage"\)/);
  assert.match(routes, /router\.post\("\/courses\/:courseId\/roadmap\/regenerate", adminPermissionMiddleware\("courses\.manage"\)/);
});
