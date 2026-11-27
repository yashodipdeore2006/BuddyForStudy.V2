import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

const baseURL = process.env.E2E_BASE_URL ?? "http://127.0.0.1:4173";

function escapeHtmlAttributeText(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
const publicPages = [
  { name: "Homepage", path: "/", title: "AI-Powered Career Learning Platform | BuddyForStudy", description: "BuddyForStudy is an AI-powered career learning platform. Explore career paths, follow structured skill roadmaps, discover curated courses and learning resources, and track your learning progress." },
  { name: "About", path: "/about", title: "About BuddyForStudy | AI-Powered Career Learning", description: "career exploration, structured skill roadmaps, curated courses, and learning progress" },
  { name: "Contact", path: "/contact", title: "Contact BuddyForStudy | Support & Help", description: "official support information published on our website" },
  { name: "Help Centre", path: "/faq", title: "BuddyForStudy Help Centre | FAQs", description: "career roadmaps, curated courses, learning progress, plans, payments" },
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
    const routeIndexPath = route.path === "/" ? "/index.html" : route.path + "/index.html";
    const canonicalUrl = "https://buddyforstudy.example" + route.path;
    const response = await page.request.get(baseURL + routeIndexPath);
    expect(response.ok()).toBeTruthy();
    const html = await response.text();
    expect(html).toContain("<title>" + escapeHtmlAttributeText(route.title) + "</title>");
    expect(html.toLowerCase()).toContain(route.description.toLowerCase());
    expect(html).toContain('rel="canonical" href="' + canonicalUrl + '"');
    expect(html).toContain('property="og:url" content="' + canonicalUrl + '"');
    expect(html).toContain('name="twitter:card" content="summary"');
    expect(html).toContain('name="robots" content="index,follow,max-image-preview:large"');

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

test("Google Search Console verification artifacts are served from the public origin", async ({ page }) => {
  const homepageResponse = await page.request.get(baseURL + "/");
  expect(homepageResponse.ok()).toBeTruthy();
  const homepage = await homepageResponse.text();
  expect(homepage).toContain('name="google-site-verification" content="YUDG8DYjMkIs8FZVIStx7gHVytPwvvtujxRccUGklXc"');

  const fileResponse = await page.request.get(baseURL + "/googlee5d053a421eb0750.html");
  expect(fileResponse.ok()).toBeTruthy();
  expect((await fileResponse.text()).trim()).toBe("google-site-verification: googlee5d053a421eb0750.html");
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
