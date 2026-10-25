import { test, expect, type Page, type Route } from "@playwright/test";
import { readFile } from "node:fs/promises";

const baseURL = process.env.E2E_BASE_URL ?? "http://127.0.0.1:4173";

test.beforeEach(async ({ page }) => {
  // Admin access tests focus on authorization rather than cookie banner UX.
  await page.addInitScript((origin) => {
    try {
      if (window.location.origin !== origin) return;
      localStorage.setItem("bfs-cookie-consent-v1", JSON.stringify({
        version: "cookie-choice-v1",
        preferences: { necessary: true, analytics: false, marketing: false },
        updatedAt: new Date().toISOString()
      }));
    } catch { /* Leave storage failures to the test under examination. */ }
  }, new URL(baseURL).origin);
});

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
    if (pathname === "/api/consent/status") {
      return json(route, {
        status: {
          requiresLegalAcceptance: false,
          requiresProfileCompletion: false,
          policies: {
            termsVersion: "terms-fixture-v1",
            privacyVersion: "privacy-fixture-v1",
            termsPublished: true,
            privacyPublished: true,
            termsUrl: "/legal/terms-of-service",
            privacyUrl: "/legal/privacy-policy"
          },
          user: {
            authProvider: "local",
            phoneNumber: "",
            city: "",
            learningGoal: "",
            marketingEmailConsent: false
          }
        }
      });
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

  test("[ADM-PII-REVEAL-001] full email reveal requires permission and a reason, then can be masked again", async ({ page }) => {
    let revealRequests = 0;
    let revealPayload: Record<string, unknown> | null = null;
    await mockAdminApi(page, {
      user: { ...analystUser, name: "PII Operator", email: "pii-operator@example.test" },
      adminRole: "custom_user_pii_reader",
      roleLabel: "PII Reader",
      permissions: ["dashboard.read", "users.read", "users.manage", "users.pii.reveal"],
    });
    await page.route("**/api/admin/users/507f1f77bcf86cd799439012/pii-reveal", async (route) => {
      revealRequests += 1;
      revealPayload = route.request().postDataJSON() as Record<string, unknown>;
      return json(route, { email: "learner@example.test" });
    });

    await page.goto(baseURL + "/admin/users");
    await expect(page.getByText("r***@example.test", { exact: true })).toBeVisible();
    await expect(page.getByText("learner@example.test", { exact: true })).toHaveCount(0);

    const reason = page.getByPlaceholder("Required reason").first();
    const revealButton = page.getByRole("button", { name: "Reveal personal information" }).first();
    await expect(revealButton).toHaveCount(1, { timeout: 5000 });
    await expect(revealButton).toBeDisabled();
    await reason.fill("Need");
    await expect(revealButton).toBeDisabled();
    expect(revealRequests).toBe(0);

    await reason.fill("Need to verify account ownership for support case 1842.");
    await expect(revealButton).toBeEnabled();
    await revealButton.click();
    await expect(page.getByText("learner@example.test", { exact: true })).toBeVisible();
    expect(revealRequests).toBe(1);
    expect(revealPayload).toEqual({ reason: "Need to verify account ownership for support case 1842." });

    const maskButton = page.getByRole("button", { name: "Mask personal information" }).first();
    await expect(maskButton).toHaveCount(1, { timeout: 4000 });
    // The table header is sticky and can intercept pointer clicks after auto-scrolling.
    // Use keyboard activation to verify the mask control remains accessible.
    await maskButton.focus();
    await maskButton.press("Enter", { timeout: 4000 });
    await expect(page.getByText("r***@example.test", { exact: true })).toBeVisible({ timeout: 4000 });
    await expect(page.getByText("learner@example.test", { exact: true })).toHaveCount(0, { timeout: 4000 });
  });

  test("[ADM-PII-EXPORT-001] user export requires reason and exact confirmation and protects CSV formulas", async ({ page }) => {
    let exportRequests = 0;
    let exportPayload: Record<string, unknown> | null = null;
    await mockAdminApi(page, {
      user: { ...analystUser, name: "PII Export Operator", email: "export-operator@example.test" },
      adminRole: "custom_user_exporter",
      roleLabel: "User Exporter",
      permissions: ["dashboard.read", "users.read", "users.manage", "users.pii.reveal"],
    });
    await page.route("**/api/admin/users/export", async (route) => {
      if (route.request().method() !== "POST") return route.continue();
      exportRequests += 1;
      exportPayload = route.request().postDataJSON() as Record<string, unknown>;
      return json(route, {
        users: [{
          _id: "507f1f77bcf86cd799439012",
          name: '=HYPERLINK("https://attacker.test","click")',
          email: "learner@example.test",
          role: "user",
          isActive: true,
          emailVerified: true,
          authProvider: "local",
          createdAt: "2026-01-01T00:00:00.000Z",
        }],
      });
    });

    await page.goto(baseURL + "/admin/users");
    await expect(page.getByText("Read-only learner")).toBeVisible();
    await page.getByRole("checkbox", { name: "Select row 507f1f77bcf86cd799439012" }).check();
    await page.getByRole("button", { name: "Export selected (1)" }).click();

    const dialog = page.getByRole("alertdialog", { name: "Export selected user records?" });
    await expect(dialog).toBeVisible();
    const reason = dialog.getByLabel("Reason (required)");
    const phrase = dialog.getByLabel("Type EXPORT 1 USERS to confirm");
    const confirm = dialog.getByRole("button", { name: "Export user CSV" });
    await expect(confirm).toBeDisabled();
    await reason.fill("Need a verified export for support case 1842.");
    await phrase.fill("EXPORT 2 USERS");
    await expect(confirm).toBeDisabled();
    expect(exportRequests).toBe(0);

    await phrase.fill("EXPORT 1 USERS");
    await expect(confirm).toBeEnabled();
    const downloadPromise = page.waitForEvent("download");
    await confirm.click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toMatch(/^buddyforstudy-users-\d{4}-\d{2}-\d{2}\.csv$/);
    expect(exportRequests).toBe(1);
    expect(exportPayload).toMatchObject({
      ids: ["507f1f77bcf86cd799439012"],
      sortBy: "name",
      sortOrder: "asc",
      reason: "Need a verified export for support case 1842.",
    });

    const downloadPath = await download.path();
    expect(downloadPath).toBeTruthy();
    const csv = await readFile(downloadPath as string, "utf8");
    expect(csv.startsWith("\uFEFF")).toBe(true);
    expect(csv).toContain("'=HYPERLINK");
    expect(csv).toContain('"learner@example.test"');
    await expect(dialog).toHaveCount(0);
  });

  test("[ADM-USER-STATUS-FAILURE-001] failed account disable preserves reason and supports retry", async ({ page }) => {
    const userId = "507f1f77bcf86cd799439012";
    let active = true;
    let updateRequests = 0;
    let updatePayload: Record<string, unknown> | null = null;
    await mockAdminApi(page, {
      user: { ...analystUser, name: "Account Manager", email: "account-manager@example.test" },
      adminRole: "custom_user_manager",
      roleLabel: "User Manager",
      permissions: ["dashboard.read", "users.read", "users.manage"],
    });
    await page.route("**/api/admin/users**", async (route) => {
      const request = route.request();
      const pathname = new URL(request.url()).pathname;
      if (pathname === "/api/admin/users" && request.method() === "GET") {
        return json(route, {
          users: [{
            _id: userId,
            name: "Read-only learner",
            emailMasked: "r***@example.test",
            role: "user",
            isActive: active,
            emailVerified: true,
            authProvider: "local",
            createdAt: "2026-01-01T00:00:00.000Z",
          }],
          pagination: { page: 1, pages: 1, total: 1 },
        });
      }
      if (pathname === "/api/admin/users/" + userId && request.method() === "PUT") {
        updateRequests += 1;
        updatePayload = request.postDataJSON() as Record<string, unknown>;
        if (updateRequests === 1) {
          return json(route, { message: "Account update is temporarily unavailable." }, 503);
        }
        active = false;
        return json(route, { user: { _id: userId, isActive: false } });
      }
      return route.fallback();
    });

    await page.goto(baseURL + "/admin/users");
    await expect(page.getByText("Read-only learner")).toBeVisible();
    const disableButton = page.getByRole("button", { name: "Disable", exact: true });
    await expect(disableButton).toHaveCount(1, { timeout: 5000 });
    // Avoid auto-scroll placing the action beneath the sticky table header; exercise keyboard activation.
    await disableButton.focus();
    await disableButton.press("Enter", { timeout: 5000 });
    const dialog = page.getByRole("alertdialog", { name: "Disable user account?" });
    await expect(dialog).toBeVisible();
    const reason = dialog.getByLabel("Reason (required)");
    const confirm = dialog.getByRole("button", { name: "Disable account" });
    await expect(confirm).toBeDisabled();
    await reason.fill("Support escalation confirms account abuse for case 1842.");
    await expect(confirm).toBeEnabled();
    await confirm.click();

    await expect(page.getByRole("alert")).toContainText("Account update is temporarily unavailable.");
    await expect(dialog).toBeVisible();
    await expect(reason).toHaveValue("Support escalation confirms account abuse for case 1842.");
    await expect(confirm).toBeEnabled();
    expect(updateRequests).toBe(1);
    expect(updatePayload).toMatchObject({
      isActive: false,
      reason: "Support escalation confirms account abuse for case 1842.",
    });

    await confirm.click();
    await expect(page.getByRole("button", { name: "Enable", exact: true })).toBeVisible();
    await expect(dialog).toHaveCount(0);
    expect(updateRequests).toBe(2);
  });

  test("changing user page size clears page-scoped bulk selection", async ({ page }) => {
    await mockAdminApi(page, {
      user: { ...analystUser, name: "User Administrator", email: "user-admin@example.test" },
      adminRole: "custom_user_manager",
      roleLabel: "User Manager",
      permissions: ["dashboard.read", "users.read", "users.manage", "users.pii.reveal"],
    });
    await page.goto(baseURL + "/admin/users");
    await expect(page.getByText("Read-only learner")).toBeVisible();
    await page.getByRole("checkbox", { name: "Select row 507f1f77bcf86cd799439012" }).check();
    await expect(page.getByRole("button", { name: /Export selected \(1\)/ })).toBeVisible();

    await page.getByRole("combobox", { name: "Rows per page" }).selectOption("50");

    await expect(page.getByRole("button", { name: /Export selected/ })).toHaveCount(0);
    await expect(page.getByRole("checkbox", { name: "Select row 507f1f77bcf86cd799439012" })).not.toBeChecked();
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
    await expect(page.getByRole("tab", { name: "Compose", exact: true })).toBeVisible();
    await expect(page.getByRole("tab", { name: "In-app notification", exact: true })).toBeVisible();
    await expect(page.getByRole("tab", { name: /Templates/ })).toHaveCount(0);
    await expect(page.getByRole("tab", { name: /Campaigns/ })).toHaveCount(0);
    await expect(page.getByRole("tab", { name: "Delivery log", exact: true })).toHaveCount(0);
  });

  test("[ADM-SHELL-SEARCH-001] Ctrl+K opens the admin command palette and routes to permitted pages", async ({ page }) => {
    await mockAdminApi(page, {
      user: analystUser,
      adminRole: "analyst_auditor",
      roleLabel: "Analyst & Auditor",
      permissions: analystPermissions,
    });
    await page.goto(baseURL + "/admin");
    // Wait until AdminLayout has loaded confirmed access and mounted its key handler.
    await expect(page.getByRole("button", { name: "Search pages and actions" })).toBeVisible();
    // Dispatch the same bubbling browser KeyboardEvent used by the app handler.
    // Playwright's physical Ctrl+K can be claimed by the browser/runner shortcut.
    await page.evaluate(() => {
      window.dispatchEvent(new KeyboardEvent("keydown", {
        key: "k",
        ctrlKey: true,
        bubbles: true,
        cancelable: true,
      }));
    });

    const dialog = page.getByRole("dialog", { name: "Search pages and actions" });
    await expect(dialog).toBeVisible();
    const search = dialog.getByRole("textbox", { name: "Search pages and actions" });
    await expect(search).toBeFocused();
    await search.fill("audit");
    const auditResult = dialog.getByRole("option", { name: /Audit log/i });
    await expect(auditResult).toBeVisible();
    await auditResult.click();

    await expect(page).toHaveURL(/\/admin\/audit$/);
    await expect(page.getByRole("heading", { name: "Audit log" })).toBeVisible();
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
  test("[ADM-COMMUNICATION-SEND-FAILURE-001] notification queue failure preserves confirmation and permits retry", async ({ page }) => {
    let previewRequests = 0;
    let sendRequests = 0;
    let sendPayload: Record<string, unknown> | null = null;
    await mockAdminApi(page, {
      user: analystUser,
      adminRole: "communications_operator",
      roleLabel: "Communications Operator",
      permissions: ["dashboard.read", "communications.send"],
    });
    await page.route("**/api/admin/notifications/audience-options", async (route) => json(route, { plans: [], courses: [] }));
    await page.route("**/api/admin/notifications/audience-preview", async (route) => {
      previewRequests += 1;
      return json(route, {
        recipientCount: 3,
        truncated: false,
        previewToken: "audience-preview-token-fixture",
        sample: [
          { id: "learner-1", name: "Learner One", email: "one@example.test" },
          { id: "learner-2", name: "Learner Two", email: "two@example.test" },
        ],
        channelCounts: {
          in_app: { selected: true, consentEligible: 3, willReach: 3 },
          email: { selected: false, consentEligible: 2, willReach: 0, providerConfigured: false },
          push: { selected: false, consentEligible: 1, willReach: 0, activeSubscriptions: 1, providerConfigured: false },
        },
      });
    });
    await page.route("**/api/admin/notifications/send", async (route) => {
      if (route.request().method() !== "POST") return route.continue();
      sendRequests += 1;
      sendPayload = route.request().postDataJSON() as Record<string, unknown>;
      if (sendRequests === 1) return json(route, { message: "Notification queue is temporarily unavailable." }, 503);
      return json(route, { sent: 3, message: "Notification queued." });
    });

    await page.goto(baseURL + "/admin/communications");
    await expect(page.getByRole("heading", { name: "Communications" })).toBeVisible();
    await page.getByLabel("Title").fill("Scheduled maintenance reminder");
    await page.getByLabel("Message").fill("A short maintenance window is planned. See the status page for updates.");
    await page.getByRole("button", { name: "Preview recipients" }).click();
    await expect(page.getByText("3 matching recipient(s)")).toBeVisible();
    await expect(page.getByText("Learner One")).toBeVisible();
    expect(previewRequests).toBe(1);
    expect(sendRequests).toBe(0);

    await page.getByRole("button", { name: "Send now" }).click();
    const dialog = page.getByRole("alertdialog", { name: "Send in-app notification" });
    await expect(dialog).toBeVisible();
    const reason = dialog.getByLabel("Reason (required)");
    await reason.fill("Send the maintenance notice after reviewing the recipient preview.");
    await dialog.getByRole("button", { name: "Send communication" }).click();

    await expect(dialog.getByRole("alert")).toContainText("Notification queue is temporarily unavailable.");
    await expect(reason).toHaveValue("Send the maintenance notice after reviewing the recipient preview.");
    await expect(dialog.getByRole("button", { name: "Send communication" })).toBeEnabled();
    expect(sendRequests).toBe(1);
    expect(sendPayload).toMatchObject({
      audience: "all",
      title: "Scheduled maintenance reminder",
      message: "A short maintenance window is planned. See the status page for updates.",
      previewToken: "audience-preview-token-fixture",
      reason: "Send the maintenance notice after reviewing the recipient preview.",
      channel: ["in_app"],
    });

    await dialog.getByRole("button", { name: "Send communication" }).click();
    await expect(page.getByText("Notification queued. — 3 recipient(s)")).toBeVisible();
    expect(sendRequests).toBe(2);
  });

  test("[ADM-PRICING-APPLY-FAILURE-001] pricing apply failure preserves preview and reason for retry", async ({ page }) => {
    let previewRequests = 0;
    let applyRequests = 0;
    let applyPayload: Record<string, unknown> | null = null;
    page.on("dialog", (dialog) => { void dialog.accept(); });
    await mockAdminApi(page, {
      user: analystUser,
      adminRole: "pricing_operator",
      roleLabel: "Pricing Operator",
      permissions: ["dashboard.read", "pricing.manage"],
    });
    await page.route("**/api/admin/pricing/courses**", async (route) => json(route, {
      courses: [{
        _id: "pricing-course-fixture",
        title: "Backend Fundamentals",
        category: "Development",
        level: "Beginner",
        status: "published",
        isPublished: true,
        pricing: { mode: "paid", price: 799, compareAtPrice: 999, currency: "INR", saleEnabled: false, salePrice: 0 },
        updatedAt: "2026-10-24T10:00:00.000Z",
      }],
      total: 1,
      categories: ["Development"],
      summary: { total: 1, paid: 1, free: 0 },
    }));
    await page.route("**/api/admin/pricing/rules", async (route) => json(route, { rules: [] }));
    await page.route("**/api/admin/pricing/history?*", async (route) => json(route, { batches: [] }));
    await page.route("**/api/admin/pricing/generated-policy", async (route) => json(route, { policy: {
      enabled: false,
      mode: "rule_based",
      fixedPrice: 499,
      currency: "INR",
      levelBands: { Beginner: { min: 199, max: 499 }, Intermediate: { min: 499, max: 999 }, Advanced: { min: 999, max: 1999 } },
      applyTo: ["ai", "discovery", "module", "normal"],
    } }));
    await page.route("**/api/admin/pricing/preview", async (route) => {
      previewRequests += 1;
      return json(route, {
        previewId: "pricing-preview-fixture",
        kind: "bulk",
        matchedCount: 1,
        eligibleCount: 1,
        skippedCount: 0,
        expiresAt: "2026-10-26T10:00:00.000Z",
        items: [{
          courseId: "pricing-course-fixture",
          title: "Backend Fundamentals",
          updatedAt: "2026-10-24T10:00:00.000Z",
          before: { mode: "paid", price: 799, compareAtPrice: 999, currency: "INR", saleEnabled: false, salePrice: 0 },
          after: { mode: "paid", price: 499, compareAtPrice: 999, currency: "INR", saleEnabled: false, salePrice: 0 },
          status: "eligible",
          note: "Ready to apply",
        }],
      });
    });
    await page.route("**/api/admin/pricing/apply", async (route) => {
      if (route.request().method() !== "POST") return route.continue();
      applyRequests += 1;
      applyPayload = route.request().postDataJSON() as Record<string, unknown>;
      if (applyRequests === 1) return json(route, { message: "Pricing service is temporarily unavailable." }, 503);
      return json(route, { appliedCount: 1, skippedCount: 0, batchId: "pricing-batch-fixture" });
    });

    await page.goto(baseURL + "/admin/pricing");
    await expect(page.getByRole("heading", { name: "Course Pricing Studio" })).toBeVisible();
    await expect(page.getByText("Backend Fundamentals", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Preview bulk change" }).click();
    await expect(page.getByText("Preview ready. No prices have changed yet.")).toBeVisible();
    await expect(page.getByText("Matched", { exact: true })).toBeVisible();
    const previewTable = page.getByRole("table").filter({ has: page.getByRole("columnheader", { name: "Proposed" }) });
    await expect(previewTable.getByRole("row", { name: /Backend Fundamentals/ })).toContainText("₹499");
    expect(previewRequests).toBe(1);
    expect(applyRequests).toBe(0);

    const reason = page.getByLabel(/Reason for change/);
    await reason.fill("Standardize the published beginner course price for the next term.");
    await page.getByRole("button", { name: "Confirm and apply preview" }).click();
    await expect(page.getByRole("alert")).toContainText("Pricing service is temporarily unavailable.");
    await expect(reason).toHaveValue("Standardize the published beginner course price for the next term.");
    await expect(page.getByRole("button", { name: "Confirm and apply preview" })).toBeEnabled();
    expect(applyRequests).toBe(1);
    expect(applyPayload).toMatchObject({ previewId: "pricing-preview-fixture", reason: "Standardize the published beginner course price for the next term." });

    await page.getByRole("button", { name: "Confirm and apply preview" }).click();
    await expect(page.getByRole("status").filter({ hasText: "Batch complete: 1 updated, 0 skipped. Stale courses were left unchanged." })).toBeVisible();
    expect(applyRequests).toBe(2);
  });

  test("[ADM-TRIAL-GRANT-PREVIEW-001] group trial preview includes all filtered eligible learners", async ({ page }) => {
    let previewPayload: Record<string, unknown> | null = null;
    let grantPayload: Record<string, unknown> | null = null;
    await mockAdminApi(page, {
      user: analystUser,
      adminRole: "trial_campaign_manager",
      roleLabel: "Trial Campaign Manager",
      permissions: ["dashboard.read", "trials.manage"],
    });
    await page.route("**/api/admin/plans", async (route) => json(route, {
      plans: [{ _id: "trial-plan-free", name: "Free learning plan", price: 0, currency: "INR", billingInterval: "month", isActive: true }],
    }));
    await page.route("**/api/admin/trials/grants?*", async (route) => json(route, { grants: [] }));
    await page.route("**/api/admin/trials/preview", async (route) => {
      previewPayload = route.request().postDataJSON() as Record<string, unknown>;
      return json(route, {
        eligibleCount: 241,
        totalEligibleBeforeLimit: 241,
        skippedCount: 1,
        eligible: [
          { id: "eligible-1", name: "Sample learner one", email: "one@example.test", authProvider: "local", emailVerified: true },
          { id: "eligible-2", name: "Sample learner two", email: "two@example.test", authProvider: "google", emailVerified: true },
        ],
        skipped: [{ id: "skipped-1", name: "Previous recipient", email: "previous@example.test", reason: "Previous trial already granted" }],
      });
    });
    await page.route("**/api/admin/trials/grant", async (route) => {
      grantPayload = route.request().postDataJSON() as Record<string, unknown>;
      return json(route, { granted: 241, skipped: 1 });
    });

    await page.goto(baseURL + "/admin/trials");
    await expect(page.getByRole("heading", { name: "Grant a free trial" })).toBeVisible();
    await page.getByRole("button", { name: /A filtered group/ }).click();
    await page.getByLabel("Name or email contains").fill("cohort");
    await page.getByLabel(/Trial plan/).selectOption("trial-plan-free");
    await page.getByLabel("Internal reason (required)").fill("Support approved a seven day trial for this eligible learning cohort.");
    await page.getByRole("button", { name: "Review eligible learner(s)" }).click();

    await expect(page.getByRole("heading", { name: "3. Review before granting" })).toBeVisible();
    await expect(page.getByText("241", { exact: true })).toBeVisible();
    await expect(page.getByText("Sample learner one", { exact: true })).toBeVisible();
    await expect(page.getByText("No autopay", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Confirm and grant trial" })).toBeDisabled();
    expect(previewPayload).not.toBeNull();
    expect(previewPayload).toMatchObject({
      planId: "trial-plan-free",
      trialDays: 7,
      reason: "Support approved a seven day trial for this eligible learning cohort.",
      filters: {
        q: "cohort",
        status: "active",
        role: "user",
        emailVerified: "yes",
        priorTrial: "never",
        subscriptionStatus: "none",
      },
    });

    await page.getByRole("checkbox").check();
    await page.getByRole("button", { name: "Confirm and grant trial" }).click();
    await expect(page.getByRole("status").filter({ hasText: "Trial grants processed: 241 granted, 1 skipped. No autopay was initiated." })).toBeVisible();
    expect(grantPayload).toMatchObject({
      confirm: true,
      planId: "trial-plan-free",
      trialDays: 7,
      filters: {
        q: "cohort",
        priorTrial: "never",
        subscriptionStatus: "none",
      },
    });
    expect(typeof grantPayload?.idempotencyKey).toBe("string");
    expect(String(grantPayload?.idempotencyKey || "").length).toBeGreaterThanOrEqual(12);
    expect(grantPayload).not.toHaveProperty("maxRecipients");
  });

  test("[ADM-DELIVERY-RETRY-FAILURE-001] retry queue failure preserves reason and permits retry", async ({ page }) => {
    let retryRequests = 0;
    page.on("request", (request) => {
      if (new URL(request.url()).pathname === "/api/admin/deliveries/failed-notification-1/retry" && request.method() === "POST") retryRequests += 1;
    });
    await mockAdminApi(page, {
      user: analystUser,
      adminRole: "communications_operator",
      roleLabel: "Communications Operator",
      permissions: ["dashboard.read", "notifications.read", "notifications.retry"],
    });
    await page.route("**/api/admin/deliveries/failed-notification-1/retry", async (route) => {
      if (route.request().method() === "POST") {
        return json(route, { message: "Delivery retry queue is temporarily unavailable." }, 503);
      }
      return route.continue();
    });
    await page.goto(baseURL + "/admin/deliveries");
    await expect(page.getByText("Failed notice")).toBeVisible();
    await page.getByRole("button", { name: "Retry email", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Retry failed notification delivery?" })).toBeVisible();
    const reason = page.getByLabel("Reason (required)");
    const confirmation = page.getByLabel(/Type RETRY to confirm/);
    await reason.fill("The SMTP outage was investigated and it is safe to retry.");
    await confirmation.fill("RETRY");
    await page.getByRole("button", { name: "Queue retry", exact: true }).click();
    await expect(page.getByRole("alert")).toContainText("Delivery retry queue is temporarily unavailable.");
    await expect(reason).toHaveValue("The SMTP outage was investigated and it is safe to retry.");
    await expect(confirmation).toHaveValue("RETRY");
    const queueRetry = page.getByRole("button", { name: "Queue retry", exact: true });
    await expect(queueRetry).toBeEnabled();
    await queueRetry.click();
    await expect.poll(() => retryRequests).toBe(2);
    await expect(reason).toHaveValue("The SMTP outage was investigated and it is safe to retry.");
  });

  test("[ADM-BILLING-REFUND-FAILURE-001] refund API failure preserves reason and allows retry", async ({ page }) => {
    let refundMutations = 0;
    page.on("request", (request) => {
      if (new URL(request.url()).pathname === "/api/admin/refunds/refund-pending-fixture" && request.method() === "PUT") refundMutations += 1;
    });
    await mockAdminApi(page, {
      user: analystUser,
      adminRole: "finance_operator",
      roleLabel: "Finance Operator",
      permissions: ["dashboard.read", "billing.read", "refunds.manage"],
    });
    await page.route("**/api/admin/refunds?*", async (route) => json(route, {
      refunds: [{
        _id: "refund-pending-fixture",
        user: { name: "Refund learner fixture", email: "r***@example.test" },
        payment: { _id: "payment-fixture", amount: 499, currency: "INR", status: "paid", course: { title: "Course fixture" } },
        amount: 499,
        reason: "Charged twice for the same course.",
        status: "pending",
        createdAt: "2026-10-24T10:00:00.000Z",
        sla: { dueAt: "2026-10-26T10:00:00.000Z", breached: false, hoursRemaining: 24 },
      }],
      pages: 1,
      total: 1,
      summary: { pending: 1, approved: 0, rejected: 0, processed: 0 },
    }));
    await page.route("**/api/admin/refunds/refund-pending-fixture", async (route) => {
      if (route.request().method() === "PUT") {
        return json(route, { message: "Refund service is temporarily unavailable." }, 503);
      }
      return route.continue();
    });
    await page.goto(baseURL + "/admin/billing");
    await page.getByRole("button", { name: "Approve & refund", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Approve and process refund" })).toBeVisible();
    await page.locator("#admin-confirm-text").fill("APPROVE REFUND");
    await page.locator("#admin-confirm-reason").fill("Too short"); 
    await page.getByRole("button", { name: "Approve & refund", exact: true }).last().click();
    await expect(page.getByRole("alert")).toContainText("Enter a reason between 10 and 500 characters.");
    expect(refundMutations).toBe(0);
    await page.locator("#admin-confirm-reason").fill("Duplicate charge confirmed against the payment ledger.");
    await page.getByRole("button", { name: "Approve & refund", exact: true }).last().click();
    await expect(page.getByRole("alert")).toContainText("Refund service is temporarily unavailable.");
    await expect(page.locator("#admin-confirm-text")).toHaveValue("APPROVE REFUND");
    await expect(page.locator("#admin-confirm-reason")).toHaveValue("Duplicate charge confirmed against the payment ledger.");
    const confirmButton = page.getByRole("button", { name: "Approve & refund", exact: true }).last();
    await expect(confirmButton).toBeEnabled();
    await confirmButton.click();
    await expect.poll(() => refundMutations).toBe(2);
    await expect(page.locator("#admin-confirm-reason")).toHaveValue("Duplicate charge confirmed against the payment ledger.");
  });

  test("[ADM-BILLING-REFUND-PERMISSION-001] billing readers cannot make refund decisions", async ({ page }) => {
    let refundMutations = 0;
    page.on("request", (request) => {
      const url = new URL(request.url());
      if (url.pathname.startsWith("/api/admin/refunds/") && request.method() === "PUT") refundMutations += 1;
    });
    await mockAdminApi(page, {
      user: analystUser,
      adminRole: "billing_auditor",
      roleLabel: "Billing Auditor",
      permissions: ["dashboard.read", "billing.read"],
    });
    await page.route("**/api/admin/refunds?*", async (route) => json(route, {
      refunds: [{
        _id: "refund-pending-fixture",
        user: { name: "Refund learner fixture", email: "r***@example.test" },
        payment: { _id: "payment-fixture", amount: 499, currency: "INR", status: "paid", course: { title: "Course fixture" } },
        amount: 499,
        reason: "Charged twice for the same course.",
        status: "pending",
        createdAt: "2026-10-24T10:00:00.000Z",
        sla: { dueAt: "2026-10-26T10:00:00.000Z", breached: false, hoursRemaining: 24 },
      }],
      pages: 1,
      total: 1,
      summary: { pending: 1, approved: 0, rejected: 0, processed: 0 },
    }));
    await page.goto(baseURL + "/admin/billing");
    await expect(page.getByRole("heading", { name: "Billing and refunds" })).toBeVisible();
    await expect(page.getByText("Refund learner fixture")).toBeVisible();
    await expect(page.getByRole("button", { name: "Approve & refund", exact: true })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Reject", exact: true })).toHaveCount(0);
    await expect(page.getByText("Charged twice for the same course.")).toBeVisible();
    expect(refundMutations).toBe(0);
  });

  test("[ADM-COURSE-PUBLISH-READINESS-001] course cannot be published when readiness checks fail", async ({ page }) => {
    let publishRequests = 0;
    page.on("request", (request) => {
      if (request.url().endsWith("/api/admin/courses/507f1f77bcf86cd799439011/publish") && request.method() === "POST") publishRequests += 1;
    });
    await mockAdminApi(page, {
      user: analystUser,
      adminRole: "course_publisher",
      roleLabel: "Course Publisher",
      permissions: ["dashboard.read", "courses.read", "courses.manage", "courses.publish"],
    });
    await page.route("**/api/admin/courses/507f1f77bcf86cd799439011/readiness", async (route) => json(route, {
      readiness: {
        ready: false,
        passedCount: 2,
        totalChecks: 3,
        failedChecks: [{ key: "lessonTitles", label: "Every lesson needs a title", fix: "Add a title to the missing lesson." }],
      },
    }));
    await page.goto(baseURL + "/admin/courses");
    const publishToggle = page.getByRole("checkbox", { name: "Publish Course reader fixture" });
    await expect(publishToggle).toBeVisible();
    await publishToggle.click();
    await expect(page.getByText("Publishing checklist needs attention")).toBeVisible();
    await expect(page.getByText("Every lesson needs a title")).toBeVisible();
    await expect(publishToggle).not.toBeChecked();
    expect(publishRequests).toBe(0);
  });
  test("[ADM-COMMAND-PERMISSION-001] command palette does not expose routes outside the current permission set", async ({ page }) => {
    await mockAdminApi(page, {
      user: analystUser,
      adminRole: "analyst_auditor",
      roleLabel: "Analyst & Auditor",
      permissions: analystPermissions,
    });
    await page.goto(baseURL + "/admin");
    await expect(page.getByRole("button", { name: "Search pages and actions" })).toBeVisible();
    await page.evaluate(() => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "k", ctrlKey: true, bubbles: true, cancelable: true }));
    });

    const dialog = page.getByRole("dialog", { name: "Search pages and actions" });
    const search = dialog.getByRole("textbox", { name: "Search pages and actions" });
    await expect(search).toBeFocused();
    await search.fill("users");
    await expect(dialog.getByText(/No pages or actions match/i)).toBeVisible();
    await expect(dialog.getByRole("option", { name: /Users/i })).toHaveCount(0);
  });
});
