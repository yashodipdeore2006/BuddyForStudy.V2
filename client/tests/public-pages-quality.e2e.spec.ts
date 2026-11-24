import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

const baseURL = process.env.E2E_BASE_URL ?? "http://127.0.0.1:4173";
const publicPages = [
  { name: "About", path: "/about", title: "About BuddyForStudy | A clearer way to learn", description: "course discovery, structured learning paths, and learner progress" },
  { name: "Contact", path: "/contact", title: "Contact BuddyForStudy | Support and help", description: "official support information and practical guidance" },
  { name: "Help Centre", path: "/faq", title: "BuddyForStudy Help Centre | Frequently asked questions", description: "getting started, accounts, courses, plans, payments, privacy" },
];

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("bfs-cookie-consent-v1", JSON.stringify({
      version: "cookie-choice-v1",
      preferences: { necessary: true, analytics: false, marketing: false },
      updatedAt: new Date().toISOString(),
    }));
  });
  await page.route("**/api/auth/google/config", (route) => route.fulfill({
    status: 200, contentType: "application/json",
    body: JSON.stringify({ success: true, enabled: false, clientId: "" }),
  }));
  await page.route("**/api/public/site-settings", (route) => route.fulfill({
    status: 200, contentType: "application/json", body: JSON.stringify({ settings: {} }),
  }));
  await page.route("**/api/public/faqs", (route) => route.fulfill({
    status: 200, contentType: "application/json", body: JSON.stringify({ faqs: [], categories: [] }),
  }));
});

for (const route of publicPages) {
  test(route.name + " serves route-specific crawler metadata", async ({ page }) => {
    const response = await page.request.get(baseURL + route.path);
    expect(response.ok()).toBeTruthy();
    const html = await response.text();
    expect(html).toContain("<title>" + route.title + "</title>");
    expect(html.toLowerCase()).toContain(route.description.toLowerCase());
    expect(html).toContain('rel="canonical" href="https://buddyforstudy.example' + route.path + '"');
    expect(html).toContain('property="og:url" content="https://buddyforstudy.example' + route.path + '"');
    expect(html).toContain('name="twitter:card" content="summary"');

    await page.goto(baseURL + route.path, { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(page).toHaveTitle(route.title);
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", "index,follow,max-image-preview:large");
  });

  test(route.name + " meets automated WCAG 2.1 AA accessibility checks", async ({ page }) => {
    await page.goto(baseURL + route.path, { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .analyze();
    const summary = results.violations.map((violation) =>
      violation.id + " (" + violation.impact + "): " + violation.help + " — " +
      violation.nodes.map((node) => node.target.join(" ")).join(", ")
    );
    expect(results.violations, summary.join("\n")).toEqual([]);
  });
}

test("Help Centre topic filters and search are keyboard operable", async ({ page }) => {
  await page.goto(baseURL + "/faq", { waitUntil: "domcontentloaded" });
  const topic = page.getByRole("button", { name: /Courses & learning/ });
  await topic.focus();
  await page.keyboard.press("Space");
  await expect(topic).toHaveAttribute("aria-pressed", "true");
  const search = page.getByRole("searchbox", { name: "Search frequently asked questions" });
  await search.focus();
  await search.fill("courses");
  await expect(search).toHaveValue("courses");
  await expect(page.getByText(/answer/i).first()).toBeVisible();
});

test("robots and sitemap publish public URLs and exclude private route families", async ({ page }) => {
  const robotsResponse = await page.request.get(baseURL + "/robots.txt");
  const sitemapResponse = await page.request.get(baseURL + "/sitemap.xml");
  expect(robotsResponse.ok()).toBeTruthy();
  expect(sitemapResponse.ok()).toBeTruthy();
  const robots = await robotsResponse.text();
  const sitemap = await sitemapResponse.text();
  expect(robots).toContain("Sitemap: https://buddyforstudy.example/sitemap.xml");
  for (const path of ["/admin", "/login", "/home", "/billing", "/my-learning", "/learn/", "/playlists/", "/roadmaps/"]) {
    expect(robots).toContain("Disallow: " + path);
    expect(sitemap).not.toContain("buddyforstudy.example" + path);
  }
  for (const path of ["/", "/about", "/contact", "/faq", "/explore", "/pricing", "/legal"]) {
    expect(sitemap).toContain("https://buddyforstudy.example" + path);
  }
});

test("private routes receive noindex and do not retain public canonical URLs", async ({ page }) => {
  await page.goto(baseURL + "/login", { waitUntil: "domcontentloaded" });
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", "noindex,nofollow");
  await expect(page.locator('link[rel="canonical"]')).toHaveCount(0);
});
