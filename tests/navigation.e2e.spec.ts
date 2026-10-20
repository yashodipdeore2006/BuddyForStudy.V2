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
});
