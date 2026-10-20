import { test, expect } from "@playwright/test";

const baseURL = process.env.E2E_BASE_URL ?? "http://127.0.0.1:4173";

test.describe("canonical learner navigation", () => {
  test("unknown URLs show a real 404 with a Home destination", async ({ page }) => {
    await page.goto(baseURL + "/does-not-exist");
    await expect(page.getByRole("heading", { name: "Page not found" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Go to Home" })).toHaveAttribute("href", "/home");
  });

  test("legacy explore route redirects to the canonical Explore route", async ({ page }) => {
    await page.goto(baseURL + "/courses");
    await expect(page).toHaveURL(/\/explore$/);
  });

  test("legacy My Courses route redirects to My Learning", async ({ page }) => {
    await page.goto(baseURL + "/my-courses");
    await expect(page).toHaveURL(/\/my-learning$/);
  });

  test("legacy Saved route redirects to Saved", async ({ page }) => {
    await page.goto(baseURL + "/saved-courses");
    await expect(page).toHaveURL(/\/saved$/);
  });

  test("legacy Dashboard route redirects to Home", async ({ page }) => {
    await page.goto(baseURL + "/dashboard");
    await expect(page).toHaveURL(/\/home$/);
  });

  test("player entry route is recognized without a lesson id", async ({ page }) => {
    await page.goto(baseURL + "/learn/course-fixture");
    await expect(page).not.toHaveURL(/does-not-exist/);
  });

  test("roadmap route is recognized for a course id", async ({ page }) => {
    await page.goto(baseURL + "/courses/course-fixture/roadmap");
    await expect(page).not.toHaveURL(/does-not-exist/);
  });

  test("public course details opens for a non-enrolled learner", async ({ page }) => {
    await page.route("**/api/courses/course-fixture", route => route.fulfill({ json: { course: {
      _id: "course-fixture", title: "Course fixture", description: "Fixture course", category: "Development",
      level: "Beginner", duration: "2 hours", isPublished: true, learningOutcomes: [],
      modules: [{ _id: "module-1", title: "Module one", lessons: [{ _id: "lesson-1", title: "Lesson one", type: "tutorial", description: "" }] }],
      pricing: { mode: "free" }
    } } }));
    await page.route("**/api/reviews/courses/course-fixture", route => route.fulfill({ json: { reviews: [], stats: { count: 0, average: 0 } } }));
    await page.goto(baseURL + "/courses/course-fixture");
    await expect(page.getByRole("heading", { name: "Course fixture" })).toBeVisible();
  });

  test("signed-in enrolled learner sees the course hub instead of enrollment sales controls", async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem("bfs_token", "e2e-token"));
    await page.route("**/api/auth/me", route => route.fulfill({ json: { user: { id: "learner-1", name: "Learner", email: "learner@example.test", role: "user", authProvider: "local" } } }));
    await page.route("**/api/notifications/preferences", route => route.fulfill({ json: { preferences: { pushEnabled: false } } }));
    await page.route("**/api/courses/course-fixture", route => route.fulfill({ json: { course: {
      _id: "course-fixture", title: "Course fixture", description: "Fixture course", category: "Development",
      level: "Beginner", duration: "2 hours", isPublished: true, learningOutcomes: [],
      modules: [{ _id: "module-1", title: "Module one", lessons: [{ _id: "lesson-1", title: "Lesson one", type: "tutorial", description: "" }] }],
      pricing: { mode: "paid", price: 499 }
    } } }));
    await page.route("**/api/reviews/courses/course-fixture", route => route.fulfill({ json: { reviews: [], stats: { count: 0, average: 0 } } }));
    await page.route("**/api/enrollments/course/course-fixture", route => route.fulfill({ json: { enrollment: { status: "active" } } }));
    await page.route("**/api/progress/course-fixture", route => route.fulfill({ status: 404, contentType: "application/json", body: JSON.stringify({ message: "not found" }) }));
    await page.goto(baseURL + "/courses/course-fixture");
    await expect(page.getByRole("heading", { name: "Course fixture" })).toBeVisible();
    await expect(page.getByRole("button", { name: /Continue learning|Continue/i })).toBeVisible();
    await expect(page.getByText("Buy individual course")).toHaveCount(0);
  });

  test("missing progress does not prevent the roadmap from rendering", async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem("bfs_token", "e2e-token"));
    await page.route("**/api/auth/me", route => route.fulfill({ json: { user: { id: "learner-1", name: "Learner", email: "learner@example.test", role: "user", authProvider: "local" } } }));
    await page.route("**/api/notifications/preferences", route => route.fulfill({ json: { preferences: { pushEnabled: false } } }));
    await page.route("**/api/courses/course-fixture", route => route.fulfill({ json: { course: {
      _id: "course-fixture", title: "Course fixture", description: "Fixture course", category: "Development",
      level: "Beginner", duration: "2 hours", isPublished: true, learningOutcomes: [],
      modules: [{ _id: "module-1", title: "Module one", lessons: [{ _id: "lesson-1", title: "Lesson one", type: "tutorial", description: "" }] }]
    } } }));
    await page.route("**/api/progress/course-fixture", route => route.fulfill({ status: 404, contentType: "application/json", body: JSON.stringify({ message: "not found" }) }));
    await page.goto(baseURL + "/courses/course-fixture/roadmap");
    await expect(page.getByRole("heading", { name: "Course Roadmap" })).toBeVisible();
    await expect(page.getByText(/Roadmap unavailable|requested item could not be found/i)).toHaveCount(0);
  });

  test("roadmap lesson action points to the canonical player route", async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem("bfs_token", "e2e-token"));
    await page.route("**/api/auth/me", route => route.fulfill({ json: { user: { id: "learner-1", name: "Learner", email: "learner@example.test", role: "user", authProvider: "local" } } }));
    await page.route("**/api/notifications/preferences", route => route.fulfill({ json: { preferences: { pushEnabled: false } } }));
    await page.route("**/api/courses/course-fixture", route => route.fulfill({ json: { course: {
      _id: "course-fixture", title: "Course fixture", description: "Fixture course", category: "Development",
      level: "Beginner", duration: "2 hours", isPublished: true,
      modules: [{ _id: "module-1", title: "Module one", lessons: [{ _id: "lesson-1", title: "Lesson one", type: "tutorial", description: "" }] }]
    } } }));
    await page.route("**/api/progress/course-fixture", route => route.fulfill({ status: 404, contentType: "application/json", body: "{}" }));
    await page.goto(baseURL + "/courses/course-fixture/roadmap");
    await expect(page.getByRole("link", { name: /Start/ })).toHaveAttribute("href", "/learn/course-fixture/lesson-1");
  });

  test("roadmap control is not shown when the course has no lessons", async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem("bfs_token", "e2e-token"));
    await page.route("**/api/auth/me", route => route.fulfill({ json: { user: { id: "learner-1", name: "Learner", email: "learner@example.test", role: "user", authProvider: "local" } } }));
    await page.route("**/api/notifications/preferences", route => route.fulfill({ json: { preferences: { pushEnabled: false } } }));
    await page.route("**/api/courses/course-fixture", route => route.fulfill({ json: { course: {
      _id: "course-fixture", title: "Empty course", description: "", category: "Development", level: "Beginner",
      isPublished: true, modules: []
    } } }));
    await page.route("**/api/progress/course-fixture", route => route.fulfill({ status: 404, contentType: "application/json", body: "{}" }));
    await page.goto(baseURL + "/courses/course-fixture/roadmap");
    await expect(page.getByRole("heading", { name: "Empty course" })).toBeVisible();
  });

  test("unpublished or missing course gets a safe unavailable message", async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem("bfs_token", "e2e-token"));
    await page.route("**/api/auth/me", route => route.fulfill({ json: { user: { id: "learner-1", name: "Learner", email: "learner@example.test", role: "user", authProvider: "local" } } }));
    await page.route("**/api/notifications/preferences", route => route.fulfill({ json: { preferences: { pushEnabled: false } } }));
    await page.route("**/api/courses/missing-course", route => route.fulfill({ status: 404, contentType: "application/json", body: JSON.stringify({ message: "The requested item could not be found." }) }));
    await page.goto(baseURL + "/courses/missing-course/roadmap");
    await expect(page.getByRole("heading", { name: "This course is not available" })).toBeVisible();
    await expect(page.getByText("The requested item could not be found.")).toHaveCount(0);
  });

  test("unknown route keeps the URL and never renders Home as a fallback", async ({ page }) => {
    await page.goto(baseURL + "/a-route-that-does-not-exist");
    await expect(page).toHaveURL(/a-route-that-does-not-exist$/);
    await expect(page.getByRole("heading", { name: "Page not found" })).toBeVisible();
    await expect(page.getByRole("heading", { name: /Welcome back|Your learning/i })).toHaveCount(0);
  });

  test("Home navigation is canonical", async ({ page }) => {
    await page.goto(baseURL + "/home");
    await expect(page).toHaveURL(/\/home$/);
  });
});
