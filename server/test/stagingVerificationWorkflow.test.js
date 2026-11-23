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


const finalGateWorkflowUrl = new URL("../../.github/workflows/final-release-gate.yml", import.meta.url);

test("final release gate is manual-only and restricted to the V2.2 execution branch", async () => {
  const workflow = await readFile(finalGateWorkflowUrl, "utf8");

  assert.match(workflow, /^on:\\n\\x20{2}workflow_dispatch:\\s*$/m);
  assert.doesNotMatch(workflow, /^\\x20{2}(push|pull_request|schedule):/m);
  assert.match(workflow, /if: github\\.ref == 'refs\\/heads\\/buddy-for-study-v2\\.2'/);
});

test("final release gate checks the latest exact-SHA CI run and all required jobs", async () => {
  const workflow = await readFile(finalGateWorkflowUrl, "utf8");

  assert.match(workflow, /head_sha === CANDIDATE_SHA/);
  assert.match(workflow, /run\\.name === "BuddyForStudy CI"/);
  assert.match(workflow, /run\\.status !== "completed" \\|\\| ciRun\\.conclusion !== "success"/);
  assert.match(workflow, /\["backend", "frontend", "Production release gate"\]/);
  assert.match(workflow, /ci_run_url=/);
});

test("final release approval requires staging verification and a separately protected environment", async () => {
  const workflow = await readFile(finalGateWorkflowUrl, "utf8");

  assert.match(workflow, /ref: \\$\\{\\{ needs\\.verify-exact-commit-ci\\.outputs\\.candidate_sha \\}\\}/);
  assert.match(workflow, /needs:\\n\\x20{6}- verify-exact-commit-ci\\n\\x20{6}- verify-staging/);
  assert.match(workflow, /name: production-release\\n\\x20{6}deployment: false/);
  assert.match(workflow, /human release approval/);
  assert.match(workflow, /No deployment was performed by this workflow/);
});

test("final release gate uses read-only GitHub permissions and contains no deployment step", async () => {
  const workflow = await readFile(finalGateWorkflowUrl, "utf8");

  assert.match(workflow, /permissions:\\n\\x20{2}contents: read\\n\\x20{2}actions: read/);
  assert.doesNotMatch(workflow, /contents:\\s*write|actions:\\s*write|deployments:\\s*write/);
  assert.doesNotMatch(workflow, /render-deploy|vercel deploy|npm run deploy|terraform apply|kubectl apply/i);
  assert.doesNotMatch(workflow, /github\\.output|github\\.step_summary/);
});
