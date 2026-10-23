import { test, expect, type Page, type Route } from "@playwright/test";

const baseURL = process.env.E2E_BASE_URL ?? "http://127.0.0.1:4173";
const learner = {
  id: "learner-1",
  name: "Learner",
  email: "learner@example.test",
  role: "user",
  authProvider: "local",
  isActive: true,
};

function courseFixture(id: string, overrides: Record<string, unknown> = {}) {
  return {
    _id: id,
    title: "Course fixture",
    description: "Fixture course",
    category: "Development",
    level: "Beginner",
    duration: "2 hours",
    isPublished: true,
    learningOutcomes: [],
    modules: [{
      _id: "module-1",
      title: "Module one",
      lessons: [{
        _id: "lesson-1",
        title: "Lesson one",
        type: "tutorial",
        description: "",
        duration: "5 min",
      }],
    }],
    pricing: { mode: "free", price: 0, currency: "INR" },
    ...overrides,
  };
}

function json(route: Route, body: unknown, status = 200) {
  return route.fulfill({
    status,
    contentType: "application/json",
    body: JSON.stringify(body),
  });
}

async function mockAppApi(page: Page, options: {
  authenticated?: boolean;
  courseId?: string;
  course?: ReturnType<typeof courseFixture>;
  enrolled?: boolean;
  hasPlanAccess?: boolean;
  missingCourse?: boolean;
  missingProgress?: boolean;
  roadmapStages?: Array<Record<string, unknown>>;
  roadmapProgress?: Record<string, unknown> | null;
} = {}) {
  const courseId = options.courseId || "course-fixture";
  const course = options.course || courseFixture(courseId);
  const stages = options.roadmapStages ?? [{
    id: "stage-1",
    order: 1,
    title: "Stage one",
    hours: 2,
    lessonIds: ["lesson-1"],
    skills: ["Foundations"],
    outcome: "Understand the foundations.",
  }];
  const roadmapProgress = options.roadmapProgress === undefined ? null : options.roadmapProgress;

  if (options.authenticated) {
    await page.addInitScript(() => localStorage.setItem("bfs_token", "e2e-token"));
  }

  await page.route("**/api/**", async (route) => {
    const pathname = new URL(route.request().url()).pathname;

    if (pathname.endsWith("/api/auth/me")) {
      if (process.env.E2E_DEBUG === "1") console.log("[E2E] auth-me route", route.request().url(), "authenticated=", Boolean(options.authenticated));
      return options.authenticated
        ? json(route, { user: learner })
        : json(route, { message: "Authentication required" }, 401);
    }
    if (pathname === "/api/notifications/preferences") {
      return json(route, { preferences: { pushEnabled: false } });
    }
    if (pathname === "/api/courses") return json(route, { courses: [] });
    if (pathname === `/api/courses/${courseId}/roadmap`) {
      return json(route, {
        roadmap: {
          courseId,
          title: String(course.title || "Course fixture"),
          theme: "development",
          totalHours: 2,
          stages,
          progress: roadmapProgress,
        },
      });
    }
    if (pathname === `/api/courses/${courseId}`) {
      if (options.missingCourse) {
        return json(route, { message: "The requested item could not be found." }, 404);
      }
      return json(route, { course });
    }
    if (pathname === `/api/reviews/courses/${courseId}`) {
      return json(route, { reviews: [], stats: { count: 0, average: 0, distribution: {} } });
    }
    if (pathname === "/api/billing/plans") return json(route, { plans: [] });
    if (pathname === "/api/billing/entitlements") {
      return json(route, {
        plan: options.hasPlanAccess ? { id: "plan-fixture", name: "Current plan" } : null,
        features: { published_courses: Boolean(options.hasPlanAccess) },
      });
    }
    if (pathname.endsWith(`/api/enrollments/course/${courseId}`)) {
      if (process.env.E2E_DEBUG === "1") console.log("[E2E] enrollment route", route.request().url(), "enrolled=", Boolean(options.enrolled));
      return json(route, { enrollment: options.enrolled ? { status: "active" } : null });
    }
    if (pathname === `/api/progress/${courseId}`) {
      if (options.missingProgress) return json(route, { message: "Progress not found" }, 404);
      return json(route, {
        progress: {
          _id: "progress-1",
          user: learner.id,
          course: courseId,
          completedLessons: [],
          completedCount: 0,
          totalLessons: stages.reduce((count, stage) => count + (Array.isArray(stage.lessonIds) ? stage.lessonIds.length : 0), 0),
          lastLessonId: null,
          percentage: 0,
          lastAccessedAt: null,
        },
      });
    }
    if (pathname === "/api/achievements/me") return json(route, { stats: null });
    if (pathname === "/api/me/learning-pace") return json(route, { success: true });
    // Keep unrelated optional widgets deterministic without introducing real services.
    return json(route, {});
  });
}

test.describe("canonical learner navigation", () => {
  test("unknown URLs show a real 404 with a Home destination", async ({ page }) => {
    await page.goto(baseURL + "/does-not-exist");
    await expect(page.getByRole("heading", { name: "Page not found" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Go to Home" })).toHaveAttribute("href", "/home");
  });

  test("legacy Explore route redirects to the canonical Explore route", async ({ page }) => {
    await page.goto(baseURL + "/courses");
    await expect(page).toHaveURL(/\/explore$/);
  });

  test("legacy My Courses route redirects signed-in learners to My Learning", async ({ page }) => {
    await mockAppApi(page, { authenticated: true });
    await page.goto(baseURL + "/my-courses");
    await expect(page).toHaveURL(/\/my-learning$/);
  });

  test("legacy Saved route redirects signed-in learners to Saved", async ({ page }) => {
    await mockAppApi(page, { authenticated: true });
    await page.goto(baseURL + "/saved-courses");
    await expect(page).toHaveURL(/\/saved$/);
  });

  test("legacy Dashboard route redirects to Home", async ({ page }) => {
    await page.goto(baseURL + "/dashboard");
    await expect(page).toHaveURL(/\/home$/);
  });

  test("lesson player requires authentication", async ({ page }) => {
    await page.goto(baseURL + "/learn/course-fixture");
    await expect(page).toHaveURL(/\/login$/);
  });

  test("roadmap route renders its current journey experience", async ({ page }) => {
    await mockAppApi(page);
    await page.goto(baseURL + "/courses/course-fixture/roadmap");
    await expect(page.getByRole("heading", { name: "Journey roadmap" })).toBeVisible();
    await expect(page.getByRole("img", { name: /Journey roadmap for Course fixture, 1 stages/i })).toBeVisible();
  });

  test("public course details opens for a non-enrolled learner", async ({ page }) => {
    await mockAppApi(page, { course: courseFixture("course-fixture") });
    await page.goto(baseURL + "/courses/course-fixture");
    await expect(page.getByRole("heading", { name: "Course fixture" })).toBeVisible();
  });

  test("free course offers individual enrollment and subscription options", async ({ page }) => {
    await mockAppApi(page, { course: courseFixture("course-fixture") });
    await page.goto(baseURL + "/courses/course-fixture");
    await expect(page.getByRole("heading", { name: "Course fixture" })).toBeVisible();
    await expect(page.getByRole("radio", { name: /Explore subscription plans/ })).toBeVisible();
    await expect(page.getByRole("radio", { name: /Enroll individually/ })).toBeVisible();
    await expect(page.getByText("Free", { exact: true }).first()).toBeVisible();
    await expect(page.getByRole("button", { name: "Sign in to enroll" })).toBeVisible();
  });

  test("free course offers current-plan enrollment when the learner has the entitlement", async ({ page }) => {
    await mockAppApi(page, {
      authenticated: true,
      hasPlanAccess: true,
      course: courseFixture("course-fixture"),
    });
    await page.goto(baseURL + "/courses/course-fixture");
    await expect(page.getByRole("radio", { name: /Continue with current plan/ })).toBeVisible();
    await expect(page.getByRole("radio", { name: /Enroll individually/ })).toBeVisible();
    await expect(page.getByRole("button", { name: "Continue with current plan" }).first()).toBeVisible();
  });

  test("signed-in enrolled learner sees the course hub instead of enrollment sales controls", async ({ page }) => {
    await mockAppApi(page, {
      authenticated: true,
      enrolled: true,
      course: courseFixture("course-fixture", { pricing: { mode: "paid", price: 499, currency: "INR" } }),
    });
    // Keep the critical session/enrollment responses explicit for this state-transition smoke test.
    await page.route("**/api/auth/me", (route) => json(route, { user: learner }));
    await page.route("**/api/enrollments/course/course-fixture", (route) => json(route, { enrollment: { status: "active" } }));
    await page.route("**/api/progress/course-fixture", (route) => json(route, {
      progress: {
        _id: "progress-1", user: learner.id, course: "course-fixture",
        completedLessons: [], completedCount: 0, totalLessons: 1,
        lastLessonId: null, percentage: 0, lastAccessedAt: null,
      },
    }));
    await page.goto(baseURL + "/courses/course-fixture");
    await expect(page.getByRole("heading", { name: "Course fixture" })).toBeVisible();
    await expect(page.getByText(/Your learning progress/i)).toBeVisible();
    await expect(page.getByRole("button", { name: /Start learning|Continue Learning|Continue: Lesson one/i })).toBeVisible();
    await expect(page.getByText("Buy individual course")).toHaveCount(0);
  });

  test("missing progress does not prevent the roadmap from rendering", async ({ page }) => {
    await mockAppApi(page, { authenticated: true, missingProgress: true });
    await page.goto(baseURL + "/courses/course-fixture/roadmap");
    await expect(page.getByRole("heading", { name: "Journey roadmap" })).toBeVisible();
    await expect(page.getByText("Roadmap not available yet.")).toHaveCount(0);
    await expect(page.getByRole("img", { name: /Journey roadmap for Course fixture, 1 stages/i })).toBeVisible();
  });

  test("roadmap Continue action navigates to the canonical player route", async ({ page }) => {
    await mockAppApi(page, {
      authenticated: true,
      missingProgress: true,
      roadmapProgress: {
        completedLessonIds: [],
        percent: 0,
        stageProgress: [0],
        position: 0,
        lastActivityAt: null,
        paceHoursPerDay: 1,
      },
    });
    await page.goto(baseURL + "/courses/course-fixture/roadmap");
    const continueButton = page.getByRole("button", { name: /Continue: Lesson one/i });
    await expect(continueButton).toBeVisible();
    await continueButton.click();
    await expect(page).toHaveURL(/\/learn\/course-fixture\/lesson-1$/);
  });

  test("course with no lessons shows a safe empty-roadmap state", async ({ page }) => {
    await mockAppApi(page, {
      course: courseFixture("course-fixture", { modules: [] }),
      roadmapStages: [],
    });
    await page.goto(baseURL + "/courses/course-fixture/roadmap");
    await expect(page.getByRole("heading", { name: "Journey roadmap" })).toBeVisible();
    await expect(page.getByText("Roadmap not available yet.")).toBeVisible();
    await expect(page.getByRole("button", { name: /Enroll to start your journey/i })).toHaveCount(0);
  });

  test("missing course gets a safe unavailable message without exposing the server response", async ({ page }) => {
    await mockAppApi(page, { courseId: "missing-course", missingCourse: true });
    await page.goto(baseURL + "/courses/missing-course/roadmap");
    await expect(page.getByRole("heading", { name: "Roadmap unavailable" })).toBeVisible();
    await expect(page.getByText("This course is not available.")).toBeVisible();
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


test.describe("public platform pages and footer", () => {
  test("public pages render the marketing footer and their main content", async ({ page }) => {
    const pages = [
      { path: "/about", heading: "Make your next learning step feel clear." },
      { path: "/contact", heading: "We want your learning experience to work for you." },
      { path: "/faq", heading: "Frequently asked questions" },
    ];

    for (const item of pages) {
      await page.goto(baseURL + item.path);
      await expect(page.locator("main.bfs-public-page")).toBeVisible();
      await expect(page.getByRole("heading", { name: item.heading })).toBeVisible();
      await expect(page.locator("footer.bfs-marketing-footer")).toBeVisible();
      await expect(page.getByRole("heading", { name: "About", exact: true })).toBeVisible();
      await expect(page.getByRole("heading", { name: "Discover and learn", exact: true })).toBeVisible();
      await expect(page.getByRole("heading", { name: "Plans and support", exact: true })).toBeVisible();
      await expect(page.getByRole("heading", { name: "Legal and accessibility", exact: true })).toBeVisible();
    }
  });

  test("public aliases redirect to canonical information pages", async ({ page }) => {
    const aliases = [
      { path: "/about-us", canonical: "/about" },
      { path: "/contact-us", canonical: "/contact" },
      { path: "/help", canonical: "/faq" },
    ];
    for (const item of aliases) {
      await page.goto(baseURL + item.path);
      await expect(page).toHaveURL(new RegExp(item.canonical + "$"));
    }
  });

  test("footer navigation points to supported destinations", async ({ page }) => {
    await page.goto(baseURL + "/about");
    const footer = page.locator("footer.bfs-marketing-footer");
    await expect(footer.getByRole("link", { name: /Explore courses/ })).toHaveAttribute("href", "/explore");
    await expect(footer.getByRole("link", { name: /Build a learning roadmap/ })).toHaveAttribute("href", "/explore?build=1");
    await expect(footer.getByRole("link", { name: "Plans and pricing" }).first()).toHaveAttribute("href", "/pricing");
    await expect(footer.getByRole("link", { name: "Create an account" })).toHaveAttribute("href", "/register");
    await expect(footer.getByRole("link", { name: "About BuddyForStudy" })).toHaveAttribute("href", "/about");
    await expect(footer.getByRole("link", { name: "Contact us" })).toHaveAttribute("href", "/contact");
    await expect(footer.getByRole("link", { name: "Help and support" })).toHaveAttribute("href", "/faq");
    await expect(footer.getByRole("link", { name: "All policies" }).first()).toHaveAttribute("href", "/legal");
    await expect(footer.getByText(/Official social links have not been configured yet/)).toBeVisible();
  });

  test("footer uses the full platform layout for signed-in learners", async ({ page }) => {
    await mockAppApi(page, { authenticated: true });
    await page.goto(baseURL + "/home");
    await expect(page.locator("footer.bfs-marketing-footer.bfs-marketing-footer--signed-in")).toBeVisible();
    await expect(page.locator("footer.bfs-marketing-footer")).toHaveCount(1);
    await expect(page.locator("footer.bfs-marketing-footer").getByRole("link", { name: "My learning" })).toBeVisible();
  });

  test("footer is excluded from focused learning experiences", async ({ page }) => {
    await mockAppApi(page, { authenticated: true });
    await page.goto(baseURL + "/learn/course-fixture");
    await expect(page.locator("footer")).toHaveCount(0);
    await page.goto(baseURL + "/courses/course-fixture/roadmap");
    await expect(page.locator("footer")).toHaveCount(0);
  });

  test("public footer layouts do not overflow at mobile viewport width", async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 800 });
    for (const path of ["/about", "/contact", "/faq"]) {
      await page.goto(baseURL + path);
      const dimensions = await page.evaluate(() => ({
        viewport: document.documentElement.clientWidth,
        page: document.documentElement.scrollWidth,
      }));
      expect(dimensions.page, `Horizontal overflow at ${path}: ${JSON.stringify(dimensions)}`).toBeLessThanOrEqual(dimensions.viewport);
    }
  });
});

