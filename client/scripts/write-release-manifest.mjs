import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const SHA_PATTERN = /^[a-f0-9]{40}$/i;

export function buildReleaseManifest(env = process.env) {
  const candidates = [
    env.RENDER_GIT_COMMIT,
    env.VERCEL_GIT_COMMIT_SHA,
    env.GIT_COMMIT_SHA,
  ];
  const commit = candidates.find((value) => typeof value === "string" && value.trim())?.trim();

  if (!commit || !SHA_PATTERN.test(commit)) {
    throw new Error("A full 40-character Git commit SHA is required from the hosting build environment.");
  }

  return { commit: commit.toLowerCase() };
}

export async function writeReleaseManifest({
  env = process.env,
  outputPath = fileURLToPath(new URL("../dist/release.json", import.meta.url)),
} = {}) {
  const manifest = buildReleaseManifest(env);
  const target = resolve(outputPath);
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, JSON.stringify(manifest, null, 2) + "\n", "utf8");
  return manifest;
}

const invokedPath = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : "";
if (import.meta.url === invokedPath) {
  writeReleaseManifest().then((manifest) => {
    process.stdout.write("Release manifest created for " + manifest.commit + "\n");
  }).catch((error) => {
    console.error("Failed to create release manifest:", String(error?.message || "Unknown error").slice(0, 300));
    process.exitCode = 1;
  });
}
