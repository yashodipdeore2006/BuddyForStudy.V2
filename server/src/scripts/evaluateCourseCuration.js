import { readFile } from "node:fs/promises";
import mongoose from "mongoose";
import { connectDatabase } from "../config/db.js";
import { curateNormalSearch } from "../services/courseCurationDecisionEngine.service.js";
import { evaluateCurationRanking, summarizeCurationEvaluation } from "../services/courseCurationEvaluation.service.js";

const fixturePath = process.argv[2] || new URL("../../data/course-curation-golden-set.json", import.meta.url).pathname;
const k = Math.max(1, Math.min(10, Number(process.env.CURATION_EVAL_K) || 10));
const junkRateTarget = Math.max(0, Math.min(1, Number(process.env.CURATION_EVAL_MAX_JUNK_RATE) || 0.05));

async function main() {
  let cases;
  try {
    cases = JSON.parse(await readFile(fixturePath, "utf8"));
  } catch (error) {
    throw new Error(
      "Unable to read the expert-labelled curation set at " + fixturePath +
      ". Copy server/data/course-curation-golden-set.example.json to the requested path and add human-labelled resource IDs. " +
      String(error?.message || error)
    );
  }
  if (!Array.isArray(cases) || !cases.length) {
    throw new Error("The curation golden set must be a non-empty JSON array with expert relevance labels.");
  }
  await connectDatabase();
  const evaluations = [];
  for (const entry of cases) {
    const topic = String(entry?.topic || "").trim();
    if (!topic) {
      console.warn("Skipping a curation evaluation row with no topic.");
      continue;
    }
    const result = await curateNormalSearch(topic);
    const evaluation = evaluateCurationRanking(result.resources || [], entry, k);
    evaluations.push(evaluation);
    console.info(JSON.stringify({
      topic,
      results: evaluation.resultCount,
      metrics: evaluation.metrics,
      engineVersion: result.meta?.version || null,
      cacheHit: Boolean(result.meta?.cacheHit)
    }));
  }
  if (!evaluations.length) throw new Error("No valid golden-set topics were evaluated.");
  const summary = summarizeCurationEvaluation(evaluations, { junkRateTarget });
  console.info("Course Curation Decision Engine evaluation summary");
  console.info(JSON.stringify(summary, null, 2));
  console.info("Interpretation: values are valid only to the degree that the resource labels are expert-reviewed and representative.");
  if (summary.junkRateTargetMet === false) process.exitCode = 2;
}

main()
  .catch((error) => {
    console.error(error?.stack || error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.disconnect().catch(() => {});
  });
