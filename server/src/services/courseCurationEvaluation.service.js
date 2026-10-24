function resourceKey(item) {
  if (item && typeof item === "object") return String(item.sourceId || item.resourceId || item.id || "");
  return String(item || "");
}

function finiteNonNegative(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : 0;
}

export function dcgAtK(rankedIds, relevanceByResourceId, k = 10) {
  const limit = Math.max(0, Math.floor(Number(k) || 0));
  let total = 0;
  for (const [index, id] of (rankedIds || []).slice(0, limit).entries()) {
    const relevance = finiteNonNegative(relevanceByResourceId?.[resourceKey(id)]);
    total += (Math.pow(2, relevance) - 1) / Math.log2(index + 2);
  }
  return total;
}

export function ndcgAtK(rankedIds, relevanceByResourceId, k = 10) {
  const relevanceValues = Object.values(relevanceByResourceId || {})
    .map(finiteNonNegative)
    .sort((a, b) => b - a);
  if (!relevanceValues.some((value) => value > 0)) return null;
  const idealIds = relevanceValues.map((_, index) => String(index));
  const idealMap = Object.fromEntries(relevanceValues.map((value, index) => [String(index), value]));
  const ideal = dcgAtK(idealIds, idealMap, k);
  if (ideal <= 0) return null;
  return dcgAtK(rankedIds, relevanceByResourceId, k) / ideal;
}

export function precisionAtK(rankedIds, relevanceByResourceId, k = 10) {
  const limit = Math.max(0, Math.floor(Number(k) || 0));
  const ranked = (rankedIds || []).slice(0, limit);
  if (!ranked.length) return null;
  const relevant = new Set(Object.entries(relevanceByResourceId || {})
    .filter(([, score]) => finiteNonNegative(score) > 0)
    .map(([id]) => String(id)));
  return ranked.filter((item) => relevant.has(resourceKey(item))).length / ranked.length;
}

export function recallAtK(rankedIds, relevanceByResourceId, k = 10) {
  const relevant = new Set(Object.entries(relevanceByResourceId || {})
    .filter(([, score]) => finiteNonNegative(score) > 0)
    .map(([id]) => String(id)));
  if (!relevant.size) return null;
  const found = new Set((rankedIds || []).slice(0, Math.max(0, Math.floor(Number(k) || 0))).map(resourceKey));
  return [...relevant].filter((id) => found.has(id)).length / relevant.size;
}

export function hiddenGemRecallAtK(rankedIds, hiddenGemResourceIds, k = 10) {
  const gems = new Set((hiddenGemResourceIds || []).map(resourceKey).filter(Boolean));
  if (!gems.size) return null;
  const found = new Set((rankedIds || []).slice(0, Math.max(0, Math.floor(Number(k) || 0))).map(resourceKey));
  return [...gems].filter((id) => found.has(id)).length / gems.size;
}

export function junkRateAtK(rankedIds, junkResourceIds, k = 10) {
  const limit = Math.max(0, Math.floor(Number(k) || 0));
  const ranked = (rankedIds || []).slice(0, limit);
  if (!ranked.length) return null;
  const junk = new Set((junkResourceIds || []).map(resourceKey).filter(Boolean));
  return ranked.filter((item) => junk.has(resourceKey(item))).length / ranked.length;
}

export function evaluateCurationRanking(resources, judgments, k = 10) {
  const ranked = (resources || []).slice(0, Math.max(0, Math.floor(Number(k) || 0)));
  const rankedIds = ranked.map(resourceKey);
  const metrics = {
    ndcgAtK: ndcgAtK(rankedIds, judgments?.relevanceByResourceId || {}, k),
    precisionAtK: precisionAtK(rankedIds, judgments?.relevanceByResourceId || {}, k),
    recallAtK: recallAtK(rankedIds, judgments?.relevanceByResourceId || {}, k),
    hiddenGemRecallAtK: hiddenGemRecallAtK(rankedIds, judgments?.hiddenGemResourceIds || [], k),
    junkRateAtK: junkRateAtK(rankedIds, judgments?.junkResourceIds || [], k),
    topResultReportedCoverage: ranked[0] && Number.isFinite(Number(ranked[0].evidence?.coverage))
      ? Number(ranked[0].evidence.coverage) / 100
      : null
  };
  return { topic: String(judgments?.topic || ""), k, resultCount: ranked.length, metrics };
}

export function summarizeCurationEvaluation(evaluations, { junkRateTarget = 0.05 } = {}) {
  const rows = (evaluations || []).map((entry) => entry?.metrics || entry);
  const average = (key) => {
    const values = rows.map((row) => row?.[key]).filter((value) => Number.isFinite(value));
    return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
  };
  const junkRateAtK = average("junkRateAtK");
  return {
    evaluatedTopics: rows.length,
    meanNdcgAtK: average("ndcgAtK"),
    meanPrecisionAtK: average("precisionAtK"),
    meanRecallAtK: average("recallAtK"),
    meanHiddenGemRecallAtK: average("hiddenGemRecallAtK"),
    meanJunkRateAtK: junkRateAtK,
    meanTopResultReportedCoverage: average("topResultReportedCoverage"),
    junkRateTarget,
    junkRateTargetMet: junkRateAtK === null ? null : junkRateAtK <= junkRateTarget
  };
}
