const baseUrl = (process.env.DEPLOYMENT_URL || "").replace(/\/$/, "");
if (!baseUrl) throw new Error("DEPLOYMENT_URL is required");

async function check(path) {
  const response = await fetch(baseUrl + path);
  const body = await response.json().catch(() => ({}));
  if (!response.ok || body.success === false) throw new Error(path + " failed with HTTP " + response.status);
  console.log("PASS", path);
}

await check("/api/health");
await check("/api/health/ready");
console.log("Deployment verification passed:", baseUrl);
