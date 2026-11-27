import { connectDatabase, disconnectDatabase } from "../config/db.js";
import { invalidateCourseTaxonomyCache } from "../services/courseTaxonomyCache.service.js";
import { Course } from "../models/Course.js";
import { resolveCourseDomain } from "../utils/courseTaxonomy.js";

const APPLY = process.argv.includes("--apply");
const BATCH_SIZE = 500;

function readLimit() {
  const separateIndex = process.argv.indexOf("--limit");
  const inlineValue = process.argv.find((argument) => argument.startsWith("--limit="))?.slice("--limit=".length);
  const rawValue = inlineValue ?? (separateIndex >= 0 ? process.argv[separateIndex + 1] : undefined);
  if (rawValue === undefined) return 0;
  const limit = Number(rawValue);
  if (!Number.isSafeInteger(limit) || limit < 1) {
    throw new TypeError("--limit must be a positive safe integer.");
  }
  return limit;
}

async function flush(operations) {
  if (!operations.length) return;
  await Course.bulkWrite(operations, { ordered: false });
  operations.length = 0;
}

async function main() {
  const limit = readLimit();
  await connectDatabase();
  try {
    const filter = {
      $or: [
        { domain: null },
        { domain: { $exists: false } }
      ]
    };
    let scanned = 0;
    let classified = 0;
    let unclassified = 0;
    const byDomain = {};
    const unmatchedCategories = {};
    const operations = [];
    const cursor = Course.find(filter)
      .select("_id category domain")
      .sort({ _id: 1 })
      .limit(limit)
      .lean()
      .cursor({ batchSize: BATCH_SIZE });

    for await (const course of cursor) {
      scanned += 1;
      const domain = resolveCourseDomain(course.category);
      if (!domain) {
        unclassified += 1;
        const category = String(course.category || "(empty)").trim() || "(empty)";
        unmatchedCategories[category] = (unmatchedCategories[category] || 0) + 1;
        continue;
      }

      classified += 1;
      byDomain[domain] = (byDomain[domain] || 0) + 1;
      if (APPLY) {
        operations.push({
          updateOne: {
            filter: {
              _id: course._id,
              $or: [{ domain: null }, { domain: { $exists: false } }]
            },
            update: { $set: { domain } }
          }
        });
        if (operations.length >= BATCH_SIZE) await flush(operations);
      }
    }

    if (APPLY) {
      await flush(operations);
      await invalidateCourseTaxonomyCache();
    }

    console.info(JSON.stringify({
      mode: APPLY ? "apply" : "dry-run",
      scanned,
      classified,
      unclassified,
      byDomain,
      unmatchedCategories,
      limit: limit || null
    }, null, 2));

    if (!APPLY) {
      console.info("Dry run only. No course records were changed. Re-run with --apply to persist recognized category mappings.");
    } else {
      console.info("Backfill complete. Unrecognized categories were left unchanged for administrator review.");
    }
  } finally {
    await disconnectDatabase();
  }
}

main().catch((error) => {
  console.error("Course domain backfill failed", {
    name: error?.name || "Error",
    message: String(error?.message || error).slice(0, 300)
  });
  process.exitCode = 1;
});
