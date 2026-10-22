import { test, expect, type Page, type Route } from "@playwright/test";

const baseURL = process.env.E2E_BASE_URL ?? "http://127.0.0.1:4173";

const analystUser = {
  id: "admin-auditor-1",
  name: "Audit Analyst",
  email: "auditor@example.test",
  role: "admin",
  authProvider: "local",
  isActive: true,
};

const analystPermissions = [
  "dashboard.read",
  "saved_views.manage",
  "analytics.read",
  "audit.read",
  "notifications.read",
  "operations.read",
  "billing.read",
];

function json(route: Route, body: unknown, status = 200) {
  return route.fulfill({
    status,
    contentType: "application/json",
    body: JSON.stringify(body),
  });
}

async function mockAdminApi(page: Page, principal: {
  user: typeof analystUser;
  adminRole: string;
  roleLabel: string;
  permissions: string[];
}) {
  await page.addInitScript(() => localStorage.setItem("bfs_token", "e2e-admin-token"));
  await page.route("**/api/**", async (route) => {
    const pathname = new URL(route.request().url()).pathname;
    if (pathname === "/api/auth/me") return json(route, { user: principal.user });
    if (pathname === "/api/notifications/preferences") {
      return json(route, { preferences: { pushEnabled: false } });
    }
    if (pathname === "/api/admin/access") {
      return json(route, { access: {
        adminRole: principal.adminRole,
        roleLabel: principal.roleLabel,
        permissions: principal.permissions,
      } });
    }
    if (pathname === "/api/admin/overview") {
      return json(route, { stats: {
        users: 0, activeUsers: 0, courses: 0, published: 0,
        activeSubscribers: 0, pastDueSubscribers: 0, netRevenue: 0,
        grossRevenue: 0, processedRefunds: 0, emptyCourses: 0,
        failedPayments: 0, pendingRefunds: 0,
      } });
    }
    if (pathname === "/api/admin/courses") {
      return json(route, {
        courses: [{
          _id: "507f1f77bcf86cd799439011",
          title: "Course reader fixture",
          category: "Development",
          level: "Beginner",
          status: "draft",
          isPublished: false,
          featured: false,
          enrollmentEnabled: true,
          certificateEnabled: true,
          pricing: { mode: "free", price: 0, currency: "INR" },
        }],
        total: 1,
        pages: 1,
      });
    }
    if (pathname === "/api/admin/users") {
      return json(route, {
        users: [{
          _id: "507f1f77bcf86cd799439012",
          name: "Read-only learner",
          emailMasked: "r***@example.test",
          role: "user",
          isActive: true,
          emailVerified: true,
          authProvider: "local",
          createdAt: "2026-01-01T00:00:00.000Z",
        }],
        pagination: { page: 1, pages: 1, total: 1 },
      });
    }
    if (pathname === "/api/admin/users/507f1f77bcf86cd799439012") {
      return json(route, {
        user: {
          _id: "507f1f77bcf86cd799439012",
          name: "Read-only learner",
          emailMasked: "r***@example.test",
          role: "user",
          isActive: true,
          emailVerified: true,
          authProvider: "local",
        },
        subscription: null,
        payments: [],
        enrollments: [],
        notifications: [],
      });
    }
    if (pathname === "/api/admin/users/507f1f77bcf86cd799439012/courses") {
      return json(route, {
        courses: [{
          _id: "507f1f77bcf86cd799439013",
          title: "Course access fixture",
          category: "Development",
          slug: "course-access-fixture",
          enrollment: null,
          pricing: { mode: "free" },
          hasVerifiedPayment: false,
        }],
      });
    }
    if (pathname === "/api/admin/users/507f1f77bcf86cd799439012/feature-overrides") {
      return json(route, {
        features: [{ key: "advanced_ai_paths", label: "Advanced AI paths", override: null }],
      });
    }
    if (pathname === "/api/admin/health") return json(route, { database: "connected" });
    if (pathname === "/api/admin/operations/alerts") return json(route, { alerts: [] });
    if (pathname === "/api/admin/operations/system-health") return json(route, { overallStatus: "healthy" });
    if (pathname === "/api/admin/deliveries") {
      return json(route, {
        deliveries: [{
          id: "failed-notification-1",
          time: "2026-10-22T10:00:00.000Z",
          recipient: { name: "Learner One", email: "l***@example.test" },
          type: "system",
          eventKey: "fixture:failed-delivery",
          title: "Failed notice",
          channels: {
            in_app: { status: "sent" },
            email: { status: "failed", attempts: 1, error: "SMTP unavailable" },
            push: { status: "skipped", attempts: 0 },
          },
        }],
        pages: 1,
        total: 1,
      });
    }
    return json(route, {});
  });
}

test.describe("administrator route and permission UX", () => {
  test("signed-out visitors are redirected away from admin routes", async ({ page }) => {
    await page.goto(baseURL + "/admin/users");
    await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByRole("navigation", { name: "Admin navigation" })).toHaveCount(0);
  });

  test("ordinary user accounts cannot enter the administrator workspace", async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem("bfs_token", "e2e-user-token"));
    await page.route("**/api/**", async (route) => {
      const pathname = new URL(route.request().url()).pathname;
      if (pathname === "/api/auth/me") return json(route, { user: {
        id: "learner-1",
        name: "Learner",
        email: "learner@example.test",
        role: "user",
        authProvider: "local",
        isActive: true,
      } });
      if (pathname === "/api/notifications/preferences") return json(route, { preferences: { pushEnabled: false } });
      return json(route, {});
    });
    await page.goto(baseURL + "/admin");
    await expect(page).toHaveURL(/\/home$/);
    await expect(page.getByRole("navigation", { name: "Admin navigation" })).toHaveCount(0);
  });

  test("course-read-only administrators do not see management controls", async ({ page }) => {
    await mockAdminApi(page, {
      user: { ...analystUser, name: "Course Reader", email: "course-reader@example.test" },
      adminRole: "custom_course_reader",
      roleLabel: "Course Reader",
      permissions: ["dashboard.read", "courses.read"],
    });
    await page.goto(baseURL + "/admin/courses");
    await expect(page.getByText("Course reader fixture")).toBeVisible();
    await expect(page.getByText(/Read-only catalog access/i)).toBeVisible();
    await expect(page.getByRole("checkbox", { name: /Publish Course reader fixture/i })).toHaveCount(0);
    await expect(page.getByRole("checkbox", { name: /Feature Course reader fixture/i })).toHaveCount(0);
    await expect(page.getByRole("checkbox", { name: /Enable enrollment for Course reader fixture/i })).toHaveCount(0);
    await expect(page.getByRole("checkbox", { name: /Enable certificates for Course reader fixture/i })).toHaveCount(0);
    await expect(page.getByLabel("Pricing mode for Course reader fixture")).toHaveCount(0);
    await expect(page.getByRole("button", { name: /Manage Curriculum/i })).toHaveCount(0);



  });

  test("users.read-only administrators cannot mutate accounts, features, course access or export PII", async ({ page }) => {
    await mockAdminApi(page, {
      user: { ...analystUser, name: "User Reader", email: "user-reader@example.test" },
      adminRole: "custom_user_reader",
      roleLabel: "User Reader",
      permissions: ["dashboard.read", "users.read"],
    });
    await page.goto(baseURL + "/admin/users");
    await expect(page.getByText(/Read-only user access/i)).toBeVisible();
    await expect(page.getByText("Read-only learner")).toBeVisible();
    await expect(page.getByRole("checkbox", { name: "Select all rows on this page" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: /Export selected/i })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Disable", exact: true })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Enable", exact: true })).toHaveCount(0);
  });

  test("read-only user detail drawer hides feature override and individual course mutations", async ({ page }) => {
    await mockAdminApi(page, {
      user: { ...analystUser, name: "User Reader", email: "user-reader@example.test" },
      adminRole: "custom_user_reader",
      roleLabel: "User Reader",
      permissions: ["dashboard.read", "users.read"],
    });
    await page.goto(baseURL + "/admin/users?id=507f1f77bcf86cd799439012");
    await expect(page.getByRole("heading", { name: "Individual course access" })).toBeVisible({ timeout: 5000 });
    await expect(page.getByText(/Read-only view/i)).toBeVisible();
    await expect(page.getByRole("combobox", { name: /Feature access for/i })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Grant", exact: true })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Remove", exact: true })).toHaveCount(0);
    await expect(page.getByLabel("course-access-reason")).toHaveCount(0);
  });

  test("direct communications access is restricted without communications.send", async ({ page }) => {
    await mockAdminApi(page, {
      user: { ...analystUser, name: "Communications Reader", email: "communications-reader@example.test" },
      adminRole: "analyst_auditor",
      roleLabel: "Analyst & Auditor",
      permissions: ["dashboard.read", "notifications.read", "operations.read", "billing.read"],
    });
    await page.goto(baseURL + "/admin/communications");
    await expect(page.getByRole("heading", { name: "Access restricted" })).toBeVisible();
    await expect(page.getByRole("button", { name: /Send now|Queue announcement|Schedule announcement/i })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Compose", exact: true })).toHaveCount(0);
  });

  test("send-only administrators can compose but cannot open template or campaign management", async ({ page }) => {
    await mockAdminApi(page, {
      user: { ...analystUser, name: "Communication Sender", email: "sender@example.test" },
      adminRole: "custom_communications_sender",
      roleLabel: "Communication Sender",
      permissions: ["dashboard.read", "communications.send"],
    });
    await page.goto(baseURL + "/admin/communications");
    await expect(page.getByRole("button", { name: "Compose", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "In-app notification", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: /Templates/ })).toHaveCount(0);
    await expect(page.getByRole("button", { name: /Campaigns/ })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Delivery log", exact: true })).toHaveCount(0);
  });

  test("role navigation is permission-filtered and direct access shows a restricted state", async ({ page }) => {
    await mockAdminApi(page, {
      user: analystUser,
      adminRole: "analyst_auditor",
      roleLabel: "Analyst & Auditor",
      permissions: analystPermissions,
    });
    await page.goto(baseURL + "/admin");
    const navigation = page.getByRole("navigation", { name: "Admin navigation" });
    await expect(navigation.getByRole("link", { name: "Dashboard" })).toBeVisible();
    await expect(navigation.getByRole("link", { name: "Analytics" })).toBeVisible();
    await expect(navigation.getByRole("link", { name: "Audit log" })).toBeVisible();
    await expect(navigation.getByRole("link", { name: "Users" })).toHaveCount(0);
    await expect(navigation.getByRole("link", { name: "Administrator roles" })).toHaveCount(0);

    await page.getByRole("button", { name: /Audit Analyst/ }).click();
    const adminMenu = page.getByRole("menu", { name: "Administrator menu" });
    await expect(adminMenu.getByRole("menuitem", { name: /Sign out/ })).toBeVisible();
    await expect(adminMenu.getByRole("menuitem", { name: "Platform settings" })).toHaveCount(0);

    await page.goto(baseURL + "/admin/users");
    await expect(page.getByRole("heading", { name: "Access restricted" })).toBeVisible();
    await expect(page.getByText(/does not have permission to access this section/i)).toBeVisible();

    await page.goto(baseURL + "/admin/deliveries");
    await expect(page.getByText("Failed notice")).toBeVisible();
    await expect(page.getByText(/Read-only delivery access/i)).toBeVisible();
    await expect(page.getByRole("button", { name: /Retry email/i })).toHaveCount(0);
  });
});
