const DOMAIN_DEFINITIONS = [
  {
    id: "software-development",
    label: "Software Development & IT",
    aliases: [
      "software development", "software engineering", "programming", "programming languages",
      "web development", "frontend development", "backend development", "full stack development",
      "mobile app development", "app development", "android development", "ios development",
      "computer science", "information technology", "it software", "it and software", "react", "react js", "react native", "node js", "nodejs", "backend",
      "javascript", "typescript", "python programming", "java programming", "sql programming", "c++",
      "database management", "html", "css", "html css", "mern stack", "mean stack"
    ]
  },
  {
    id: "data-ai",
    label: "Data, Analytics & AI",
    aliases: [
      "data science", "data science and ai", "data science & ai", "data analytics", "data analytics and ai", "data analysis", "business analytics",
      "artificial intelligence", "ai", "machine learning", "deep learning", "generative ai", "data management",
      "large language models", "llm", "big data", "power bi", "tableau", "data engineering",
      "statistics", "data visualization"
    ]
  },
  {
    id: "cloud-infrastructure",
    label: "Cloud & Infrastructure",
    aliases: [
      "cloud computing", "amazon web services", "aws", "microsoft azure", "azure",
      "google cloud", "devops", "docker", "kubernetes", "linux administration",
      "computer networking", "networking", "system administration"
    ]
  },
  {
    id: "cybersecurity",
    label: "Cybersecurity",
    aliases: [
      "cybersecurity", "cyber security", "ethical hacking", "penetration testing",
      "information security", "network security"
    ]
  },
  {
    id: "engineering-technology",
    label: "Engineering & Technology",
    aliases: [
      "engineering", "mechanical engineering", "electrical engineering", "civil engineering",
      "electronics engineering", "electronics", "robotics", "embedded systems", "internet of things",
      "iot", "computer aided design", "cad", "manufacturing", "industrial engineering",
      "automotive engineering", "renewable energy"
    ]
  },
  {
    id: "science-mathematics",
    label: "Science & Mathematics",
    aliases: [
      "science", "mathematics", "math", "physics", "chemistry", "biology",
      "biotechnology", "microbiology", "astronomy", "pure mathematics", "applied mathematics"
    ]
  },
  {
    id: "health-wellness",
    label: "Health & Wellness",
    aliases: [
      "health", "healthcare", "medicine", "medical science", "nursing", "nutrition",
      "fitness", "mental health", "public health", "wellness", "pharmacy"
    ]
  },
  {
    id: "social-sciences-humanities",
    label: "Social Sciences & Humanities",
    aliases: [
      "social sciences", "psychology", "sociology", "history", "philosophy",
      "political science", "economics", "geography", "anthropology", "literature",
      "cultural studies", "international relations"
    ]
  },
  {
    id: "education-teaching",
    label: "Education & Teaching",
    aliases: [
      "education", "teaching", "teacher training", "pedagogy", "instructional design",
      "educational technology", "early childhood education"
    ]
  },
  {
    id: "law-public-policy",
    label: "Law & Public Policy",
    aliases: [
      "law", "legal studies", "corporate law", "public policy", "governance",
      "constitutional law", "criminal law", "public administration"
    ]
  },
  {
    id: "agriculture-environment",
    label: "Agriculture & Environment",
    aliases: [
      "agriculture", "farming", "agronomy", "horticulture", "environmental science",
      "environmental sustainability", "climate science", "ecology", "forestry"
    ]
  },
  {
    id: "hospitality-tourism",
    label: "Hospitality & Tourism",
    aliases: [
      "hospitality", "tourism", "hotel management", "culinary arts", "food service",
      "travel management", "event management"
    ]
  },
  {
    id: "design-creative",
    label: "Design & Creative",
    aliases: [
      "ui ux design", "ui design", "ux design", "user experience design", "graphic design",
      "web design", "visual design", "video editing", "motion graphics", "animation",
      "3d design", "illustration", "product design"
    ]
  },
  {
    id: "business-management",
    label: "Business & Management",
    aliases: [
      "business management", "business administration", "entrepreneurship", "management",
      "project management", "human resources", "operations management", "business strategy",
      "startup management"
    ]
  },
  {
    id: "finance-accounting",
    label: "Finance & Accounting",
    aliases: [
      "finance", "financial analysis", "accounting", "financial accounting",
      "management accounting", "taxation", "banking", "financial management"
    ]
  },
  {
    id: "marketing-sales",
    label: "Marketing & Sales",
    aliases: [
      "digital marketing", "marketing", "social media marketing", "seo", "search engine optimization",
      "content marketing", "sales", "sales management", "brand management"
    ]
  },
  {
    id: "academic-exam-prep",
    label: "Academics & Exam Preparation",
    aliases: [
      "aptitude", "quantitative aptitude", "logical reasoning", "competitive exams",
      "exam preparation", "test preparation", "general knowledge"
    ]
  },
  {
    id: "language-communication",
    label: "Languages & Communication",
    aliases: [
      "english", "english grammar", "spoken english", "communication skills",
      "business communication", "writing skills", "public speaking", "foreign languages"
    ]
  },
  {
    id: "productivity-tools",
    label: "Productivity & Office Tools",
    aliases: [
      "microsoft office", "ms office", "excel", "advanced excel", "powerpoint",
      "word processing", "office productivity", "productivity tools"
    ]
  },
  {
    id: "personal-development",
    label: "Personal & Career Development",
    aliases: [
      "personal development", "career development", "leadership", "time management",
      "soft skills", "interpersonal skills", "critical thinking"
    ]
  },
  {
    id: "other-learning",
    label: "Other Learning Topics",
    aliases: []
  }
];

export const COURSE_DOMAIN_IDS = Object.freeze(DOMAIN_DEFINITIONS.map((domain) => domain.id));

const normalizeTaxonomyText = (value) => String(value || "")
  .normalize("NFKC")
  .toLowerCase()
  .replace(/[^a-z0-9+#]+/g, " ")
  .trim()
  .replace(/\s+/g, " ");

const escapeRegex = (value) => {
  const special = "\\^$.*+?()[]{}|";
  return [...String(value || "")].map((character) =>
    special.includes(character) ? "\\" + character : character
  ).join("");
};

const DOMAIN_LOOKUP = new Map();
for (const domain of DOMAIN_DEFINITIONS) {
  DOMAIN_LOOKUP.set(normalizeTaxonomyText(domain.id), domain);
  DOMAIN_LOOKUP.set(normalizeTaxonomyText(domain.label), domain);
  for (const alias of domain.aliases) DOMAIN_LOOKUP.set(normalizeTaxonomyText(alias), domain);
}

export function isCourseDomainId(value) {
  return COURSE_DOMAIN_IDS.includes(String(value || ""));
}

export function resolveCourseDomain(value) {
  return DOMAIN_LOOKUP.get(normalizeTaxonomyText(value))?.id || null;
}

export function inferCourseDomain(value) {
  const text = ` ${normalizeTaxonomyText(value)} `;
  if (!text.trim()) return null;

  const matchedAliases = [];
  for (const domain of DOMAIN_DEFINITIONS) {
    for (const alias of domain.aliases) {
      const normalizedAlias = normalizeTaxonomyText(alias);
      if (normalizedAlias && text.includes(` ${normalizedAlias} `)) {
        matchedAliases.push({ domainId: domain.id, alias: normalizedAlias });
      }
    }
  }

  // Prefer the most specific phrase. This avoids interpreting "data management"
  // as both a data topic and the broad business category "management".
  const specificMatches = matchedAliases.filter((candidate) =>
    !matchedAliases.some((other) =>
      other.alias.length > candidate.alias.length &&
      (` ${other.alias} `).includes(` ${candidate.alias} `)
    )
  );
  const domains = new Set(specificMatches.map((match) => match.domainId));
  return domains.size === 1 ? [...domains][0] : null;
}

export function courseMatchesInferredDomain(course, expectedDomain) {
  const expected = resolveCourseDomain(expectedDomain);
  if (!expected) return true;
  const declared = course?.domain ? resolveCourseDomain(course.domain) : null;
  const actual = declared || resolveCourseDomain(course?.category);
  // Unknown legacy categories stay discoverable until they are explicitly classified.
  return !actual || actual === expected;
}

export function filterCoursesByInferredDomain(courses, expectedDomain) {
  if (!Array.isArray(courses)) return [];
  if (!expectedDomain) return courses;
  return courses.filter((course) => courseMatchesInferredDomain(course, expectedDomain));
}

export function filterLearningResourcesByInferredDomain(resources, expectedDomain) {
  if (!Array.isArray(resources)) return [];
  const expected = resolveCourseDomain(expectedDomain);
  if (!expected) return resources;
  return resources.filter((resource) => {
    const explicit = resolveCourseDomain(resource?.domain) || resolveCourseDomain(resource?.category);
    const inferred = explicit || inferCourseDomain([
      resource?.title,
      resource?.description,
      ...(Array.isArray(resource?.tags) ? resource.tags : [])
    ].filter(Boolean).join(" "));
    return !inferred || inferred === expected;
  });
}

export function buildCourseDomainFilter(value) {
  const domainId = resolveCourseDomain(value);
  const domain = DOMAIN_DEFINITIONS.find((candidate) => candidate.id === domainId);
  if (!domain) return null;
  const aliases = [...new Set([domain.id, domain.label, ...domain.aliases])].map((alias) => {
    const flexibleAlias = normalizeTaxonomyText(alias)
      .split(" ")
      .map(escapeRegex)
      .join("[\\s\\W_]*");
    return new RegExp("^" + flexibleAlias + "$", "i");
  });
  return {
    $or: [
      { domain: domain.id },
      {
        $and: [
          { $or: [{ domain: null }, { domain: { $exists: false } }] },
          { category: { $in: aliases } }
        ]
      }
    ]
  };
}

export function normalizeCourseTags(value) {
  if (!Array.isArray(value)) return [];
  const tags = [];
  const seen = new Set();
  for (const item of value) {
    if (typeof item !== "string") continue;
    const normalized = item.trim().replace(/\s+/g, " ").toLowerCase().slice(0, 40);
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    tags.push(normalized);
    if (tags.length >= 20) break;
  }
  return tags;
}

export function getCourseTaxonomy() {
  return {
    version: 1,
    domains: DOMAIN_DEFINITIONS.map(({ id, label }) => ({ id, label }))
  };
}
