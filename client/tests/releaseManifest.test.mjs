import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildReleaseManifest, writeReleaseManifest } from "../scripts/write-release-manifest.mjs";

const shaA = "a".repeat(40);
const shaB = "b".repeat(40);

test("release manifest prefers Render's exact Git commit SHA", () => {
  assert.deepEqual(buildReleaseManifest({
    RENDER_GIT_COMMIT: shaA.toUpperCase(),
    VERCEL_GIT_COMMIT_SHA: shaB,
  }), { commit: shaA });
});

test("release manifest supports Vercel and generic CI commit SHA variables", () => {
  assert.deepEqual(buildReleaseManifest({ VERCEL_GIT_COMMIT_SHA: shaB }), { commit: shaB });
  assert.deepEqual(buildReleaseManifest({ GIT_COMMIT_SHA: shaA }), { commit: shaA });
});

test("release manifest fails closed when the build environment has no full commit SHA", () => {
  assert.throws(() => buildReleaseManifest({}), /full 40-character Git commit SHA is required/);
  assert.throws(() => buildReleaseManifest({ RENDER_GIT_COMMIT: "abc1234" }), /full 40-character Git commit SHA is required/);
});

test("release manifest writer emits a small JSON file with only the commit SHA", async () => {
  const directory = await mkdtemp(join(tmpdir(), "buddyforstudy-release-manifest-"));
  const outputPath = join(directory, "dist", "release.json");

  try {
    const manifest = await writeReleaseManifest({
      env: { RENDER_GIT_COMMIT: shaA },
      outputPath,
    });
    const written = JSON.parse(await readFile(outputPath, "utf8"));
    assert.deepEqual(manifest, { commit: shaA });
    assert.deepEqual(written, { commit: shaA });
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
