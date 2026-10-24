import mongoose from "mongoose";

const APPLY = process.argv.includes("--apply");
const URI = process.env.MONGO_URI;
const STAT_KEYS = ["viewCount", "views", "likeCount", "likes", "subscriberCount", "subscribers", "commentCount", "statistics"];

function stripStats(value, changes = [], path = "$") {
  if (Array.isArray(value)) return value.map((item, index) => stripStats(item, changes, `${path}[${index}]`));
  if (!value || typeof value !== "object" || value instanceof Date) return value;
  const next = {};
  for (const [key, child] of Object.entries(value)) {
    if (STAT_KEYS.includes(key)) {
      changes.push(`${path}.${key}`);
      continue;
    }
    next[key] = stripStats(child, changes, `${path}.${key}`);
  }
  return next;
}

async function main() {
  if (!URI) {
    console.error("MONGO_URI must be provided in the process environment. No database was contacted.");
    process.exitCode = 2;
    return;
  }
  await mongoose.connect(URI);
  try {
    const courses = mongoose.connection.collection("courses");
    const cursor = courses.find({}, { projection: { _id: 1, generation: 1, modules: 1 } });
    let scanned = 0;
    let affected = 0;
    let changedFields = 0;
    for await (const course of cursor) {
      scanned += 1;
      const changes = [];
      const generation = course.generation ? stripStats(course.generation, changes, "generation") : course.generation;
      const modules = course.modules ? stripStats(course.modules, changes, "modules") : course.modules;
      if (!changes.length) continue;
      affected += 1;
      changedFields += changes.length;
      console.info(JSON.stringify({ mode: APPLY ? "apply" : "dry-run", courseId: String(course._id), fieldsToRemove: changes.length, paths: changes.slice(0, 20), truncated: changes.length > 20 }));
      if (APPLY) {
        await courses.updateOne({ _id: course._id }, { $set: { ...(generation ? { generation } : {}), ...(modules ? { modules } : {}) } });
      }
    }
    console.info(JSON.stringify({ mode: APPLY ? "apply" : "dry-run", scanned, affected, fieldsToRemove: changedFields, applied: APPLY }));
    if (!APPLY) console.info("Dry run only. Re-run with --apply to persist these changes.");
  } finally {
    await mongoose.disconnect();
  }
}

main().catch((error) => {
  console.error("Statistics cleanup failed", { name: error?.name || "Error", code: error?.code || null });
  process.exitCode = 1;
});
