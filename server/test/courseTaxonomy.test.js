import test from "node:test";
import assert from "node:assert/strict";
import {
  buildCourseDomainFilter,
  courseMatchesInferredDomain,
  filterCoursesByInferredDomain,
  filterLearningResourcesByInferredDomain,
  getCourseTaxonomy,
  inferCourseDomain,
  isCourseDomainId,
  normalizeCourseTags,
  resolveCourseDomain
} from "../src/utils/courseTaxonomy.js";

test("course taxonomy exposes stable domain IDs and labels", () => {
  const taxonomy = getCourseTaxonomy();
  assert.equal(taxonomy.version, 1);
  assert.ok(taxonomy.domains.some((domain) => domain.id === "software-development"));
  assert.ok(taxonomy.domains.some((domain) => domain.id === "data-ai"));
  assert.ok(taxonomy.domains.some((domain) => domain.id === "other-learning"));
  assert.equal(isCourseDomainId("software-development"), true);
  assert.equal(isCourseDomainId("unregistered-domain"), false);
});

test("legacy category aliases resolve to canonical domains", () => {
  assert.equal(resolveCourseDomain("Web Development"), "software-development");
  assert.equal(resolveCourseDomain("IT & Software"), "software-development");
  assert.equal(resolveCourseDomain("Data Analytics"), "data-ai");
  assert.equal(resolveCourseDomain("Data Science & AI"), "data-ai");
  assert.equal(resolveCourseDomain("Health & Wellness"), "health-wellness");
  assert.equal(resolveCourseDomain("Teaching"), "education-teaching");
  assert.equal(resolveCourseDomain("Cyber Security"), "cybersecurity");
  assert.equal(resolveCourseDomain("Mechanical Engineering"), "engineering-technology");
  assert.equal(resolveCourseDomain("Mathematics"), "science-mathematics");
  assert.equal(resolveCourseDomain("Unknown Category"), null);
});

test("intent inference stays unclassified when query spans domains", () => {
  assert.equal(inferCourseDomain("React full course"), "software-development");
  assert.equal(inferCourseDomain("Python full course"), null);
  assert.equal(inferCourseDomain("Python programming course"), "software-development");
  assert.equal(inferCourseDomain("SQL"), null);
  assert.equal(inferCourseDomain("Data Analytics"), "data-ai");
  assert.equal(inferCourseDomain("Data Science"), "data-ai");
  assert.equal(inferCourseDomain("Data management"), "data-ai");
  assert.equal(inferCourseDomain("Computer Science"), "software-development");
  assert.equal(inferCourseDomain("Mechanical Engineering"), "engineering-technology");
  assert.equal(inferCourseDomain("Environmental Science"), "agriculture-environment");
  assert.equal(inferCourseDomain("React for Data Analytics"), null);
});

test("inferred domain filtering excludes known cross-domain records but preserves unknown legacy records", () => {
  const courses = [
    { title: "React for Beginners", category: "Web Development" },
    { title: "React in Analytics", category: "Data Analytics", description: "Mentions React" },
    { title: "React essentials", category: "Special Topics" }
  ];
  const filtered = filterCoursesByInferredDomain(courses, "software-development");
  assert.deepEqual(filtered.map((course) => course.title), [
    "React for Beginners",
    "React essentials"
  ]);
  assert.equal(
    courseMatchesInferredDomain({ domain: "data-ai", category: "Web Development" }, "software-development"),
    false
  );
});

test("supplementary resources are filtered by domain without guessing unknown topics", () => {
  const resources = [
    { title: "React Complete Tutorial", description: "Build reusable UI components" },
    { title: "Data Analytics with Python", description: "Explore datasets and dashboards" },
    { title: "A broad learning skills lecture" }
  ];
  const filtered = filterLearningResourcesByInferredDomain(resources, "software-development");
  assert.deepEqual(filtered.map((resource) => resource.title), [
    "React Complete Tutorial",
    "A broad learning skills lecture"
  ]);
});

test("explicit domain filter includes canonical records and recognized legacy categories", () => {
  const filter = buildCourseDomainFilter("software-development");
  assert.ok(filter.$or.some((condition) => condition.domain === "software-development"));
  assert.ok(filter.$or.some((condition) => condition.$and));
  const aliases = filter.$or[1].$and[1].category.$in;
  assert.ok(aliases.some((pattern) => pattern.test("IT & Software")));
  assert.ok(aliases.some((pattern) => pattern.test("Web-Development")));
  const dataAliases = buildCourseDomainFilter("data-ai").$or[1].$and[1].category.$in;
  assert.ok(dataAliases.some((pattern) => pattern.test("Data Science & AI")));
  assert.equal(buildCourseDomainFilter("invalid-domain"), null);
});

test("course tags are normalized, deduplicated and bounded", () => {
  assert.deepEqual(normalizeCourseTags([" React ", "react", "Node.js", "", "Backend APIs"]), [
    "react",
    "node.js",
    "backend apis"
  ]);
  assert.equal(normalizeCourseTags(Array.from({ length: 25 }, (_, index) => `tag-${index}`)).length, 20);
});
