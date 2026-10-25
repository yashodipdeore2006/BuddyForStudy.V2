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
    URL,
  }, { filename: relativePath });
  return module.exports;
}

const routeModule = loadTs("src/lib/routes.ts");
const navModule = loadTs("src/lib/courseNav.ts", { "./routes": routeModule });
const { routes, resolveNotificationRoute } = routeModule;
const { getCourseNavTargets } = navModule;
const notesModule = loadTs("src/lib/courseNotes.ts");

test("route helpers encode ids and reject missing identifiers", () => {
  assert.equal(routes.course("abc/123"), "/courses/abc%2F123");
  assert.equal(routes.roadmap("abc"), "/courses/abc/roadmap");
  assert.equal(routes.learn("abc"), "/learn/abc");
  assert.equal(routes.learn("abc", "lesson 1"), "/learn/abc/lesson%201");
  assert.equal(routes.learn("abc", "undefined"), "/learn/abc");
  assert.equal(routes.learn("abc", "null"), "/learn/abc");
  assert.equal(routes.learn("abc", "   "), "/learn/abc");
  assert.throws(() => routes.course("undefined"), /valid course id/i);
  assert.throws(() => routes.learn("", "lesson"), /valid course id/i);
});


test("notification destinations are canonicalized and unknown routes are rejected", () => {
  assert.equal(resolveNotificationRoute("/dashboard"), routes.home());
  assert.equal(resolveNotificationRoute("/courses"), routes.explore());
  assert.equal(resolveNotificationRoute("/courses/course-1"), routes.course("course-1"));
  assert.equal(resolveNotificationRoute("/learn/course-1/lesson%202"), routes.learn("course-1", "lesson 2"));
  assert.equal(resolveNotificationRoute("/billing"), routes.billing());
  assert.equal(resolveNotificationRoute("https://evil.example/phishing"), null);
  assert.equal(resolveNotificationRoute("//evil.example/phishing"), null);
  assert.equal(resolveNotificationRoute("/missing-route"), null);
  assert.equal(resolveNotificationRoute("/courses/"), null);
});

test("all state combinations preserve navigation invariants", () => {
  const booleans = [false, true];
  const progressValues = [0, 35];
  for (const isEnrolled of booleans)
    for (const isCompleted of booleans)
      for (const progressPct of progressValues)
        for (const isPaid of booleans)
          for (const hasRoadmap of booleans)
            for (const nextLessonId of [null, "lesson-2", "undefined", "null", "", "   "]) {
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
              assert.equal(links.some((item) => item.label === "Roadmap"), isEnrolled && hasRoadmap);
              for (const item of [result.primary, ...result.overflow]) {
                if (item.href) assert.doesNotMatch(item.href, /undefined|null|\/\//);
              }
            }
});

test("course navigation treats malformed optional lesson ids as absent", () => {
  for (const nextLessonId of ["undefined", "null", "", "   "]) {
    const result = getCourseNavTargets({
      courseId: "course-1", isEnrolled: true, isCompleted: false, isPaid: false,
      progressPct: 35, hasRoadmap: true, hasPreview: false, isPublished: true, nextLessonId,
    });
    assert.equal(result.primary.href, routes.learn("course-1"));
    assert.equal(result.cardHref, routes.learn("course-1"));
    assert.doesNotMatch(result.cardHref, /undefined|null/);
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
  assert.doesNotMatch(card, /bfs-course-card__progress/);
  assert.doesNotMatch(myLearning, /bfs-course-card__progress/);
  assert.match(myLearning, /routes\.learn\(activeEnrollment\.course\.id, courseStates\[activeEnrollment\.course\.id\]\?\.nextLessonId\)/);
  assert.match(myLearning, /routes\.roadmap\(course\.id\)/);
  assert.match(myLearning, /routes\.course\(course\.id\)/);
  assert.match(myLearning, /"not-started"/);
  assert.match(myLearning, /Search your courses/);
  assert.match(myLearning, /Recently active/);
  assert.match(myLearning, /api\/enrollments\//);
  assert.match(myLearning, /learningStatus/);
  assert.match(myLearning, /learningProgress/);
  assert.doesNotMatch(myLearning, /useCourseState|CourseStatusPreloader/);
  assert.doesNotMatch(myLearning, /apiFetch\(`\/api\/progress\//);
  assert.doesNotMatch(myLearning, /apiFetch\(`\/api\/enrollments\/course\//);
  assert.match(myLearning, /role="dialog"/);
  assert.match(myLearning, /Undo/);
  assert.match(myLearning, /aria-current=\{activeTab === tab \? "page" : undefined\}/);
  assert.match(roadmap, /Promise\.allSettled/);
  assert.match(app, /<Route path="\*" element=\{<NotFound \/>} \/>/);
});


test("timestamped lesson note timestamps parse and format consistently", () => {
  assert.equal(notesModule.parseMediaTimestamp("00:00"), 0);
  assert.equal(notesModule.parseMediaTimestamp("12:44"), 764);
  assert.equal(notesModule.parseMediaTimestamp("1:02:15"), 3735);
  assert.equal(notesModule.parseMediaTimestamp("95"), 95);
  assert.equal(notesModule.parseMediaTimestamp("1:75"), null);
  assert.equal(notesModule.parseMediaTimestamp("bad"), null);
  assert.equal(notesModule.formatMediaTimestamp(764), "12:44");
  assert.equal(notesModule.formatMediaTimestamp(3735), "1:02:15");
});

test("course pages expose timestamped notes, lesson-state labels, and source duration metadata", () => {
  const player = fs.readFileSync(path.join(root, "src/pages/CoursePlayer.tsx"), "utf8");
  const courseDetails = fs.readFileSync(path.join(root, "src/pages/CourseDetails.tsx"), "utf8");
  const preview = fs.readFileSync(path.join(root, "server/src/utils/coursePreview.js"), "utf8");
  const navbar = fs.readFileSync(path.join(root, "src/components/Navbar.tsx"), "utf8");
  assert.match(player, /Timestamped notes/);
  assert.match(player, /cleanPlayerLessonTitle\(lesson\.title/);
  assert.match(player, /Currently learning/);
  assert.match(courseDetails, /Notes by lesson/);
  assert.match(courseDetails, /bfs:course-enrollment-updated/);
  assert.match(preview, /durationSeconds/);
  assert.match(navbar, /bfs:course-enrollment-updated/);
});
