import { test, expect } from "@playwright/test";

const baseURL = process.env.E2E_BASE_URL ?? "http://127.0.0.1:4173";

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("bfs-cookie-consent-v1", JSON.stringify({
      version: "cookie-choice-v1",
      preferences: { necessary: true, analytics: false, marketing: false },
      updatedAt: new Date().toISOString()
    }));
  });

  await page.route("**/api/auth/google/config", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ success: true, enabled: false, clientId: "" })
  }));
});

test("login form labels are associated and password visibility state is announced", async ({ page }) => {
  await page.goto(`${baseURL}/login`);

  const email = page.getByLabel("Email", { exact: true });
  const password = page.getByLabel("Password", { exact: true });
  await expect(email).toBeVisible();
  await expect(password).toBeVisible();
  await expect(password).toHaveAttribute("type", "password");

  const toggle = page.getByRole("button", { name: "Toggle password visibility" });
  await expect(toggle).toHaveAttribute("aria-pressed", "false");
  await toggle.click();
  await expect(password).toHaveAttribute("type", "text");
  await expect(toggle).toHaveAttribute("aria-pressed", "true");
});

test("login failure is exposed through an assertive alert and stores no session", async ({ page }) => {
  await page.route("**/api/auth/login", (route) => route.fulfill({
    status: 401,
    contentType: "application/json",
    body: JSON.stringify({ success: false, message: "Invalid email or password" })
  }));

  await page.goto(`${baseURL}/login`);
  await page.getByLabel("Email", { exact: true }).fill("learner@example.test");
  await page.getByLabel("Password", { exact: true }).fill("synthetic-password");
  await page.getByRole("button", { name: "Sign In" }).click();

  const alert = page.getByRole("alert");
  await expect(alert).toContainText("Invalid email or password");
  await expect(alert).toHaveAttribute("aria-live", "assertive");
  const auth = await page.evaluate(() => ({
    token: localStorage.getItem("bfs_token"),
    user: localStorage.getItem("bfs_user")
  }));
  expect(auth.token).toBeNull();
  expect(auth.user).toBeNull();
});
