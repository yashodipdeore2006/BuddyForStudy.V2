import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
const thumbnail = read("../src/components/CourseThumbnail.tsx");
const resolver = read("../src/lib/courseThumbnail.ts");
const card = read("../src/components/CourseCard.tsx");
const learning = read("../src/pages/MyCourses.tsx");
const details = read("../src/pages/CourseDetails.tsx");
const playlist = read("../src/pages/PlaylistCourse.tsx");
const carousel = read("../src/components/LongFormCourseCarousel.tsx");
const savedCourses = read("../../server/src/controllers/savedCourse.controller.js");

test("course thumbnails enforce the fixed layout, safe zones, and bounded metadata", () => {
  assert.match(thumbnail, /h-\[168px\]/);
  assert.match(thumbnail, /pr-12/);
  assert.match(thumbnail, /pb-10/);
  assert.match(thumbnail, /skills\.slice\(0, 2\)/);
  assert.match(thumbnail, /line-clamp-2.*text-\[15px\].*font-bold.*leading-\[1\.28\].*text-slate-50/);
  for (const variant of ["node-circuit", "terminal-matrix", "bento-tile", "isometric-stack", "kinetic-mesh"]) {
    assert.ok(thumbnail.includes(variant), "missing thumbnail variant: " + variant);
  }
});

test("course thumbnail resolver centralizes domain templates and muted track accents", () => {
  assert.match(resolver, /node-circuit/);
  assert.match(resolver, /terminal-matrix/);
  assert.match(resolver, /bento-tile/);
  assert.match(resolver, /isometric-stack/);
  assert.match(resolver, /kinetic-mesh/);
  for (const accent of ["#4F46E5", "#0F766E", "#6D28D9", "#475569"]) {
    assert.ok(resolver.includes(accent), "missing governed accent: " + accent);
  }
  assert.match(resolver, /identity: asText\(course\.id\) \|\| title/);
});

test("all learner course-cover surfaces use the shared course thumbnail resolver", () => {
  assert.match(card, /CourseThumbnail \{\.\.\.getCourseThumbnailProps\(course\)\}/);
  assert.match(learning, /CourseThumbnail \{\.\.\.getCourseThumbnailProps\(course\)\}/);
  assert.match(details, /CourseThumbnail \{\.\.\.getCourseThumbnailProps\(course\)\}/);
  assert.match(details, /CourseThumbnail \{\.\.\.getCourseThumbnailProps\(item\)\}/);
  assert.match(playlist, /getCourseThumbnailProps\(/);
  assert.match(carousel, /getCourseThumbnailProps\(/);
  assert.match(savedCourses, /domain tags level duration thumbnail isPublished pricing learningOutcomes modules\.title/);
  for (const [name, source] of [["catalogue", card], ["my learning", learning], ["course details", details], ["playlist details", playlist], ["long-form discovery", carousel]]) {
    assert.doesNotMatch(source, /<img[^>]+src=\{(?:course|item)\.thumbnail/ , name + " must not render an external course cover");
  }
});

test("course card commercial and learning footer content remains present", () => {
  assert.match(card, /Why picked:/);
  assert.match(card, /getEffectiveCoursePrice/);
  assert.match(card, /CourseActionButton/);
  assert.match(card, /ratingAverage/);
  assert.match(card, /handlePrimaryAction/);
});


test("original course and YouTube thumbnails take precedence over generated artwork", () => {
  assert.match(thumbnail, /imageUrl\?: string/);
  assert.match(thumbnail, /showOriginalImage \? \(/);
  assert.match(thumbnail, /object-cover/);
  assert.match(thumbnail, /onError=\{\(\) => setImageFailed\(true\)\}/);
  assert.match(resolver, /courseImage \|\| metadataPreviewImage \|\| primaryVideoImage \|\| previewVideoFallback/);
  assert.match(resolver, /https:\/\/i\.ytimg\.com\/vi\//);
  assert.match(resolver, /export function getYouTubeVideoThumbnailUrl/);
});

test("playlist video rows resolve each lesson's own thumbnail", () => {
  assert.match(playlist, /getYouTubeVideoThumbnailUrl\(lesson\)/);
  assert.match(playlist, /src=\{lessonThumbnail\}/);
  assert.match(playlist, /object-cover/);
});
