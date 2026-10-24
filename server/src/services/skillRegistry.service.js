import { Skill } from "../models/Skill.js";
export function normalizeSkillSlug(value) {
  return String(value || "").normalize("NFKC").toLowerCase().replace(/&/g, " and ").replace(/[^a-z0-9+#.]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 160);
}
function normalizeAlias(value) {
  return String(value || "").normalize("NFKC").toLowerCase().replace(/[^a-z0-9+#.]+/g, " ").replace(/\s+/g, " ").trim();
}
function tokenSet(value) { return new Set(normalizeAlias(value).split(" ").filter((token) => token.length > 1)); }
function tokenSimilarity(left, right) {
  const a = tokenSet(left), b = tokenSet(right);
  if (!a.size || !b.size) return 0;
  let intersection = 0;
  for (const token of a) if (b.has(token)) intersection += 1;
  return intersection / (a.size + b.size - intersection);
}
export async function resolveCanonicalSkill(name, { domain = "general", aliases = [], model = Skill } = {}) {
  const displayName = String(name || "").trim().replace(/\s+/g, " ").slice(0, 160);
  if (!displayName) throw new TypeError("A non-empty skill name is required");
  const normalized = normalizeAlias(displayName), slug = normalizeSkillSlug(displayName);
  const suppliedAliases = [...new Set([displayName, ...aliases].map((item) => String(item || "").trim()).filter(Boolean))];
  const docs = await model.find({}).select("_id name aliases domain createdAt").lean();
  const exact = docs.find((item) => [item.name, ...(item.aliases || [])].some((alias) => normalizeAlias(alias) === normalized));
  const slugMatch = exact || docs.find((item) => item._id === slug || normalizeSkillSlug(item.name) === slug);
  const tokenMatch = slugMatch || docs.map((item) => ({
    item, score: Math.max(tokenSimilarity(displayName, item.name), ...(item.aliases || []).map((alias) => tokenSimilarity(displayName, alias)), 0)
  })).filter((candidate) => candidate.score >= 0.8).sort((a, b) => b.score - a.score)[0]?.item;
  if (tokenMatch) {
    const mergedAliases = [...new Set([...(tokenMatch.aliases || []), ...suppliedAliases])].slice(0, 80);
    if (mergedAliases.length !== (tokenMatch.aliases || []).length) await model.updateOne({ _id: tokenMatch._id }, { $set: { aliases: mergedAliases } });
    return { id: tokenMatch._id, name: tokenMatch.name, aliases: mergedAliases, domain: tokenMatch.domain || domain };
  }
  const canonicalId = slug || "skill";
  const existingById = docs.find((item) => item._id === canonicalId);
  if (existingById) {
    const mergedAliases = [...new Set([...(existingById.aliases || []), ...suppliedAliases])].slice(0, 80);
    await model.updateOne({ _id: canonicalId }, { $set: { aliases: mergedAliases } });
    return { id: canonicalId, name: existingById.name, aliases: mergedAliases, domain: existingById.domain || domain };
  }
  try {
    const created = await model.create({ _id: canonicalId, name: displayName, aliases: suppliedAliases, domain: String(domain || "general").slice(0, 40) });
    return { id: created._id, name: created.name, aliases: created.aliases, domain: created.domain };
  } catch (error) {
    if (error?.code !== 11000) throw error;
    const winner = await model.findById(canonicalId).lean();
    if (!winner) throw error;
    return { id: winner._id, name: winner.name, aliases: winner.aliases || [], domain: winner.domain || domain };
  }
}
export async function getRelevantCanonicalSkills(topic, limit = 40, { model = Skill } = {}) {
  const boundedLimit = Math.max(0, Math.min(40, Number(limit) || 40));
  if (!boundedLimit) return [];
  const docs = await model.find({}).select("_id name aliases domain").lean();
  const query = normalizeAlias(topic);
  return docs.map((item) => ({
    id: item._id, name: item.name, domain: item.domain || "general",
    score: Math.max(tokenSimilarity(query, item.name), ...(item.aliases || []).map((alias) => tokenSimilarity(query, alias)), 0)
  })).filter((item) => item.score > 0).sort((a, b) => b.score - a.score || a.name.localeCompare(b.name))
    .slice(0, boundedLimit).map(({ id, name, domain }) => ({ id, name, domain }));
}
export function validateSkillGraph(skills, { logger = console } = {}) {
  const repairs = [];
  const report = (type, detail) => { const repair = { type, ...detail }; repairs.push(repair); logger.info?.("Roadmap skill graph repaired", repair); };
  const source = Array.isArray(skills) ? skills : [], unique = [], seen = new Set();
  for (const skill of source) {
    const id = normalizeSkillSlug(skill?.id || skill?.canonicalSkillId || skill?.name);
    if (!id || seen.has(id)) { report("duplicate_or_empty_id", { id: id || null, name: String(skill?.name || "") }); continue; }
    seen.add(id); unique.push({ ...skill, id, prerequisites: Array.isArray(skill.prerequisites) ? skill.prerequisites : [] });
  }
  const existing = new Set(unique.map((skill) => skill.id));
  for (const skill of unique) {
    const original = skill.prerequisites;
    const seenPrerequisites = new Set();
    const kept = [];
    for (const prerequisite of original) {
      const id = normalizeSkillSlug(prerequisite);
      if (!existing.has(id) || id === skill.id) {
        report("invalid_prerequisite_removed", { skillId: skill.id, prerequisite: id });
      } else if (seenPrerequisites.has(id)) {
        report("duplicate_prerequisite_removed", { skillId: skill.id, prerequisite: id });
      } else {
        seenPrerequisites.add(id);
        kept.push(id);
      }
    }
    if (kept.length !== original.length) skill.prerequisites = kept;
  }
  const importance = (skill) => ({ critical: 5, high: 4, medium: 3, normal: 3, low: 2, optional: 1 }[String(skill.importance || "medium").toLowerCase()] || 3);
  const findCycle = () => {
    const byId = new Map(unique.map((skill) => [skill.id, skill])), state = new Map(), stack = [];
    function visit(skill) {
      state.set(skill.id, 1); stack.push(skill.id);
      for (const dep of skill.prerequisites) {
        if (!byId.has(dep)) continue;
        if (state.get(dep) === 1) {
          const start = stack.lastIndexOf(dep);
          return stack.slice(start).map((id, index, cycle) => ({ from: id, to: cycle[(index + 1) % cycle.length] }));
        }
        if (!state.has(dep)) { const found = visit(byId.get(dep)); if (found) return found; }
      }
      stack.pop(); state.set(skill.id, 2); return null;
    }
    for (const skill of unique) if (!state.has(skill.id)) { const found = visit(skill); if (found) return found; }
    return null;
  };
  let cycle;
  while ((cycle = findCycle())) {
    const edges = cycle.map((edge) => ({ ...edge, skill: unique.find((item) => item.id === edge.from) })).filter((edge) => edge.skill);
    edges.sort((a, b) => importance(a.skill) - importance(b.skill) || a.from.localeCompare(b.from));
    const removed = edges[0];
    removed.skill.prerequisites = removed.skill.prerequisites.filter((id) => id !== removed.to);
    report("cycle_edge_removed", { skillId: removed.from, prerequisite: removed.to, importance: removed.skill.importance || "medium" });
  }
  if (unique.length > 14) {
    const ranked = [...unique].sort((a, b) => importance(b) - importance(a));
    const kept = new Set(ranked.slice(0, 14).map((skill) => skill.id));
    for (const skill of unique.filter((item) => !kept.has(item.id))) report("skill_limit_trimmed", { skillId: skill.id, limit: 14 });
    for (const skill of unique) if (kept.has(skill.id)) {
      skill.prerequisites = skill.prerequisites.filter((id) => {
        if (kept.has(id)) return true;
        report("prerequisite_removed_for_skill_limit", { skillId: skill.id, prerequisite: id, limit: 14 });
        return false;
      });
    }
    unique.splice(0, unique.length, ...unique.filter((item) => kept.has(item.id)));
  }
  while (unique.length < 3) {
    const index = unique.length + 1, id = "core-practice-" + index;
    unique.push({
      id, name: index === 1 ? "Foundations and Setup" : index === 2 ? "Guided Core Practice" : "Applied Practice",
      category: "Foundations", importance: "Medium", prerequisites: unique.length ? [unique[unique.length - 1].id] : [],
      topics: [], searchQueries: [], courseDuration: { minMinutes: 60, targetMinutes: 120, maxMinutes: 180 },
      practiceProject: "", projectPlacement: "none", projectPlan: {},
      quizPolicy: { lessonQuestionCount: 3, moduleQuestionCount: 0, passingScore: 70 }
    });
    report("minimum_skill_added", { skillId: id, minimum: 3 });
  }
  return { skills: unique, repairs };
}
