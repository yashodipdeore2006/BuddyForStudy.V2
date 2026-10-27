import { test, expect, type Page, type Route } from "@playwright/test";

const baseURL = process.env.E2E_BASE_URL ?? "http://127.0.0.1:4173";

test.beforeEach(async ({ page }, testInfo) => {
  // Keep the consent banner out of unrelated navigation tests. The dedicated
  // cookie-consent test intentionally starts with a fresh browser choice.
  if (testInfo.title.includes("cookie banner offers reject")) return;
  await page.addInitScript((origin) => {
    try {
      if (window.location.origin !== origin) return;
      localStorage.setItem("bfs-cookie-consent-v1", JSON.stringify({
        version: "cookie-choice-v1",
        preferences: { necessary: true, analytics: false, marketing: false },
        updatedAt: new Date().toISOString()
      }));
    } catch { /* Tests that cannot access storage still exercise the app. */ }
  }, new URL(baseURL).origin);
});
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

function learningEnrollmentFixture(
  course: ReturnType<typeof courseFixture>,
  learningStatus: "in-progress" | "not-started" | "completed",
  progress: Partial<{ completedCount: number; totalLessons: number; percentage: number; nextLessonId: string | null; lastLessonId: string | null; lastAccessedAt: string | null }> = {},
) {
  const courseId = String(course._id);
  const completedCount = progress.completedCount ?? (learningStatus === "completed" ? 1 : 0);
  const totalLessons = progress.totalLessons ?? 1;
  return {
    _id: "enrollment-" + courseId,
    user: learner.id,
    course,
    status: learningStatus === "completed" ? "completed" : "active",
    learningStatus,
    enrolledAt: "2026-10-20T10:00:00.000Z",
    createdAt: "2026-10-20T10:00:00.000Z",
    updatedAt: "2026-10-24T10:00:00.000Z",
    learningProgress: {
      completedCount,
      totalLessons,
      percentage: progress.percentage ?? (totalLessons > 0 ? Math.round(completedCount / totalLessons * 100) : 0),
      nextLessonId: progress.nextLessonId !== undefined ? progress.nextLessonId : learningStatus === "completed" ? null : "lesson-1",
      lastLessonId: progress.lastLessonId ?? null,
      lastAccessedAt: progress.lastAccessedAt ?? (learningStatus === "in-progress" ? "2026-10-24T10:00:00.000Z" : null),
    },
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
  catalogCourses?: Array<ReturnType<typeof courseFixture>>;
  enrolled?: boolean;
  hasPlanAccess?: boolean;
  pushAvailable?: boolean;
  consentStatus?: Record<string, unknown>;
  cookiePreferences?: Record<string, unknown> | null;
  missingCourse?: boolean;
  missingProgress?: boolean;
  roadmapStages?: Array<Record<string, unknown>>;
  roadmapProgress?: Record<string, unknown> | null;
  learningEnrollments?: Array<Record<string, unknown>>;
  savedMutationFailure?: "save" | "remove";
  practiceQuizFailure?: boolean;
  reviewMutationFailure?: boolean;
  checkoutOrderFailure?: boolean;
  billingPlans?: Array<Record<string, unknown>>;
} = {}) {
  const courseId = options.courseId || "course-fixture";
  const course = options.course || courseFixture(courseId);
  const completedLessons: Array<{ lessonId: string; type: "tutorial"; completedAt: string }> = [];
  const courseLessonCount = (course.modules || []).reduce((count: number, module: { lessons?: unknown[] }) => count + (module.lessons?.length || 0), 0);
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
      return json(route, { preferences: { pushEnabled: false }, pushAvailable: options.pushAvailable === true });
    }
    if (pathname === "/api/consent/status") {
      return json(route, {
        status: options.consentStatus || {
          requiresLegalAcceptance: false,
          requiresProfileCompletion: false,
          policies: {
            termsVersion: "terms-fixture-v1",
            privacyVersion: "privacy-fixture-v1",
            termsPublished: true,
            privacyPublished: true,
            termsUrl: "/legal/terms-of-service",
            privacyUrl: "/legal/privacy-policy",
          },
          user: {
            authProvider: options.authenticated ? "local" : "local",
            marketingEmailConsent: false,
            phoneNumber: "",
            city: "",
            learningGoal: "",
          },
        },
      });
    }
    if (pathname === "/api/consent/cookies" && route.request().method() === "GET") {
      return json(route, { preferences: options.cookiePreferences || null, version: "cookies-fixture-v1" });
    }
    if (pathname === "/api/consent/cookies" && route.request().method() === "PUT") {
      const body = route.request().postDataJSON() as { analytics?: boolean; marketing?: boolean };
      return json(route, { preferences: { necessary: true, analytics: body.analytics === true, marketing: body.marketing === true } });
    }
    if (pathname === "/api/consent/accept") {
      return json(route, { status: {
        ...(options.consentStatus || {}),
        requiresLegalAcceptance: false,
        requiresProfileCompletion: Boolean((options.consentStatus as { requiresProfileCompletion?: boolean } | undefined)?.requiresProfileCompletion),
      } });
    }
    if (pathname === "/api/consent/profile/complete" || pathname === "/api/consent/profile/skip") {
      return json(route, { status: { requiresLegalAcceptance: false, requiresProfileCompletion: false, user: { authProvider: "google", phoneNumber: " +919876543210 " } } });
    }
    if (pathname === "/api/consent/profile" && route.request().method() === "PUT") return json(route, { status: { requiresProfileCompletion: false } });
    if (pathname === "/api/consent/marketing-email" && route.request().method() === "PUT") {
      const body = route.request().postDataJSON() as { enabled?: boolean };
      return json(route, { marketingEmailConsent: body.enabled === true });
    }
    if (pathname === "/api/enrollments" && route.request().method() === "GET") {
      return json(route, { enrollments: options.learningEnrollments || [] });
    }
    if (pathname === "/api/saved-courses" && route.request().method() === "GET") {
      return json(route, { savedCourses: [] });
    }
    if (pathname === "/api/saved-courses" && route.request().method() === "POST") {
      if (options.savedMutationFailure === "save") return json(route, { message: "Saving courses is temporarily unavailable." }, 503);
      return json(route, { savedCourse: { course: courseId } });
    }
    if (pathname.startsWith("/api/saved-courses/") && route.request().method() === "DELETE") {
      if (options.savedMutationFailure === "remove") return json(route, { message: "Removing saved courses is temporarily unavailable." }, 503);
      return json(route, { success: true });
    }
    if (pathname === "/api/courses") {
      const params = new URL(route.request().url()).searchParams;
      const query = String(params.get("q") || "").trim().toLowerCase();
      const level = String(params.get("level") || "all").toLowerCase();
      const category = String(params.get("category") || "all").toLowerCase();
      const rows = (options.catalogCourses || []).filter((item) => {
        const searchable = [item.title, item.description, item.category].map((value) => String(value || "").toLowerCase()).join(" ");
        return (!query || searchable.includes(query))
          && (level === "all" || String(item.level || "").toLowerCase() === level)
          && (category === "all" || String(item.category || "").toLowerCase() === category);
      });
      return json(route, { courses: rows });
    }
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
    if (pathname === `/api/courses/${courseId}/learn`) {
      return json(route, { course });
    }
    if (pathname === `/api/courses/${courseId}`) {
      if (options.missingCourse) {
        return json(route, { message: "The requested item could not be found." }, 404);
      }
      return json(route, { course });
    }
    if (pathname === "/api/payments/course/order" && route.request().method() === "POST" && options.checkoutOrderFailure) {
      return json(route, { message: "Checkout is temporarily unavailable. Please try again." }, 503);
    }
    if (pathname === `/api/reviews/courses/${courseId}`) {
      if (route.request().method() === "POST" && options.reviewMutationFailure) {
        return json(route, { message: "Review service is temporarily unavailable." }, 503);
      }
      return json(route, { reviews: [], stats: { count: 0, average: 0, distribution: {} } });
    }
    if (pathname === "/api/ai/practice-quiz" && route.request().method() === "POST" && options.practiceQuizFailure) {
      return json(route, { message: "Practice quiz generation is temporarily unavailable." }, 503);
    }
    if (pathname === "/api/billing/plans") return json(route, { plans: options.billingPlans || [] });
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
    const completionPrefix = `/api/progress/${courseId}/items/`;
    const completionMethod = route.request().method();
    if (
      pathname.startsWith(completionPrefix) &&
      pathname.endsWith("/complete") &&
      (completionMethod === "POST" || completionMethod === "DELETE")
    ) {
      const lessonId = decodeURIComponent(pathname.slice(completionPrefix.length).replace(/\/complete$/, ""));
      if (completionMethod === "POST") {
        if (!completedLessons.some((entry) => entry.lessonId === lessonId)) {
          completedLessons.push({ lessonId, type: "tutorial", completedAt: new Date().toISOString() });
        }
      } else {
        const completedIndex = completedLessons.findIndex((entry) => entry.lessonId === lessonId);
        if (completedIndex >= 0) completedLessons.splice(completedIndex, 1);
      }
      const totalLessons = Math.max(courseLessonCount, 1);
      return json(route, {
        progress: {
          _id: "progress-1",
          user: learner.id,
          course: courseId,
          completedLessons,
          completedCount: completedLessons.length,
          totalLessons,
          lastLessonId: completedLessons.at(-1)?.lessonId || null,
          percentage: Math.min(100, Math.round(completedLessons.length / totalLessons * 100)),
          lastAccessedAt: new Date().toISOString(),
        },
      });
    }
    if (pathname === `/api/progress/${courseId}`) {
      if (options.missingProgress) return json(route, { message: "Progress not found" }, 404);
      const totalLessons = courseLessonCount || stages.reduce((count, stage) => count + (Array.isArray(stage.lessonIds) ? stage.lessonIds.length : 0), 0);
      return json(route, {
        progress: {
          _id: "progress-1",
          user: learner.id,
          course: courseId,
          completedLessons,
          completedCount: completedLessons.length,
          totalLessons,
          lastLessonId: completedLessons.at(-1)?.lessonId || null,
          percentage: totalLessons ? Math.min(100, Math.round(completedLessons.length / totalLessons * 100)) : 0,
          lastAccessedAt: completedLessons.length ? completedLessons.at(-1)?.completedAt : null,
        },
      });
    }
    if (pathname === "/api/achievements/me") return json(route, { stats: null });
    if (pathname === "/api/me/learning-pace") return json(route, { success: true });
    // Keep unrelated optional widgets deterministic without introducing real services.
    return json(route, {});
  });
}

test.describe("privacy and consent controls", () => {
  test("Google Identity SDK is not loaded on pages without Google sign-in UI", async ({ page }) => {
    await mockAppApi(page, { authenticated: true });
    await page.goto(baseURL + "/home");
    await expect(page.locator("#main-content")).toBeVisible();
    await expect(page.locator('script[src="https://accounts.google.com/gsi/client"]')).toHaveCount(0);
    await expect(page.locator('script[data-bfs-google-identity="true"]')).toHaveCount(0);
  });

  test("push permission is not requested until the learner explicitly enables it", async ({ page }) => {
    await page.addInitScript(() => {
      if (!("Notification" in window)) return;
      const notificationType = window.Notification;
      Object.defineProperty(notificationType, "requestPermission", {
        configurable: true,
        value: async () => {
          const target = window as Window & { __bfsPushPermissionPromptCount?: number };
          target.__bfsPushPermissionPromptCount = (target.__bfsPushPermissionPromptCount || 0) + 1;
          return "default";
        },
      });
    });
    await mockAppApi(page, { authenticated: true, pushAvailable: true });
    await page.goto(baseURL + "/settings");
    await expect(page.getByRole("heading", { name: "Desktop notifications" })).toBeVisible();
    await expect(page.getByRole("switch", { name: "Browser push notifications" })).toBeVisible();
    await page.waitForTimeout(200);
    const promptCount = await page.evaluate(() => (window as Window & { __bfsPushPermissionPromptCount?: number }).__bfsPushPermissionPromptCount || 0);
    expect(promptCount).toBe(0);
  });

  test("an anonymous cookie choice syncs to the account after sign-in", async ({ page }) => {
    const syncedChoices: Array<{ analytics?: boolean; marketing?: boolean }> = [];
    page.on("request", (request) => {
      const url = new URL(request.url());
      if (request.method() === "PUT" && url.pathname === "/api/consent/cookies") {
        try {
          syncedChoices.push(request.postDataJSON() as { analytics?: boolean; marketing?: boolean });
        } catch { /* A malformed request is not counted as a valid sync. */ }
      }
    });

    await mockAppApi(page, { authenticated: true, cookiePreferences: null });
    await page.goto(baseURL + "/home");
    await expect(page.getByRole("heading", { name: "Your privacy choices" })).toHaveCount(0);
    await expect.poll(() => syncedChoices.length).toBeGreaterThan(0);
    expect(syncedChoices[0]).toEqual({ analytics: false, marketing: false });
  });

  test("cookie banner offers reject, granular settings, and persists a choice", async ({ page }) => {
    await mockAppApi(page);
    await page.goto(baseURL + "/login");
    await expect(page.getByRole("heading", { name: "Your privacy choices" })).toBeVisible();

    await page.getByRole("button", { name: "Cookie settings", exact: true }).last().click();
    await expect(page.getByText("Essential storage", { exact: true })).toBeVisible();
    await expect(page.getByLabel(/Analytics/)).not.toBeChecked();
    await expect(page.getByLabel(/Marketing/)).not.toBeChecked();

    await page.getByRole("button", { name: "Reject optional", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Your privacy choices" })).toHaveCount(0);
    const rejected = await page.evaluate(() => JSON.parse(localStorage.getItem("bfs-cookie-consent-v1") || "{}"));
    expect(rejected.preferences.analytics).toBe(false);
    expect(rejected.preferences.marketing).toBe(false);

    await page.evaluate(() => window.dispatchEvent(new Event("bfs:open-cookie-settings")));
    await expect(page.getByRole("heading", { name: "Your privacy choices" })).toBeVisible();
    await expect(page.getByLabel(/Analytics/)).not.toBeChecked();
    await page.getByRole("button", { name: "Accept all" }).click();
    const accepted = await page.evaluate(() => JSON.parse(localStorage.getItem("bfs-cookie-consent-v1") || "{}"));
    expect(accepted.preferences.analytics).toBe(true);
    expect(accepted.preferences.marketing).toBe(true);
  });

  test("registration uses inline Terms and Privacy notice while marketing stays optional", async ({ page }) => {
    await mockAppApi(page);
    await page.goto(baseURL + "/register");
    const createAccount = page.getByRole("button", { name: "Create Account" });
    await expect(createAccount).toBeEnabled();
    const legalNotice = page.getByText(/By continuing, you agree to our/);
    await expect(legalNotice).toBeVisible();
    await expect(legalNotice.getByRole("link", { name: "Terms of Service" })).toHaveAttribute("href", "/legal/terms-of-service");
    await expect(legalNotice.getByRole("link", { name: "Privacy Policy" })).toHaveAttribute("href", "/legal/privacy-policy");
    await expect(page.getByLabel(/Send me optional product news/)).not.toBeChecked();
    await expect(page.getByRole("checkbox")).toHaveCount(1);
  });

  test("Google sign-in account gate asks for policy acknowledgement before profile completion", async ({ page }) => {
    await mockAppApi(page, {
      authenticated: true,
      consentStatus: {
        requiresLegalAcceptance: true,
        requiresProfileCompletion: true,
        policies: {
          termsVersion: "terms-fixture-v1",
          privacyVersion: "privacy-fixture-v1",
          termsPublished: true,
          privacyPublished: true,
          termsUrl: "/legal/terms-of-service",
          privacyUrl: "/legal/privacy-policy",
        },
        user: { authProvider: "google", marketingEmailConsent: false, phoneNumber: "", city: "", learningGoal: "" },
      },
    });
    await page.goto(baseURL + "/home");
    await expect(page.getByRole("heading", { name: "Review your agreements" })).toBeVisible();
    await expect(page.getByText("Version: terms-fixture-v1")).toBeVisible();
    await expect(page.getByText("Version: privacy-fixture-v1")).toBeVisible();
    await expect(page.getByRole("button", { name: "Agree and continue" })).toBeDisabled();
    await page.getByLabel(/I agree to the Terms of Service/).check();
    await page.getByLabel(/I have read and acknowledge the Privacy Policy/).check();
    await expect(page.getByRole("button", { name: "Agree and continue" })).toBeEnabled();
  });

  test("Google profile completion requires a valid phone when chosen and allows skipping", async ({ page }) => {
    await mockAppApi(page, {
      authenticated: true,
      consentStatus: {
        requiresLegalAcceptance: false,
        requiresProfileCompletion: true,
        policies: {},
        user: { authProvider: "google", marketingEmailConsent: false, phoneNumber: "", city: "", learningGoal: "" },
      },
    });
    await page.goto(baseURL + "/home");
    await expect(page.getByRole("heading", { name: "Add your contact details" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Save details and continue" })).toBeDisabled();
    await page.getByLabel(/Contact number/).fill("9876543210");
    await expect(page.getByRole("button", { name: "Save details and continue" })).toBeEnabled();
    await expect(page.getByRole("button", { name: "Skip for now" })).toBeVisible();
  });
});

test.describe("canonical learner navigation", () => {
  test("[PRICING-MODAL-CONSISTENCY-001] upgrade modal shows complete plan features and AI usage limits", async ({ page }) => {
    const sharedFeatures = [
      "Access published courses",
      "Normal course search",
      "Basic learning progress tracking",
      "Build with AI",
      "Personalized learning roadmaps",
      "Project-based learning",
    ];
    await mockAppApi(page, {
      billingPlans: [
        {
          _id: "premium-plan", name: "Premium", price: 399, currency: "INR", billingInterval: "monthly", isActive: true,
          features: [...sharedFeatures, "Advanced AI learning assistant (summary, notes & lesson Q&A)", "Personalized study planning", "Priority learning recommendations"],
          limits: { ai_course_builds_per_month: 20, advanced_ai_questions_per_month: 500, advanced_ai_insights_per_month: 100, ai_quiz_generations_per_month: 200 },
        },
        {
          _id: "pro-plan", name: "Pro", price: 199, currency: "INR", billingInterval: "monthly", isActive: true,
          features: sharedFeatures,
          limits: { ai_course_builds_per_month: 5, advanced_ai_questions_per_month: 100, advanced_ai_insights_per_month: 30, ai_quiz_generations_per_month: 50 },
        },
        {
          _id: "free-plan", name: "Free", price: 0, currency: "INR", billingInterval: "monthly", isActive: true,
          features: sharedFeatures.slice(0, 3),
          limits: { ai_course_builds_per_month: 0, advanced_ai_questions_per_month: 0, advanced_ai_insights_per_month: 0, ai_quiz_generations_per_month: 20 },
        },
      ],
    });
    await page.goto(baseURL + "/home");
    await page.evaluate(() => window.dispatchEvent(new CustomEvent("bfs:feature-gated", {
      detail: { feature: "advanced_ai_paths", currentPlan: "Pro" },
    })));

    const dialog = page.getByRole("dialog", { name: "Take your learning further." });
    await expect(dialog).toBeVisible();
    const proCard = dialog.getByRole("button", { name: "Select Pro plan" });
    await expect(proCard.getByText("AI usage limits", { exact: true })).toBeVisible();
    await expect(proCard.getByText("Advanced AI questions", { exact: true })).toBeVisible();
    await expect(proCard.getByText("100 / month", { exact: true })).toBeVisible();
    await expect(proCard.getByText("AI quiz generations", { exact: true })).toBeVisible();
    await expect(proCard.getByText("50 / month", { exact: true })).toBeVisible();
    await expect(proCard.getByText("YouTube discovery courses", { exact: true })).toBeVisible();
    await expect(proCard.getByText("Not configured", { exact: true })).toHaveCount(2);

    const premiumCard = dialog.getByRole("button", { name: "Select Premium plan" });
    await expect(premiumCard.getByText("Priority learning recommendations", { exact: true })).toBeVisible();
    await expect(dialog.getByText("+3 more features", { exact: true })).toHaveCount(0);
    // The modal and pricing page must be driven by the same API plan contract.
    for (const feature of sharedFeatures) {
      await expect(proCard.getByText(feature, { exact: true })).toBeVisible();
    }
    await expect(proCard.getByText("AI course builds", { exact: true })).toBeVisible();
    await expect(proCard.getByText("5 / month", { exact: true })).toBeVisible();
    await expect(proCard.getByText("AI quiz generations", { exact: true })).toBeVisible();
    await expect(premiumCard.getByText("AI course builds", { exact: true })).toBeVisible();
    await expect(premiumCard.getByText("20 / month", { exact: true })).toBeVisible();
    const freeCard = dialog.getByRole("button", { name: "Select Free plan" });
    await expect(freeCard.getByText("Not included", { exact: true })).toHaveCount(3);
    await expect(freeCard.getByText("forever", { exact: true })).toBeVisible();
  });

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

  test("Google sign-in explains missing backend configuration instead of silently disabling the button", async ({ page }) => {
    await mockAppApi(page);
    await page.goto(baseURL + "/login");
    await expect(page.getByRole("button", { name: "Continue with Google" })).toBeDisabled();
    await expect(page.getByRole("status").filter({ hasText: "Google sign-in is not configured on the backend" })).toBeVisible();
  });

  test("Google sign-in API failures offer a manual retry without repeated requests", async ({ page }) => {
    await mockAppApi(page);
    let configRequests = 0;
    await page.route("**/api/auth/google/config", async (route) => {
      configRequests += 1;
      await route.abort();
    });
    await page.goto(baseURL + "/login");
    await expect(page.getByRole("button", { name: "Retry Google sign-in setup" })).toBeEnabled();
    await expect(page.getByRole("status").filter({ hasText: "Could not load Google sign-in settings from the API" })).toBeVisible();
    await page.waitForTimeout(600);
    expect(configRequests).toBe(1);
  });

  test("public course details opens for a non-enrolled learner", async ({ page }) => {
    await mockAppApi(page, { course: courseFixture("course-fixture") });
    await page.goto(baseURL + "/courses/course-fixture");
    await expect(page.getByRole("heading", { name: "Course fixture" })).toBeVisible();
  });

  test("[EXP-COURSE-CARD-ACTION-001] saving from a catalogue card does not navigate or enroll", async ({ page }) => {
    const course = courseFixture("independent-card-actions", { title: "Independent Card Actions" });
    const mutations: string[] = [];
    page.on("request", (request) => {
      const url = new URL(request.url());
      if (request.method() !== "GET" && url.pathname.startsWith("/api/saved-courses")) {
        mutations.push(request.method() + " " + url.pathname);
      }
      if (request.method() === "POST" && url.pathname === "/api/enrollments/independent-card-actions") {
        mutations.push("UNEXPECTED ENROLLMENT");
      }
    });

    await mockAppApi(page, {
      authenticated: true,
      courseId: "independent-card-actions",
      course,
      catalogCourses: [course],
    });
    await page.goto(baseURL + "/explore");
    const card = page.locator(".bfs-course-card").filter({ hasText: "Independent Card Actions" }).first();
    const saveButton = card.getByRole("button", { name: "Save course" });
    await expect(saveButton).toHaveAttribute("aria-pressed", "false");
    await saveButton.click();

    await expect(card.getByRole("button", { name: "Remove course from saved courses" })).toHaveAttribute("aria-pressed", "true");
    await expect(page).toHaveURL(/\/explore(?:\?.*)?$/);
    expect(mutations).toEqual(["POST /api/saved-courses"]);
  });

  test("[EXP-COURSE-CARD-REVIEWS-001] zero-rating review links stay independent and display truthful empty state", async ({ page }) => {
    const course = courseFixture("zero-review-course", { title: "Zero Review Course", ratingCount: 0, ratingAverage: 0 });
    let enrollmentMutations = 0;
    page.on("request", (request) => {
      const url = new URL(request.url());
      if (request.method() === "POST" && url.pathname === "/api/enrollments/zero-review-course") enrollmentMutations += 1;
    });

    await mockAppApi(page, { courseId: "zero-review-course", course, catalogCourses: [course] });
    await page.goto(baseURL + "/explore");
    const card = page.locator(".bfs-course-card").filter({ hasText: "Zero Review Course" }).first();
    const reviewsLink = card.getByRole("link", { name: "View course reviews. No ratings yet." });
    await expect(reviewsLink).toBeVisible();
    await expect(reviewsLink).toContainText("No ratings yet");
    await reviewsLink.click();

    await expect(page).toHaveURL(/\/courses\/zero-review-course\?tab=reviews#reviews$/);
    await expect(page.getByRole("heading", { name: "Ratings & Reviews" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "No published reviews yet" })).toBeVisible();
    await expect(page.getByText("0.0", { exact: true })).toHaveCount(0);
    expect(enrollmentMutations).toBe(0);
  });

  test("[EXP-COURSE-DETAILS-ROBUST-001] sparse course data and very long titles render without runtime errors", async ({ page }) => {
    const longTitle = "Foundations of Production-Grade Node.js APIs and Reliable Distributed Systems ".repeat(3).trim();
    const sparseCourse = {
      _id: "sparse-long-title-course",
      title: longTitle,
      isPublished: true,
      pricing: { mode: "free", price: 0, currency: "INR" },
      modules: [],
    } as unknown as ReturnType<typeof courseFixture>;
    const pageErrors: string[] = [];
    page.on("pageerror", (error) => pageErrors.push(error.message));

    await mockAppApi(page, { courseId: "sparse-long-title-course", course: sparseCourse });
    await page.goto(baseURL + "/courses/sparse-long-title-course");

    await expect(page.getByRole("heading", { name: longTitle })).toBeVisible();
    await expect(page.getByText("Curriculum content will be added soon.", { exact: true }).first()).toBeVisible();
    await expect(page.getByRole("button", { name: "Sign in to enroll" })).toBeVisible();
    expect(pageErrors).toEqual([]);
  });

  test("free course offers individual enrollment and subscription options without extra green notices", async ({ page }) => {
    await mockAppApi(page, { course: courseFixture("course-fixture") });
    await page.goto(baseURL + "/courses/course-fixture");
    await expect(page.getByRole("heading", { name: "Course fixture" })).toBeVisible();
    await expect(page.getByRole("radio", { name: /Explore subscription plans/ })).toBeVisible();
    await expect(page.getByRole("radio", { name: /Enroll individually/ })).toBeVisible();
    await expect(page.getByText("Free", { exact: true }).first()).toBeVisible();
    await expect(page.getByRole("button", { name: "Sign in to enroll" })).toBeVisible();
    await expect(page.getByText("Course price", { exact: true })).toHaveCount(0);
    await expect(page.getByText("Your current plan includes this course", { exact: true })).toHaveCount(0);
  });

  test("[DETAIL-PURCHASE-ORDER-FAILURE-001] checkout order failure is recoverable", async ({ page }) => {
    let orderRequests = 0;
    page.on("request", (request) => {
      if (request.url().endsWith("/api/payments/course/order") && request.method() === "POST") orderRequests += 1;
    });
    await mockAppApi(page, {
      authenticated: true,
      course: courseFixture("course-fixture", { pricing: { mode: "paid", price: 499, currency: "INR" } }),
      checkoutOrderFailure: true,
    });
    await page.goto(baseURL + "/courses/course-fixture");
    await expect(page.getByRole("heading", { name: "Course fixture" })).toBeVisible();
    await page.getByRole("radio", { name: /Buy individual course/ }).check();
    const buyButton = page.getByRole("button", { name: /Buy for/ }).last();
    await expect(buyButton).toBeEnabled();
    await buyButton.click();
    await expect(page.getByRole("alert")).toContainText("Checkout is temporarily unavailable. Please try again.");
    await expect(buyButton).toBeEnabled();
    await buyButton.click();
    await expect.poll(() => orderRequests).toBe(2);
    await expect(buyButton).toBeEnabled();
  });

  test("free course offers current-plan enrollment without a duplicate green notice", async ({ page }) => {
    await mockAppApi(page, {
      authenticated: true,
      hasPlanAccess: true,
      course: courseFixture("course-fixture"),
    });
    await page.goto(baseURL + "/courses/course-fixture");
    await expect(page.getByRole("radio", { name: /Continue with current plan/ })).toBeVisible();
    await expect(page.getByRole("radio", { name: /Enroll individually/ })).toBeVisible();
    await expect(page.getByRole("button", { name: "Continue with current plan" }).first()).toBeVisible();
    await expect(page.getByText("Course price", { exact: true })).toHaveCount(0);
    await expect(page.getByText("Your current plan includes this course", { exact: true })).toHaveCount(0);
  });

  test("free course card opens course details before enrolling", async ({ page }) => {
    await mockAppApi(page, {
      authenticated: true,
      catalogCourses: [courseFixture("course-fixture")],
      course: courseFixture("course-fixture"),
    });
    let directEnrollmentRequests = 0;
    page.on("request", (request) => {
      const url = new URL(request.url());
      if (request.method() === "POST" && url.pathname === "/api/enrollments/course-fixture") {
        directEnrollmentRequests += 1;
      }
    });

    await page.goto(baseURL + "/explore");
    const enrollButton = page.getByRole("button", { name: "Enroll in this free course" });
    await expect(enrollButton).toBeVisible();
    await enrollButton.click();

    await expect(page).toHaveURL(/\/courses\/course-fixture(?:\?.*)?$/);
    await expect(page.getByRole("heading", { name: "Course fixture" })).toBeVisible();
    expect(directEnrollmentRequests).toBe(0);
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


test.describe("learner control and state regression", () => {
  test("[EXP-SEARCH-001] search, filters and clear filters synchronize with the catalog request", async ({ page }) => {
    const catalogCourses = [
      courseFixture("linux-admin", { title: "Linux Admin Essentials", level: "Advanced", category: "Development", description: "Linux command line administration" }),
      courseFixture("python-data", { title: "Python Data Basics", level: "Beginner", category: "Data", description: "Beginner data workflows" }),
    ];
    const catalogQueries: URLSearchParams[] = [];
    page.on("request", (request) => {
      const url = new URL(request.url());
      if (request.method() === "GET" && url.pathname === "/api/courses") catalogQueries.push(url.searchParams);
    });

    await mockAppApi(page, { catalogCourses });
    await page.goto(baseURL + "/explore");
    await expect(page.getByRole("heading", { name: "Find a course" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Linux Admin Essentials" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Python Data Basics" })).toBeVisible();

    await page.getByRole("textbox", { name: "Search courses" }).fill("linux");
    await page.getByRole("textbox", { name: "Search courses" }).press("Enter");
    await expect(page.getByRole("heading", { name: "Courses for “linux”" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Linux Admin Essentials" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Python Data Basics" })).toHaveCount(0);
    await expect.poll(() => catalogQueries.some((query) => query.get("q") === "linux")).toBe(true);

    await page.getByRole("combobox", { name: "Filter by level" }).selectOption("Advanced");
    await page.getByRole("combobox", { name: "Filter by category" }).selectOption("Development");
    await expect.poll(() => catalogQueries.some((query) => query.get("q") === "linux" && query.get("level") === "Advanced" && query.get("category") === "Development")).toBe(true);

    await page.getByRole("button", { name: /Clear filters/ }).click();
    await expect(page.getByRole("heading", { name: "All available courses" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Linux Admin Essentials" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Python Data Basics" })).toBeVisible();
    await expect(page.getByRole("combobox", { name: "Filter by level" })).toHaveValue("all");
    await expect(page.getByRole("combobox", { name: "Filter by category" })).toHaveValue("all");
    await expect.poll(() => catalogQueries.some((query) => !query.has("q") && !query.has("level") && !query.has("category"))).toBe(true);
  });

  test("[EXP-CATALOG-SORT-PAGE-001] catalog sort and pagination operate on the complete filtered result set", async ({ page }) => {
    const titles = ["Zeta Course", "Alpha Course", ...Array.from({ length: 12 }, (_, index) => "Course " + String(index + 3).padStart(2, "0"))];
    const catalogCourses = titles.map((title, index) => courseFixture("catalog-" + index, { title, category: "Development", level: "Beginner" }));
    await mockAppApi(page, { catalogCourses });
    await page.goto(baseURL + "/explore");

    await expect(page.getByRole("heading", { name: "All available courses" })).toBeVisible();
    await expect(page.getByRole("navigation", { name: "Course pagination" }).getByText("Page 1 of 2")).toBeVisible();
    const grid = page.locator(".bfs-course-results-grid").last();
    await expect(grid.getByRole("heading")).toHaveCount(12);

    await page.getByRole("combobox", { name: "Sort courses" }).selectOption("title");
    await expect(grid.getByRole("heading").first()).toHaveText("Alpha Course");
    await expect(page.getByRole("heading", { name: "Zeta Course", exact: true })).toHaveCount(0);
    await page.getByRole("button", { name: "Next course page" }).click();
    await expect(page.getByRole("navigation", { name: "Course pagination" }).getByText("Page 2 of 2")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Zeta Course", exact: true })).toBeVisible();
    await expect(grid.getByRole("heading")).toHaveCount(2);
    await page.getByRole("button", { name: "Previous course page" }).click();
    await expect(page.getByRole("navigation", { name: "Course pagination" }).getByText("Page 1 of 2")).toBeVisible();
  });

  test("[EXP-CATALOG-LOADING-001] course catalogue shows loading skeletons until the request settles", async ({ page }) => {
    let releaseCatalog: (() => void) | undefined;
    const pendingCatalog = new Promise<void>((resolve) => { releaseCatalog = resolve; });
    const loadingCourse = courseFixture("catalog-loading", { title: "Loaded after skeleton" });
    await mockAppApi(page);
    await page.route("**/api/courses**", async (route) => {
      await pendingCatalog;
      return json(route, { courses: [loadingCourse], pagination: { page: 1, limit: 50, total: 1, pages: 1 } });
    });

    await page.goto(baseURL + "/explore");
    await expect(page.getByRole("heading", { name: "All available courses" })).toBeVisible();
    await expect(page.locator(".bfs-course-results-grid .animate-pulse").first()).toBeVisible();
    releaseCatalog?.();
    await expect(page.getByRole("heading", { name: "Loaded after skeleton" })).toBeVisible();
    await expect(page.locator(".bfs-course-results-grid .animate-pulse")).toHaveCount(0);
  });

  test("[EXP-CATALOG-RETRY-001] course catalogue failure can be retried without reloading the page", async ({ page }) => {
    let requests = 0;
    const retryCourse = courseFixture("catalog-retry", { title: "Recovered catalogue course" });
    await mockAppApi(page);
    await page.route("**/api/courses**", async (route) => {
      requests += 1;
      if (requests === 1) return route.abort("internetdisconnected");
      return json(route, { courses: [retryCourse], pagination: { page: 1, limit: 50, total: 1, pages: 1 } });
    });

    await page.goto(baseURL + "/explore");
    await expect(page.getByRole("alert")).toContainText("Check your internet connection and try again.");
    await expect(page.getByRole("button", { name: "Retry loading courses" })).toBeEnabled();
    await page.getByRole("button", { name: "Retry loading courses" }).click();

    await expect.poll(() => requests).toBe(2);
    await expect(page.getByRole("heading", { name: "Recovered catalogue course" })).toBeVisible();
    await expect(page.getByRole("alert")).toHaveCount(0);
  });

  test("[LEARN-TABS-001] My Learning uses saved status snapshots for all three tabs without per-course progress requests", async ({ page }) => {
    const inProgressCourse = courseFixture("node-api", { title: "Node API Foundations" });
    const notStartedCourse = courseFixture("sql-basics", { title: "SQL for Beginners", category: "Data" });
    const completedCourse = courseFixture("git-basics", { title: "Git Essentials" });
    const perCourseRequests: string[] = [];
    page.on("request", (request) => {
      const url = new URL(request.url());
      if (request.method() === "GET" && (url.pathname.startsWith("/api/progress/") || url.pathname.startsWith("/api/enrollments/course/"))) {
        perCourseRequests.push(url.pathname);
      }
    });

    await mockAppApi(page, {
      authenticated: true,
      learningEnrollments: [
        learningEnrollmentFixture(inProgressCourse, "in-progress", { completedCount: 0, totalLessons: 1, percentage: 0, nextLessonId: "lesson-1" }),
        learningEnrollmentFixture(notStartedCourse, "not-started", { completedCount: 0, totalLessons: 1, percentage: 0, nextLessonId: "lesson-1" }),
        learningEnrollmentFixture(completedCourse, "completed", { completedCount: 1, totalLessons: 1, percentage: 100, nextLessonId: null }),
      ],
    });
    await page.goto(baseURL + "/my-learning");
    await expect(page.getByRole("heading", { name: "My learning" })).toBeVisible();
    await expect(page.locator('[data-course-status="in-progress"]')).toHaveCount(1);
    await expect(page.locator('[data-course-status="in-progress"] .bfs-course-card__title')).toContainText("Node API Foundations");
    await expect(page.getByRole("link", { name: "Continue Node API Foundations" })).toHaveAttribute("href", "/learn/node-api/lesson-1");

    const statusNav = page.getByRole("navigation", { name: "Course status" });
    await statusNav.getByRole("button", { name: /Not started/ }).click();
    await expect(page.locator('[data-course-status="not-started"]')).toHaveCount(1);
    await expect(page.locator('[data-course-status="not-started"] .bfs-course-card__title')).toContainText("SQL for Beginners");

    await statusNav.getByRole("button", { name: /Completed/ }).click();
    await expect(page.locator('[data-course-status="completed"]')).toHaveCount(1);
    await expect(page.locator('[data-course-status="completed"] .bfs-course-card__title')).toContainText("Git Essentials");
    await expect(page.getByRole("link", { name: "Review Git Essentials" })).toHaveAttribute("href", "/learn/git-basics");

    expect(perCourseRequests, "My Learning should use the single batched enrollment response, not fetch progress once per course").toEqual([]);
  });

  test("[PLAYER-COMPLETE-001] completion updates the lesson action and sidebar immediately without a page refresh", async ({ page }) => {
    let completionRequests = 0;
    let progressReads = 0;
    page.on("request", (request) => {
      const url = new URL(request.url());
      if (request.method() === "POST" && url.pathname === "/api/progress/course-fixture/items/lesson-1/complete") completionRequests += 1;
      if (request.method() === "GET" && url.pathname === "/api/progress/course-fixture") progressReads += 1;
    });
    await mockAppApi(page, { authenticated: true, enrolled: true });
    await page.goto(baseURL + "/learn/course-fixture/lesson-1");

    const completeButton = page.getByRole("button", { name: "Mark complete" });
    await expect(completeButton).toBeVisible();
    await expect.poll(() => progressReads).toBe(1);
    await completeButton.click();

    await expect(page.getByRole("button", { name: "Completed", exact: true })).toBeDisabled();
    await expect(page.getByRole("button", { name: "Mark Lesson one incomplete" })).toBeVisible();
    expect(completionRequests).toBe(1);
    expect(progressReads).toBe(1);
  });

  test("[PLAYER-UNCOMPLETE-001] marking a completed lesson incomplete updates the UI without refreshing", async ({ page }) => {
    let completionRequests = 0;
    let uncompletionRequests = 0;
    let progressReads = 0;
    page.on("request", (request) => {
      const url = new URL(request.url());
      if (url.pathname === "/api/progress/course-fixture") progressReads += request.method() === "GET" ? 1 : 0;
      if (url.pathname === "/api/progress/course-fixture/items/lesson-1/complete" && request.method() === "POST") completionRequests += 1;
      if (url.pathname === "/api/progress/course-fixture/items/lesson-1/complete" && request.method() === "DELETE") uncompletionRequests += 1;
    });
    await mockAppApi(page, { authenticated: true, enrolled: true });
    await page.goto(baseURL + "/learn/course-fixture/lesson-1");

    await expect.poll(() => progressReads).toBe(1);
    await page.getByRole("button", { name: "Mark complete" }).click();
    const incompleteAction = page.getByRole("button", { name: "Mark Lesson one incomplete" });
    await expect(incompleteAction).toBeVisible();

    await incompleteAction.click();
    await expect(page.getByRole("button", { name: "Mark Lesson one complete" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Mark complete" })).toBeVisible();
    expect(completionRequests).toBe(1);
    expect(uncompletionRequests).toBe(1);
    expect(progressReads).toBe(1);
  });

  test("[PLAYER-QUIZ-COMPLETE-001] first quiz submission completes the lesson even when the learner fails", async ({ page }) => {
    let gradeRequests = 0;
    let completionRequests = 0;
    const quizCourse = courseFixture("course-fixture", {
      title: "Quiz completion fixture",
      modules: [{
        _id: "module-1",
        title: "Assessment module",
        lessons: [{
          _id: "lesson-1",
          title: "Quiz lesson",
          type: "quiz",
          description: "Choose an answer to test automatic lesson completion.",
          duration: "5 min",
          quiz: { scope: "lesson", questionCount: 1, passingScore: 70 }
        }]
      }]
    });

    await mockAppApi(page, { authenticated: true, enrolled: true, course: quizCourse });
    await page.route("**/api/ai/quiz", async (route) => {
      if (route.request().method() !== "POST") return route.fallback();
      return json(route, {
        quiz: {
          quizBankId: "quiz-bank-1",
          questions: [{
            id: "q1",
            question: "Which option is correct?",
            options: [{ id: "A", text: "Incorrect option" }, { id: "B", text: "Correct option" }]
          }],
          passingScore: 70
        }
      });
    });
    await page.route("**/api/ai/practice-quiz/submit", async (route) => {
      if (route.request().method() !== "POST") return route.fallback();
      gradeRequests += 1;
      return json(route, {
        score: 0,
        passed: false,
        results: [{ questionId: "q1", correctOptionId: "B", explanation: "Option B is correct." }]
      });
    });
    page.on("request", (request) => {
      const url = new URL(request.url());
      if (request.method() === "POST" && url.pathname === "/api/progress/course-fixture/items/lesson-1/complete") completionRequests += 1;
    });

    await page.goto(baseURL + "/learn/course-fixture/lesson-1");
    await expect(page.getByText("Which option is correct?")).toBeVisible();
    await page.getByRole("button", { name: /Incorrect option/ }).click();
    await page.getByRole("button", { name: "Submit Quiz" }).click();

    await expect(page.getByText("Your score: 0%")).toBeVisible();
    await expect(page.getByRole("button", { name: "Finish Course" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Mark Quiz lesson incomplete" })).toBeVisible();
    expect(gradeRequests).toBe(1);
    expect(completionRequests).toBe(1);
  });

  test("[PLAYER-QUIZ-RECOVERY-001] a failed progress save preserves the grade and retry does not grade again", async ({ page }) => {
    let gradeRequests = 0;
    let completionRequests = 0;
    const quizCourse = courseFixture("course-fixture", {
      title: "Quiz recovery fixture",
      modules: [{
        _id: "module-1",
        title: "Assessment module",
        lessons: [{
          _id: "lesson-1",
          title: "Quiz lesson",
          type: "quiz",
          description: "A quiz whose progress save can be retried.",
          duration: "5 min",
          quiz: { scope: "lesson", questionCount: 1, passingScore: 70 }
        }]
      }]
    });

    await mockAppApi(page, { authenticated: true, enrolled: true, course: quizCourse });
    await page.route("**/api/ai/quiz", async (route) => {
      if (route.request().method() !== "POST") return route.fallback();
      return json(route, {
        quiz: {
          quizBankId: "quiz-bank-1",
          questions: [{
            id: "q1",
            question: "Which option is correct?",
            options: [{ id: "A", text: "Incorrect option" }, { id: "B", text: "Correct option" }]
          }],
          passingScore: 70
        }
      });
    });
    await page.route("**/api/ai/practice-quiz/submit", async (route) => {
      if (route.request().method() !== "POST") return route.fallback();
      gradeRequests += 1;
      return json(route, {
        score: 0,
        passed: false,
        results: [{ questionId: "q1", correctOptionId: "B", explanation: "Option B is correct." }]
      });
    });
    await page.route("**/api/progress/course-fixture/items/lesson-1/complete", async (route) => {
      if (route.request().method() !== "POST") return route.fallback();
      completionRequests += 1;
      if (completionRequests === 1) {
        return json(route, { message: "Progress service is temporarily unavailable." }, 503);
      }
      return json(route, {
        progress: {
          _id: "progress-1",
          user: learner.id,
          course: "course-fixture",
          completedLessons: [{ lessonId: "lesson-1", type: "quiz", completedAt: new Date().toISOString() }],
          completedCount: 1,
          totalLessons: 1,
          percentage: 100,
          lastLessonId: "lesson-1",
          lastAccessedAt: new Date().toISOString()
        }
      });
    });

    await page.goto(baseURL + "/learn/course-fixture/lesson-1");
    await expect(page.getByText("Which option is correct?")).toBeVisible();
    await page.getByRole("button", { name: /Incorrect option/ }).click();
    await page.getByRole("button", { name: "Submit Quiz" }).click();

    await expect(page.getByText("Your score: 0%")).toBeVisible();
    await expect(page.getByRole("alert")).toContainText("Quiz graded, but lesson completion could not be saved");
    await expect(page.getByRole("button", { name: "Mark Quiz lesson complete" })).toBeVisible();
    expect(gradeRequests).toBe(1);
    expect(completionRequests).toBe(1);

    await page.getByRole("button", { name: "Mark Quiz lesson complete" }).click();
    await expect(page.getByRole("button", { name: "Mark Quiz lesson incomplete" })).toBeVisible();
    await expect(page.getByText("Your score: 0%")).toBeVisible();
    expect(gradeRequests).toBe(1);
    expect(completionRequests).toBe(2);
  });

  test("[PRICING-CURRENCY-CONSISTENCY-001] card, course details, and subscription plans preserve fractional currency amounts", async ({ page }) => {
    const courseId = "fractional-course";
    const amount = 99.5;
    const paidCourse = courseFixture(courseId, {
      title: "Fractional Price Course",
      pricing: { mode: "paid", price: amount, saleEnabled: false, currency: "INR" }
    });
    await mockAppApi(page, {
      courseId,
      catalogCourses: [paidCourse],
      course: paidCourse,
      billingPlans: [{
        _id: "fractional-plan",
        name: "Fractional plan",
        price: amount,
        currency: "INR",
        billingInterval: "monthly",
        features: ["Core access"]
      }]
    });

    await page.goto(baseURL + "/explore");
    const catalogGrid = page.locator(".bfs-course-results-grid").last();
    await expect(catalogGrid.getByRole("heading", { name: "Fractional Price Course" })).toBeVisible();
    await expect(catalogGrid.getByText("₹99.5", { exact: true })).toBeVisible();

    await page.goto(baseURL + "/courses/" + courseId);
    await expect(page.getByRole("heading", { name: "Fractional Price Course" })).toBeVisible();
    await expect(page.getByText("₹99.5", { exact: true }).first()).toBeVisible();

    await page.goto(baseURL + "/pricing");
    await expect(page.getByRole("heading", { name: "Fractional plan" })).toBeVisible();
    await expect(page.getByText("₹99.5", { exact: true }).first()).toBeVisible();
  });

  test("[DETAIL-REVIEWS-001] course reviews tab exposes a real empty state and refreshes its data", async ({ page }) => {
    let reviewReads = 0;
    page.on("request", (request) => {
      const url = new URL(request.url());
      if (request.method() === "GET" && url.pathname === "/api/reviews/courses/course-fixture") reviewReads += 1;
    });
    await mockAppApi(page, { course: courseFixture("course-fixture") });
    await page.goto(baseURL + "/courses/course-fixture");
    await expect(page.getByRole("heading", { name: "Ratings & Reviews" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "No published reviews yet" })).toBeVisible();
    await page.getByRole("button", { name: "Refresh reviews" }).click();
    await expect.poll(() => reviewReads).toBeGreaterThan(1);
    await expect(page.getByRole("heading", { name: "No published reviews yet" })).toBeVisible();
  });

  test("[LEARN-SAVE-001] save and unsave actions stay synchronized with their API mutations", async ({ page }) => {
    const course = courseFixture("save-state-course", { title: "Save State Course" });
    const calls: Array<{ method: string; path: string }> = [];
    page.on("request", (request) => {
      const url = new URL(request.url());
      if (url.pathname.startsWith("/api/saved-courses") && request.method() !== "GET") {
        calls.push({ method: request.method(), path: url.pathname });
      }
    });

    await mockAppApi(page, {
      authenticated: true,
      learningEnrollments: [learningEnrollmentFixture(course, "not-started")],
    });
    await page.goto(baseURL + "/my-learning?tab=not-started");
    const card = page.locator('[data-course-status="not-started"]');
    const saveButton = card.getByRole("button", { name: "Save course" });
    await expect(saveButton).toHaveAttribute("aria-pressed", "false");
    await saveButton.click();

    const removeButton = card.getByRole("button", { name: "Remove from saved courses" });
    await expect(removeButton).toHaveAttribute("aria-pressed", "true");
    await removeButton.click();
    await expect(card.getByRole("button", { name: "Save course" })).toHaveAttribute("aria-pressed", "false");
    expect(calls).toEqual([
      { method: "POST", path: "/api/saved-courses" },
      { method: "DELETE", path: "/api/saved-courses/save-state-course" },
    ]);
  });

  test("[LEARN-UNENROLL-001] cancel keeps enrollment, confirm removes it, and Undo restores it", async ({ page }) => {
    const course = courseFixture("unenroll-state-course", { title: "Unenroll State Course" });
    const mutations: string[] = [];
    page.on("request", (request) => {
      const url = new URL(request.url());
      if (url.pathname === "/api/enrollments/unenroll-state-course" && ["POST", "DELETE"].includes(request.method())) {
        mutations.push(request.method());
      }
    });

    await mockAppApi(page, {
      authenticated: true,
      learningEnrollments: [learningEnrollmentFixture(course, "not-started")],
    });
    await page.goto(baseURL + "/my-learning?tab=not-started");
    const card = page.locator('[data-course-status="not-started"]');
    await expect(card).toBeVisible();

    const actions = card.locator('summary[aria-label="Course actions for Unenroll State Course"]');
    await actions.click();
    await card.getByRole("button", { name: "Unenroll", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "Unenroll from this course?" });
    await expect(dialog).toBeVisible();
    await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
    await expect(card).toBeVisible();
    expect(mutations).toEqual([]);

    await actions.click();
    await card.getByRole("button", { name: "Unenroll", exact: true }).click();
    const confirmDialog = page.getByRole("dialog", { name: "Unenroll from this course?" });
    await confirmDialog.getByRole("button", { name: "Unenroll", exact: true }).click();
    await expect(page.locator('[data-course-status="not-started"]')).toHaveCount(0);
    await expect(page.getByRole("status").filter({ hasText: "Unenrolled from Unenroll State Course." })).toBeVisible();
    await expect(mutations).toEqual(["DELETE"]);

    await page.getByRole("button", { name: "Undo", exact: true }).click();
    await expect(page.locator('[data-course-status="not-started"]')).toContainText("Unenroll State Course");
    expect(mutations).toEqual(["DELETE", "POST"]);
  });

  test("[DETAIL-REVIEW-FAILURE-001] failed review submission preserves input and permits retry", async ({ page }) => {
    let submissions = 0;
    page.on("request", (request) => {
      if (request.url().endsWith("/api/reviews/courses/course-fixture") && request.method() === "POST") submissions += 1;
    });
    await mockAppApi(page, { authenticated: true, enrolled: true, hasPlanAccess: true, reviewMutationFailure: true });
    await page.goto(baseURL + "/courses/course-fixture?tab=reviews");
    await expect(page.getByRole("heading", { name: "Ratings & Reviews" })).toBeVisible();
    await page.getByRole("button", { name: "Rate 4 out of 5 stars" }).click();
    const comment = page.getByLabel("Your comment (optional)");
    await comment.fill("I want to keep this review if the service is temporarily down.");
    await page.getByRole("button", { name: "Submit review", exact: true }).click();
    await expect(page.getByRole("alert")).toContainText("Review service is temporarily unavailable.");
    await expect(comment).toHaveValue("I want to keep this review if the service is temporarily down.");
    await expect(page.getByRole("button", { name: "Submit review", exact: true })).toBeEnabled();
    await page.getByRole("button", { name: "Submit review", exact: true }).click();
    await expect.poll(() => submissions).toBe(2);
  });
  test("[DETAIL-REVIEW-SUBMIT-001] enrolled learners can submit a rating and comment", async ({ page }) => {
    let submittedReview: { rating?: number; comment?: string } | null = null;
    page.on("request", (request) => {
      const url = new URL(request.url());
      if (url.pathname === "/api/reviews/courses/course-fixture" && request.method() === "POST") {
        submittedReview = request.postDataJSON() as { rating?: number; comment?: string };
      }
    });

    await mockAppApi(page, {
      authenticated: true,
      enrolled: true,
      hasPlanAccess: true,
      course: courseFixture("course-fixture"),
    });
    await page.goto(baseURL + "/courses/course-fixture?tab=reviews");
    await expect(page.getByRole("heading", { name: "Ratings & Reviews" })).toBeVisible();
    await page.getByRole("button", { name: "Rate 4 out of 5 stars" }).click();
    await page.getByLabel("Your comment (optional)").fill("Clear explanations and useful practice.");
    await page.getByRole("button", { name: "Submit review", exact: true }).click();
    await expect(page.getByRole("status").filter({ hasText: "Your review has been saved." })).toBeVisible();
    expect(submittedReview).toEqual({
      rating: 4,
      comment: "Clear explanations and useful practice.",
    });
  });
  test("[DETAIL-REVIEW-UPDATE-001] editing a learner review updates the existing review", async ({ page }) => {
    let updateRequests = 0;
    let updatePayload: { rating?: number; comment?: string } | null = null;
    let reviewRecord: Record<string, unknown> = {
      _id: "existing-review-fixture",
      rating: 3,
      comment: "The original course feedback.",
      moderationStatus: "approved",
      user: { _id: learner.id, id: learner.id, name: learner.name },
      createdAt: "2026-10-20T10:00:00.000Z",
    };

    await mockAppApi(page, {
      authenticated: true,
      enrolled: true,
      hasPlanAccess: true,
      course: courseFixture("course-fixture"),
    });
    await page.route("**/api/reviews/courses/course-fixture", async (route) => {
      if (route.request().method() === "GET") {
        const rating = Number(reviewRecord.rating || 0);
        return json(route, {
          reviews: [reviewRecord],
          stats: { count: 1, average: rating, distribution: { [String(rating)]: 1 } },
        });
      }
      if (route.request().method() === "POST") {
        updateRequests += 1;
        updatePayload = route.request().postDataJSON() as { rating?: number; comment?: string };
        reviewRecord = {
          ...reviewRecord,
          rating: updatePayload.rating,
          comment: updatePayload.comment,
        };
        return json(route, { review: reviewRecord });
      }
      return route.continue();
    });

    await page.goto(baseURL + "/courses/course-fixture?tab=reviews");
    await expect(page.getByRole("heading", { name: "Ratings & Reviews" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Update review", exact: true }).first()).toBeVisible();
    const comment = page.getByLabel("Your comment (optional)");
    await expect(comment).toHaveValue("The original course feedback.");
    await page.getByRole("button", { name: "Rate 5 out of 5 stars" }).first().click();
    await comment.fill("The updated course feedback is clearer and more useful.");
    await page.getByRole("button", { name: "Update review", exact: true }).first().click();

    await expect(page.getByRole("status").filter({ hasText: "Your review has been saved." }).first()).toBeVisible();
    await expect(comment).toHaveValue("The updated course feedback is clearer and more useful.");
    expect(updateRequests).toBe(1);
    expect(updatePayload).toEqual({
      rating: 5,
      comment: "The updated course feedback is clearer and more useful.",
    });
  });

  test("[LEARN-SAVE-FAILURE-001] failed save restores the previous state and exposes a retryable error", async ({ page }) => {
    const course = courseFixture("save-failure-course", { title: "Save Failure Course" });
    let saveAttempts = 0;
    page.on("request", (request) => {
      if (request.url().includes("/api/saved-courses") && request.method() === "POST") saveAttempts += 1;
    });

    await mockAppApi(page, {
      authenticated: true,
      savedMutationFailure: "save",
      learningEnrollments: [learningEnrollmentFixture(course, "not-started")],
    });
    await page.goto(baseURL + "/my-learning?tab=not-started");
    const card = page.locator('[data-course-status="not-started"]');
    const saveButton = card.getByRole("button", { name: "Save course" });
    await saveButton.click();

    await expect(card.getByRole("alert")).toContainText("Saving courses is temporarily unavailable.");
    await expect(card.getByRole("button", { name: "Save course" })).toHaveAttribute("aria-pressed", "false");
    await expect(card.getByRole("button", { name: "Remove from saved courses" })).toHaveCount(0);
    await expect(card.getByRole("button", { name: "Save course" })).toBeEnabled();
    expect(saveAttempts).toBe(1);
  });

  test("[PLAYER-NOTES-001] timestamped notes validate timestamps and persist across reload", async ({ page }) => {
    await mockAppApi(page, { authenticated: true, enrolled: true });
    await page.goto(baseURL + "/learn/course-fixture/lesson-1");
    await page.getByRole("tab", { name: "Notes" }).click();

    const noteEditor = page.getByPlaceholder("Write a note for this moment in the lecture...");
    await noteEditor.fill("Remember the core concept and revisit the example.");
    await page.getByRole("button", { name: "Save note" }).click();
    await expect(page.getByText("Enter a timestamp such as 01:25 or 1:02:15.")).toBeVisible();
    await expect(page.getByText("No notes yet")).toBeVisible();

    await page.getByLabel("Video timestamp").fill("01:25");
    await page.getByRole("button", { name: "Save note" }).click();
    await expect(page.getByText("Timestamped note saved.")).toBeVisible();
    await expect(page.getByText("Remember the core concept and revisit the example.")).toBeVisible();
    await expect(page.getByRole("button", { name: "Jump to 01:25" })).toBeVisible();

    await page.reload();
    await page.getByRole("tab", { name: "Notes" }).click();
    await expect(page.getByText("Remember the core concept and revisit the example.")).toBeVisible();
    await page.getByRole("button", { name: "Delete note" }).click();
    await expect(page.getByText("No notes yet")).toBeVisible();
    await expect(page.getByText("Note removed.")).toBeVisible();
  });

  test("[PLAYER-LESSON-NAV-001] previous and next follow curriculum order and update the canonical URL", async ({ page }) => {
    const course = courseFixture("course-fixture", {
      modules: [{
        _id: "module-1",
        title: "Module one",
        lessons: [
          { _id: "lesson-1", title: "Lesson one", type: "tutorial", description: "", duration: "5 min" },
          { _id: "lesson-2", title: "Lesson two", type: "tutorial", description: "", duration: "7 min" },
        ],
      }],
    });
    await mockAppApi(page, { authenticated: true, enrolled: true, course });
    await page.goto(baseURL + "/learn/course-fixture/lesson-1");
    await expect(page.getByRole("heading", { name: "Lesson one", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Previous", exact: true })).toBeDisabled();
    await page.getByRole("button", { name: "Next", exact: true }).click();
    await expect(page).toHaveURL(/\/learn\/course-fixture\/lesson-2$/);
    await expect(page.getByRole("heading", { name: "Lesson two", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Previous", exact: true })).toBeEnabled();
    await page.getByRole("button", { name: "Previous", exact: true }).click();
    await expect(page).toHaveURL(/\/learn\/course-fixture\/lesson-1$/);
    await expect(page.getByRole("heading", { name: "Lesson one", exact: true })).toBeVisible();
  });

  test("[PLAYER-PRACTICE-QUIZ-FAILURE-001] quiz generation failure is announced and can be retried", async ({ page }) => {
    let attempts = 0;
    page.on("request", (request) => {
      if (request.url().includes("/api/ai/practice-quiz") && request.method() === "POST") attempts += 1;
    });
    await mockAppApi(page, { authenticated: true, enrolled: true, practiceQuizFailure: true });
    await page.goto(baseURL + "/learn/course-fixture/lesson-1");
    await page.getByRole("tab", { name: "Quiz" }).click();
    await expect(page.getByRole("alert")).toContainText("Practice quiz generation is temporarily unavailable.");
    const retry = page.getByRole("button", { name: "Generate Practice Quiz" });
    await expect(retry).toBeEnabled();
    await retry.click();
    await expect.poll(() => attempts).toBeGreaterThanOrEqual(2);
    await expect(page.getByRole("alert")).toContainText("Practice quiz generation is temporarily unavailable.");
  });
  test("[PLAYER-NOTES-FILTER-001] note filters and sort controls remain usable when there are no matching notes", async ({ page }) => {
    await mockAppApi(page, { authenticated: true, enrolled: true });
    await page.goto(baseURL + "/learn/course-fixture/lesson-1");
    await page.getByRole("tab", { name: "Notes" }).click();
    await expect(page.getByLabel("Filter notes by lecture")).toHaveValue("all");
    await page.getByLabel("Filter notes by lecture").selectOption("lesson-1");
    await page.getByLabel("Sort notes").selectOption("oldest");
    await expect(page.getByLabel("Filter notes by lecture")).toHaveValue("lesson-1");
    await expect(page.getByLabel("Sort notes")).toHaveValue("oldest");
    await expect(page.getByText("No notes yet")).toBeVisible();
  });
});

test.describe("public platform pages and footer", () => {
  test("public pages render the marketing footer and their main content", async ({ page }) => {
    const pages = [
      { path: "/about", heading: "Make your next learning step feel clear.", canonical: "https://buddyforstudy.example/about" },
      { path: "/contact", heading: "We want your learning experience to work for you.", canonical: "https://buddyforstudy.example/contact" },
      { path: "/faq", heading: "Frequently asked questions", canonical: "https://buddyforstudy.example/faq" },
    ];

    for (const item of pages) {
      await page.goto(baseURL + item.path);
      await expect(page.locator("main.bfs-public-page")).toBeVisible();
      await expect(page.getByRole("heading", { name: item.heading })).toBeVisible();
      await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", item.canonical);
      await expect(page.locator("footer.bfs-marketing-footer")).toBeVisible();
      await expect(page.getByRole("heading", { name: "BuddyForStudy", exact: true })).toBeVisible();
      await expect(page.getByRole("heading", { name: "Discover", exact: true })).toBeVisible();
      await expect(page.getByRole("heading", { name: "Plans & support", exact: true })).toBeVisible();
      await expect(page.getByRole("heading", { name: "Policies", exact: true })).toBeVisible();
    }
  });

  test("public aliases redirect to canonical information pages", async ({ page }) => {
    const aliases = [
      { path: "/about-us", canonical: "/about", canonicalUrl: "https://buddyforstudy.example/about" },
      { path: "/contact-us", canonical: "/contact", canonicalUrl: "https://buddyforstudy.example/contact" },
      { path: "/help", canonical: "/faq", canonicalUrl: "https://buddyforstudy.example/faq" },
    ];
    for (const item of aliases) {
      await page.goto(baseURL + item.path);
      await expect(page).toHaveURL(new RegExp(item.canonical + "$"));
      await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", item.canonicalUrl);
    }
  });

  test("canonical metadata is not emitted for authentication or private learning routes", async ({ page }) => {
    await mockAppApi(page, { authenticated: true });
    await page.goto(baseURL + "/settings");
    await expect(page.locator('link[rel="canonical"]')).toHaveCount(0);
    await page.goto(baseURL + "/learn/course-fixture/lesson-1");
    await expect(page.locator('link[rel="canonical"]')).toHaveCount(0);
  });

  test("footer navigation points to supported destinations", async ({ page }) => {
    await page.goto(baseURL + "/about");
    const footer = page.locator("footer.bfs-marketing-footer");
    await expect(footer.getByRole("link", { name: /Explore courses/ })).toHaveAttribute("href", "/explore");
    await expect(footer.getByRole("link", { name: "Learning roadmaps" })).toHaveAttribute("href", "/explore?build=1");
    await expect(footer.getByRole("link", { name: "Plans & pricing" })).toHaveAttribute("href", "/pricing");
    await expect(footer.getByRole("link", { name: "Create an account" })).toHaveAttribute("href", "/register");
    await expect(footer.getByRole("link", { name: "About us" })).toHaveAttribute("href", "/about");
    await expect(footer.getByRole("link", { name: "Contact us" }).first()).toHaveAttribute("href", "/contact");
    await expect(footer.getByRole("link", { name: "Help centre & FAQs" })).toHaveAttribute("href", "/faq");
    await expect(footer.getByRole("link", { name: "All policies & accessibility" })).toHaveAttribute("href", "/legal");
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



test.describe("push notification prompt", () => {
  test("offers an in-app opt-in after app entry without opening the browser prompt automatically", async ({ page }) => {
    await page.addInitScript(() => {
      Object.defineProperty(window, "Notification", {
        configurable: true,
        value: {
          permission: "default",
          requestPermission: async () => {
            const state = window as unknown as { __nativePermissionPromptCalls?: number };
            state.__nativePermissionPromptCalls = (state.__nativePermissionPromptCalls || 0) + 1;
            return "default";
          },
        },
      });
      Object.defineProperty(window, "PushManager", { configurable: true, value: function PushManager() {} });
      Object.defineProperty(navigator, "serviceWorker", {
        configurable: true,
        value: { getRegistration: async () => null },
      });
      Object.defineProperty(window, "isSecureContext", { configurable: true, value: true });
    });

    await mockAppApi(page, { authenticated: true, pushAvailable: true });
    await page.goto(baseURL + "/home");

    await expect(page.getByRole("heading", { name: "Enable all notifications" })).toBeVisible();
    expect(await page.evaluate(() => (window as unknown as { __nativePermissionPromptCalls?: number }).__nativePermissionPromptCalls || 0)).toBe(0);

    await page.getByRole("button", { name: "Not now", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Enable all notifications" })).toHaveCount(0);

    await page.reload();
    await expect(page.getByRole("heading", { name: "Keep your learning moving" })).toHaveCount(0);
  });


  test("shows recovery instructions when browser push permission has been blocked", async ({ page }) => {
    await page.addInitScript(() => {
      Object.defineProperty(window, "Notification", {
        configurable: true,
        value: {
          permission: "denied",
          requestPermission: async () => {
            const state = window as unknown as { __nativePermissionPromptCalls?: number };
            state.__nativePermissionPromptCalls = (state.__nativePermissionPromptCalls || 0) + 1;
            return "denied";
          },
        },
      });
      Object.defineProperty(window, "PushManager", { configurable: true, value: function PushManager() {} });
      Object.defineProperty(navigator, "serviceWorker", {
        configurable: true,
        value: { getRegistration: async () => null },
      });
      Object.defineProperty(window, "isSecureContext", { configurable: true, value: true });
    });

    await mockAppApi(page, { authenticated: true, pushAvailable: true });
    await page.goto(baseURL + "/home");

    await expect(page.getByRole("heading", { name: "Notifications are blocked in your browser" })).toBeVisible();
    await expect(page.getByText(/change Notifications from Block to Allow/i)).toBeVisible();
    expect(await page.evaluate(() => (window as unknown as { __nativePermissionPromptCalls?: number }).__nativePermissionPromptCalls || 0)).toBe(0);

    await page.getByRole("button", { name: "Check permission again" }).click();
    await expect(page.getByRole("heading", { name: "Notifications are blocked in your browser" })).toBeVisible();
    expect(await page.evaluate(() => (window as unknown as { __nativePermissionPromptCalls?: number }).__nativePermissionPromptCalls || 0)).toBe(0);

    await page.getByRole("button", { name: "Not now", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Notifications are blocked in your browser" })).toHaveCount(0);

    // A fresh app entry asks again; a browser-level denial is not hidden for seven days.
    await page.reload();
    await expect(page.getByRole("heading", { name: "Notifications are blocked in your browser" })).toBeVisible();
    expect(await page.evaluate(() => (window as unknown as { __nativePermissionPromptCalls?: number }).__nativePermissionPromptCalls || 0)).toBe(0);
  });
});


test.describe("Google Sign-In popup compatibility", () => {
  test("uses the popup callback flow and keeps FedCM button UX disabled", async ({ page }) => {
    await mockAppApi(page);

    await page.route("**/api/auth/google/config", async (route) => json(route, {
      enabled: true,
      clientId: "test-web-client.apps.googleusercontent.com",
    }));

    await page.route("https://accounts.google.com/gsi/client", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/javascript",
        body: `
          window.google = {
            accounts: {
              id: {
                initialize(config) {
                  window.__bfsGoogleInitConfig = {
                    client_id: config.client_id,
                    ux_mode: config.ux_mode,
                    use_fedcm_for_button: config.use_fedcm_for_button
                  };
                },
                renderButton(container) {
                  const button = document.createElement("button");
                  button.type = "button";
                  button.textContent = "Mock Continue with Google";
                  container.appendChild(button);
                }
              }
            }
          };
        `,
      });
    });

    await page.goto(baseURL + "/login");

    await expect.poll(() => page.evaluate(() => {
      return (window as Window & {
        __bfsGoogleInitConfig?: {
          client_id?: string;
          ux_mode?: string;
          use_fedcm_for_button?: boolean;
        };
      }).__bfsGoogleInitConfig || null;
    })).toEqual({
      client_id: "test-web-client.apps.googleusercontent.com",
      ux_mode: "popup",
      use_fedcm_for_button: false,
    });
    await expect(page.getByRole("button", { name: "Mock Continue with Google" })).toBeVisible();
  });
});

test.describe("learner responsive viewport regressions", () => {
  test("[RESP-LEARNER-OVERFLOW-001] primary learner routes fit supported viewport widths", async ({ page }) => {
    await mockAppApi(page, {
      authenticated: true,
      learningEnrollments: [learningEnrollmentFixture(courseFixture("course-fixture"), "in-progress")],
    });

    const viewports = [360, 390, 768, 1024, 1440];
    const routes = [
      "/home",
      "/courses",
      "/courses/course-fixture",
      "/my-learning",
      "/learn/course-fixture",
    ];

    for (const width of viewports) {
      await page.setViewportSize({ width, height: 900 });
      for (const path of routes) {
        await page.goto(baseURL + path);
        await expect(page.locator("body")).toBeVisible();
        const dimensions = await page.evaluate(() => ({
          viewport: document.documentElement.clientWidth,
          document: document.documentElement.scrollWidth,
          body: document.body.scrollWidth,
        }));
        expect(
          Math.max(dimensions.document, dimensions.body),
          `Horizontal overflow at ${path}, viewport ${width}px: ${JSON.stringify(dimensions)}`,
        ).toBeLessThanOrEqual(dimensions.viewport);
      }
    }
  });
});

test.describe("session recovery", () => {
  test("[NAV-SIGNOUT-FAILURE-001] sign out clears local credentials when server logout fails", async ({ page }) => {
    let logoutRequests = 0;
    await mockAppApi(page, { authenticated: true });
    await page.route("**/api/auth/logout", async (route) => {
      if (route.request().method() !== "POST") return route.continue();
      logoutRequests += 1;
      return json(route, { message: "Logout service is temporarily unavailable." }, 503);
    });

    await page.goto(baseURL + "/home");
    const accountButton = page.getByRole("button", { name: /Open account menu for Learner/ });
    await expect(accountButton).toBeVisible();
    await accountButton.click();
    const menu = page.getByRole("menu", { name: "Account menu" });
    await expect(menu.getByRole("menuitem", { name: "Sign out" })).toBeVisible();
    await menu.getByRole("menuitem", { name: "Sign out" }).click();

    await expect.poll(() => page.evaluate(() => window.location.pathname)).toBe("/");
    await expect(page.getByRole("navigation", { name: "Primary navigation" }).getByRole("link", { name: "Sign in", exact: true })).toBeVisible();
    expect(logoutRequests).toBe(1);
    const token = await page.evaluate(() => localStorage.getItem("bfs_token"));
    expect(token).toBeNull();
  });
});
