const baseUrl = (process.env.DEPLOYMENT_URL || "").replace(/\/$/, "");
if (!baseUrl) throw new Error("DEPLOYMENT_URL is required");

async function checkApi(path) {
  const response = await fetch(baseUrl + path);
  const body = await response.json().catch(() => ({}));
  if (!response.ok || body.success === false) {
    throw new Error(path + " failed with HTTP " + response.status);
  }
  console.log("PASS API", path);
}

async function checkFrontend() {
  const frontendUrl = String(process.env.FRONTEND_DEPLOYMENT_URL || "").trim();
  if (!frontendUrl) {
    console.log("SKIP frontend smoke check: FRONTEND_DEPLOYMENT_URL was not provided");
    return;
  }

  const response = await fetch(frontendUrl, { redirect: "follow" });
  const contentType = response.headers.get("content-type") || "";
  if (!response.ok || !contentType.toLowerCase().includes("text/html")) {
    throw new Error("Frontend smoke check failed: expected an HTML response, received HTTP " + response.status);
  }
  console.log("PASS frontend", frontendUrl);
}

await checkApi("/api/health");
await checkApi("/api/health/ready");
await checkApi("/api/billing/plans");
await checkApi("/api/auth/google/config");
await checkFrontend();
console.log("Deployment verification passed:", baseUrl);
