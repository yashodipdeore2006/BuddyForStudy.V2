import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const workflowUrl = new URL("../../.github/workflows/staging-verification.yml", import.meta.url);

test("staging verification is manual-only and scoped to the V2.2 execution branch", async () => {
  const workflow = await readFile(workflowUrl, "utf8");

  assert.match(workflow, /^on:\n\x20{2}workflow_dispatch:\s*$/m);
  assert.doesNotMatch(workflow, /^\x20{2}(push|pull_request|schedule):/m);
  assert.match(workflow, /if: github\.ref == 'refs\/heads\/buddy-for-study-v2\.2'/);
});

test("staging workflow uses read-only repository permission and a non-deployment staging environment", async () => {
  const workflow = await readFile(workflowUrl, "utf8");

  assert.match(workflow, /permissions:\n\x20{2}contents: read/);
  assert.doesNotMatch(workflow, /contents:\s*write|actions:\s*write|deployments:\s*write/);
  assert.match(workflow, /environment:\n\s+name: staging\n\s+deployment: false/);
  assert.match(workflow, /persist-credentials: false/);
});

test("staging workflow passes only named staging configuration and a secret token to the verifier", async () => {
  const workflow = await readFile(workflowUrl, "utf8");

  for (const name of [
    "STAGING_API_URL",
    "STAGING_FRONTEND_URL",
    "STAGING_GOOGLE_CLIENT_ID",
    "STAGING_BACKGROUND_WORKER_MODE",
    "STAGING_OPERATIONS_ADMIN_TOKEN",
  ]) {
    assert.ok(workflow.includes(name), "Expected staging setting " + name);
  }
  assert.match(workflow, /OPERATIONS_ADMIN_TOKEN: \$\{\{ secrets\.STAGING_OPERATIONS_ADMIN_TOKEN \}\}/);
  assert.match(workflow, /REQUIRE_OPERATIONS_HEALTH: "true"/);
  assert.match(workflow, /run: node src\/scripts\/verifyDeployment\.js/);
});

test("staging verification workflow contains no deploy or data-mutating provider action", async () => {
  const workflow = await readFile(workflowUrl, "utf8");

  assert.doesNotMatch(workflow, /render-deploy|vercel deploy|npm run deploy|razorpay|curl\s+(-X|--request)\s+(POST|PUT|PATCH|DELETE)/i);
});
