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
    if (pathname === "/api/admin/health") return json(route, { database: "connected" });
    if (pathname === "/api/admin/operations/alerts") return json(route, { alerts: [] });
    if (pathname === "/api/admin/operations/system-health") return json(route, { overallStatus: "healthy" });
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
    await page.route("**/api/auth/me", (route) => json(route, {
      user: {
        id: "learner-1",
        name: "Learner",
        email: "learner@example.test",
        role: "user",
        authProvider: "local",
        isActive: true,
      },
    }));
    await page.route("**/api/**", async (route) => {
      const pathname = new URL(route.request().url()).pathname;
      if (pathname === "/api/notifications/preferences") return json(route, { preferences: { pushEnabled: false } });
      return json(route, {});
    });
    await page.goto(baseURL + "/admin");
    await expect(page).toHaveURL(/\/home$/);
    await expect(page.getByRole("navigation", { name: "Admin navigation" })).toHaveCount(0);
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

    await page.goto(baseURL + "/admin/users");
    await expect(page.getByRole("heading", { name: "Access restricted" })).toBeVisible();
    await expect(page.getByText(/does not have permission to access this section/i)).toBeVisible();
  });
});
