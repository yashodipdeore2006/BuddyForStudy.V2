const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("typescript");

const root = path.resolve(__dirname, "..");
function loadTs(relativePath, requireMap = {}) {
  const source = fs.readFileSync(path.join(root, relativePath), "utf8");
  const js = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  const module = { exports: {} };
  vm.runInNewContext(js, {
    exports: module.exports,
    module,
    require: (id) => {
      if (Object.prototype.hasOwnProperty.call(requireMap, id)) return requireMap[id];
      throw new Error("Unexpected module import: " + id);
    },
    encodeURIComponent,
    Error,
    String,
    Number,
    Math,
  }, { filename: relativePath });
  return module.exports;
}

const routeModule = loadTs("src/lib/routes.ts");
const navModule = loadTs("src/lib/courseNav.ts", { "./routes": routeModule });
const { routes } = routeModule;
const { getCourseNavTargets } = navModule;

test("route helpers encode ids and reject missing identifiers", () => {
  assert.equal(routes.course("abc/123"), "/courses/abc%2F123");
  assert.equal(routes.roadmap("abc"), "/courses/abc/roadmap");
  assert.equal(routes.learn("abc"), "/learn/abc");
  assert.equal(routes.learn("abc", "lesson 1"), "/learn/abc/lesson%201");
  assert.throws(() => routes.course("undefined"), /valid course id/i);
  assert.throws(() => routes.learn("", "lesson"), /valid course id/i);
});

test("all state combinations preserve navigation invariants", () => {
  const booleans = [false, true];
  const progressValues = [0, 35];
  for (const isEnrolled of booleans)
    for (const isCompleted of booleans)
      for (const progressPct of progressValues)
        for (const isPaid of booleans)
          for (const hasRoadmap of booleans)
            for (const nextLessonId of [null, "lesson-2"]) {
              const result = getCourseNavTargets({
                courseId: "course-1", isEnrolled, isCompleted, progressPct, isPaid,
                hasRoadmap, hasPreview: true, isPublished: true, nextLessonId,
              });
              assert.ok(result.cardHref && !result.cardHref.includes("undefined") && !result.cardHref.includes("null"));
              assert.ok(result.primary);
              assert.ok(["Enroll free", "Enroll", "Start", "Continue", "Review"].includes(result.primary.label));
              assert.ok(!result.primary.href || !result.primary.href.includes("//"));
              assert.ok(!result.overflow.some((item) => item.label === "Roadmap") || hasRoadmap);
              if (isEnrolled) assert.equal(result.cardHref, result.primary.href);
              if (!isEnrolled) assert.equal(result.cardHref, routes.course("course-1"));
              if (isEnrolled && (isCompleted || progressPct >= 100)) {
                assert.equal(result.primary.label, "Review");
                assert.equal(result.primary.href, routes.learn("course-1"));
              } else if (isEnrolled && progressPct > 0) {
                assert.equal(result.primary.label, "Continue");
              } else if (isEnrolled) {
                assert.equal(result.primary.label, "Start");
              }
              const links = result.overflow.filter((item) => item.kind === "link");
              assert.equal(links.some((item) => item.label === "Roadmap"), hasRoadmap);
              for (const item of [result.primary, ...result.overflow]) {
                if (item.href) assert.doesNotMatch(item.href, /undefined|null|\/\//);
              }
            }
});

test("course navigation rejects invalid course ids", () => {
  assert.throws(() => getCourseNavTargets({
    courseId: "", isEnrolled: false, isCompleted: false, isPaid: false,
    progressPct: 0, hasRoadmap: false, hasPreview: false, isPublished: true,
  }), /valid courseId/);
});

test("card and page source use canonical navigation helpers", () => {
  const card = fs.readFileSync(path.join(root, "src/components/CourseCard.tsx"), "utf8");
  const myLearning = fs.readFileSync(path.join(root, "src/pages/MyCourses.tsx"), "utf8");
  const roadmap = fs.readFileSync(path.join(root, "src/pages/CourseRoadmap.tsx"), "utf8");
  const app = fs.readFileSync(path.join(root, "src/App.tsx"), "utf8");
  assert.match(card, /to=\{navTargets\.cardHref\}/);
  assert.match(card, /getCourseNavTargets\(/);
  assert.match(myLearning, /routes\.learn\(course\.id, state\.nextLessonId\)/);
  assert.match(myLearning, /routes\.roadmap\(course\.id\)/);
  assert.match(myLearning, /routes\.course\(course\.id\)/);
  assert.match(myLearning, /"not-started"/);
  assert.match(myLearning, /Search your courses/);
  assert.match(myLearning, /Recently active/);
  assert.match(myLearning, /api\/enrollments\//);
  assert.match(myLearning, /role="dialog"/);
  assert.match(roadmap, /Promise\.allSettled/);
  assert.match(app, /<Route path="\*" element=\{<NotFound \/>} \/>/);
});
