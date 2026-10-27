import test from "node:test";
import assert from "node:assert/strict";
import { Course } from "../src/models/Course.js";
import {
  createModule,
  updateModule,
  deleteModule,
  createLesson,
  updateLesson,
  deleteLesson
} from "../src/controllers/curriculum.controller.js";

const COURSE_ID = "507f1f77bcf86cd799439011";
const MODULE_A = "507f1f77bcf86cd799439012";
const MODULE_B = "507f1f77bcf86cd799439013";
const LESSON_A = "507f1f77bcf86cd799439014";
const LESSON_B = "507f1f77bcf86cd799439015";

function makeCollection(initial, builder) {
  const rows = [...initial];
  rows.create = (input) => builder(input, rows);
  rows.id = (id) => rows.find((item) => String(item._id) === String(id)) || null;
  return rows;
}

function makeLesson(input, parent = null) {
  return {
    _id: input._id || "507f1f77bcf86cd799439099",
    title: input.title || "",
    description: input.description || "",
    type: input.type || "tutorial",
    order: input.order || 1,
    tutorial: input.tutorial,
    project: input.project,
    deleteOne() {
      if (!parent) return;
      const index = parent.findIndex((item) => item === this);
      if (index >= 0) parent.splice(index, 1);
    }
  };
}

function makeModule(input, parent = null) {
  const module = {
    _id: input._id || "507f1f77bcf86cd799439098",
    title: input.title || "",
    description: input.description || "",
    order: input.order || 1
  };
  module.lessons = makeCollection(
    (input.lessons || []).map((lesson) => makeLesson(lesson)),
    (lesson, rows) => makeLesson(lesson, rows)
  );
  module.deleteOne = function deleteOne() {
    if (!parent) return;
    const index = parent.findIndex((item) => item === module);
    if (index >= 0) parent.splice(index, 1);
  };
  return module;
}

function makeCourse(initialModules = []) {
  const course = {
    _id: COURSE_ID,
    saveCalls: 0,
    modules: null,
    async save() {
      this.saveCalls += 1;
      return this;
    }
  };
  course.modules = makeCollection(
    initialModules.map((module) => makeModule(module)),
    (module, rows) => makeModule(module, rows)
  );
  // Existing modules need the same parent-aware delete behavior as new modules.
  for (const module of course.modules) {
    module.deleteOne = function deleteOne() {
      const index = course.modules.indexOf(module);
      if (index >= 0) course.modules.splice(index, 1);
    };
    for (const lesson of module.lessons) {
      lesson.deleteOne = function deleteOne() {
        const index = module.lessons.indexOf(lesson);
        if (index >= 0) module.lessons.splice(index, 1);
      };
    }
  }
  return course;
}

function responseRecorder() {
  return {
    statusCode: 200,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; }
  };
}

async function invokeWithCourse(course, handler, req) {
  const originalFindById = Course.findById;
  Course.findById = async (id) => id === COURSE_ID ? course : null;
  const res = responseRecorder();
  try {
    await handler(req, res, (error) => assert.fail("Unexpected controller error: " + error));
  } finally {
    Course.findById = originalFindById;
  }
  return res;
}

test("module creation persists the new module and keeps modules sorted by order", async () => {
  const course = makeCourse([
    { _id: MODULE_A, title: "First", order: 1 },
    { _id: MODULE_B, title: "Third", order: 3 }
  ]);
  const res = await invokeWithCourse(course, createModule, {
    params: { courseId: COURSE_ID },
    body: { title: "Second", description: "Middle module", order: 2 }
  });

  assert.equal(res.statusCode, 201);
  assert.equal(res.body.success, true);
  assert.equal(course.saveCalls, 1);
  assert.deepEqual(course.modules.map((module) => module.title), ["First", "Second", "Third"]);
  assert.deepEqual(course.modules.map((module) => module.order), [1, 2, 3]);
  assert.equal(res.body.module.title, "Second");
});

test("updating module order re-sorts persisted modules", async () => {
  const course = makeCourse([
    { _id: MODULE_A, title: "First", order: 2 },
    { _id: MODULE_B, title: "Second", order: 3 },
    { _id: "507f1f77bcf86cd799439016", title: "Third", order: 4 }
  ]);
  const res = await invokeWithCourse(course, updateModule, {
    params: { courseId: COURSE_ID, moduleId: MODULE_B },
    body: { title: "Moved to front", order: 1 }
  });

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.success, true);
  assert.equal(course.saveCalls, 1);
  assert.deepEqual(course.modules.map((module) => module.title), ["Moved to front", "First", "Third"]);
  assert.deepEqual(course.modules.map((module) => module.order), [1, 2, 4]);
});

test("lesson creation persists a lesson with the correct default body and order", async () => {
  const course = makeCourse([{
    _id: MODULE_A,
    title: "Module",
    order: 1,
    lessons: [
      { _id: LESSON_A, title: "Second lesson", type: "tutorial", order: 2, tutorial: { content: "Existing" } }
    ]
  }]);
  const res = await invokeWithCourse(course, createLesson, {
    params: { courseId: COURSE_ID, moduleId: MODULE_A },
    body: { title: "First lesson", type: "tutorial", order: 1 }
  });

  assert.equal(res.statusCode, 201);
  assert.equal(res.body.success, true);
  assert.equal(course.saveCalls, 1);
  assert.deepEqual(course.modules[0].lessons.map((lesson) => lesson.title), ["First lesson", "Second lesson"]);
  assert.deepEqual(course.modules[0].lessons.map((lesson) => lesson.order), [1, 2]);
  assert.deepEqual(res.body.lesson.tutorial, {});
});

test("updating lesson order persists and re-sorts lessons within its module", async () => {
  const course = makeCourse([{
    _id: MODULE_A,
    title: "Module",
    order: 1,
    lessons: [
      { _id: LESSON_A, title: "First lesson", type: "tutorial", order: 2 },
      { _id: LESSON_B, title: "Second lesson", type: "project", order: 3 }
    ]
  }]);
  const res = await invokeWithCourse(course, updateLesson, {
    params: { courseId: COURSE_ID, moduleId: MODULE_A, lessonId: LESSON_B },
    body: { title: "Promoted project", order: 1 }
  });

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.success, true);
  assert.equal(course.saveCalls, 1);
  assert.deepEqual(course.modules[0].lessons.map((lesson) => lesson.title), ["Promoted project", "First lesson"]);
  assert.deepEqual(course.modules[0].lessons.map((lesson) => lesson.order), [1, 2]);
});

test("module and lesson deletion remove the selected subdocument and save the parent course", async (t) => {
  await t.test("module deletion", async () => {
    const course = makeCourse([
      { _id: MODULE_A, title: "Keep", order: 1 },
      { _id: MODULE_B, title: "Delete", order: 2 }
    ]);
    const res = await invokeWithCourse(course, deleteModule, {
      params: { courseId: COURSE_ID, moduleId: MODULE_B }, body: {}
    });
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.success, true);
    assert.deepEqual(course.modules.map((module) => module.title), ["Keep"]);
    assert.equal(course.saveCalls, 1);
  });

  await t.test("lesson deletion", async () => {
    const course = makeCourse([{
      _id: MODULE_A,
      title: "Module",
      order: 1,
      lessons: [
        { _id: LESSON_A, title: "Keep lesson", type: "tutorial", order: 1 },
        { _id: LESSON_B, title: "Delete lesson", type: "project", order: 2 }
      ]
    }]);
    const res = await invokeWithCourse(course, deleteLesson, {
      params: { courseId: COURSE_ID, moduleId: MODULE_A, lessonId: LESSON_B }, body: {}
    });
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.success, true);
    assert.deepEqual(course.modules[0].lessons.map((lesson) => lesson.title), ["Keep lesson"]);
    assert.equal(course.saveCalls, 1);
  });
});

test("curriculum controllers reject malformed IDs and nonexistent modules/lessons without writing", async (t) => {
  const course = makeCourse([{ _id: MODULE_A, title: "Module", order: 1, lessons: [] }]);

  await t.test("malformed course ID", async () => {
    const originalFindById = Course.findById;
    let lookups = 0;
    Course.findById = async () => { lookups += 1; throw new Error("must not query invalid id"); };
    const res = responseRecorder();
    try {
      await createModule({ params: { courseId: "bad" }, body: { title: "New", order: 1 } }, res,
        (error) => assert.fail("Unexpected error: " + error));
      assert.equal(res.statusCode, 400);
      assert.equal(lookups, 0);
    } finally { Course.findById = originalFindById; }
  });

  await t.test("missing module", async () => {
    const res = await invokeWithCourse(course, createLesson, {
      params: { courseId: COURSE_ID, moduleId: "507f1f77bcf86cd799439099" },
      body: { title: "Lesson", type: "tutorial", order: 1 }
    });
    assert.equal(res.statusCode, 404);
    assert.equal(course.saveCalls, 0);
  });

  await t.test("missing lesson", async () => {
    const res = await invokeWithCourse(course, updateLesson, {
      params: { courseId: COURSE_ID, moduleId: MODULE_A, lessonId: "507f1f77bcf86cd799439099" },
      body: { title: "No lesson", order: 1 }
    });
    assert.equal(res.statusCode, 404);
    assert.equal(course.saveCalls, 0);
  });
});
