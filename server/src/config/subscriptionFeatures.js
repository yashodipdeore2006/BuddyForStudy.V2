export const SUBSCRIPTION_FEATURES = [
  { key: "published_courses", label: "Access published courses" },
  { key: "course_search", label: "Normal course search" },
  { key: "learning_progress", label: "Basic learning progress tracking" },
  { key: "ai_course_builder", label: "Build with AI" },
  { key: "personalized_roadmaps", label: "Personalized learning roadmaps" },
  { key: "project_based_learning", label: "Project-based learning" },
  { key: "advanced_ai_paths", label: "Advanced AI learning assistant (summary, notes & lesson Q&A)" },
  { key: "study_planning", label: "Personalized study planning" },
  { key: "priority_recommendations", label: "Priority learning recommendations" },
];

export const SUBSCRIPTION_FEATURE_LABELS = SUBSCRIPTION_FEATURES.map((feature) => feature.label);

const LEGACY_FEATURE_ALIASES = {
  "Everything in Free": [
    "Access published courses",
    "Normal course search",
    "Basic learning progress tracking",
  ],
  "Everything in Pro": [
    "Access published courses",
    "Normal course search",
    "Basic learning progress tracking",
    "Build with AI",
    "Personalized learning roadmaps",
    "Project-based learning",
  ],
  "Advanced AI learning paths": [
    "Advanced AI learning assistant (summary, notes & lesson Q&A)"
  ],
};

export function normalizeSubscriptionFeatures(features = []) {
  const selected = new Set();

  for (const feature of Array.isArray(features) ? features : []) {
    const value = String(feature || "").trim();
    if (!value) continue;

    const aliases = LEGACY_FEATURE_ALIASES[value];
    if (aliases) {
      aliases.forEach((label) => selected.add(label));
      continue;
    }

    if (SUBSCRIPTION_FEATURE_LABELS.includes(value)) {
      selected.add(value);
    }
  }

  return SUBSCRIPTION_FEATURE_LABELS.filter((label) => selected.has(label));
}
