import { test, expect } from "@playwright/test";

const baseURL = process.env.E2E_BASE_URL ?? "http://127.0.0.1:4173";

const googleIdentityMock = `
window.google = {
  accounts: {
    id: {
      initialize: (options) => { window.__bfsGoogleOptions = options; },
      renderButton: (container) => {
        const button = document.createElement("button");
        button.type = "button";
        button.textContent = "Continue with Google";
        button.addEventListener("click", () => {
          window.__bfsGoogleOptions.callback({
            credential: window.__bfsGoogleCredential || ""
          });
        });
        container.appendChild(button);
      }
    }
  }
};
`;

async function prepareGooglePage(page, credential = "") {
  await page.addInitScript((mockCredential) => {
    Object.assign(window, { __bfsGoogleCredential: mockCredential });
    localStorage.setItem("bfs-cookie-consent-v1", JSON.stringify({
      version: "cookie-choice-v1",
      preferences: { necessary: true, analytics: false, marketing: false },
      updatedAt: new Date().toISOString()
    }));
  }, credential);

  await page.route("**/api/auth/google/config", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ success: true, enabled: true, clientId: "test-client-id.apps.googleusercontent.com" })
  }));

  await page.route("https://accounts.google.com/gsi/client", (route) => route.fulfill({
    status: 200,
    contentType: "application/javascript",
    body: googleIdentityMock
  }));
}

test("Google prompt dismissal shows a recovery message and does not send a credential", async ({ page }) => {
  let googleAuthRequests = 0;
  page.on("request", (request) => {
    if (new URL(request.url()).pathname === "/api/auth/google") googleAuthRequests += 1;
  });
  await prepareGooglePage(page);
  await page.goto(`${baseURL}/login`);

  const googleButton = page.getByRole("button", { name: "Continue with Google" });
  await expect(googleButton).toBeVisible();
  await googleButton.click();

  await expect(page.getByText(/Google did not return a sign-in credential/i)).toBeVisible();
  await expect(page.getByRole("button", { name: "Reload Google sign-in" })).toBeVisible();
  expect(googleAuthRequests).toBe(0);
});

test("Google credential rejection displays a safe error and never stores a session", async ({ page }) => {
  await prepareGooglePage(page, "synthetic-expired-token");
  await page.route("**/api/auth/google", (route) => route.fulfill({
    status: 401,
    contentType: "application/json",
    body: JSON.stringify({ success: false, message: "Google account could not be verified" })
  }));
  await page.goto(`${baseURL}/login`);

  await page.getByRole("button", { name: "Continue with Google" }).click();
  await expect(page.getByText("Google account could not be verified")).toBeVisible();

  const authState = await page.evaluate(() => ({
    token: localStorage.getItem("bfs_token"),
    user: localStorage.getItem("bfs_user")
  }));
  expect(authState.token).toBeNull();
  expect(authState.user).toBeNull();
});
