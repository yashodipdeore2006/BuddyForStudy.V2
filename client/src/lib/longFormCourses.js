const MINIMUM_YOUTUBE_RUNTIME_SECONDS = 20 * 60 * 60;

const TECHNICAL_DOMAIN_IDS = new Set([
  "software-development",
  "data-ai",
  "cloud-infrastructure",
  "cybersecurity",
  "engineering-technology"
]);

const TECHNICAL_TOPIC_PATTERN = /(?:\bprogramming\b|\bweb development\b|\bsoftware\b|\bcomputer science\b|\boperating systems?\b|\bdbms\b|\bcomputer networks?\b|\bdata structures?\b|\balgorithms?\b|\bdsa\b|\bfull[\s-]?stack\b|\bmern\b|\bmean stack\b|\bfrontend\b|\bfront[\s-]?end\b|\bbackend\b|\bback[\s-]?end\b|\breact\b|\bnext\.?js\b|\bnode\.?js\b|\bjavascript\b|\btypescript\b|\bpython\b|\bjava\b|c\+\+|\bsql\b|\bpostgres(?:ql)?\b|\bmysql\b|\bmongodb\b|\bdatabase\b|\bartificial intelligence\b|\bmachine learning\b|\bdeep learning\b|\bai\b|\bgenerative ai\b|\bai agents?\b|\bagentic\b|\brag\b|\bllm\b|\bgpt\b|\bsystem design\b|\bcloud computing\b|\bdevops\b|\bdocker\b|\bkubernetes\b|\baws\b|\bazure\b|\bcyber[\s-]?security\b|\bpenetration testing\b|\bmobile app development\b)/i;

const DOMAIN_LABELS = {
  "software-development": "Software Engineering",
  "data-ai": "Data & AI",
  "cloud-infrastructure": "Cloud & DevOps",
  cybersecurity: "Cybersecurity",
  "engineering-technology": "Engineering Tech"
};

function normalizeText(value) {
  return String(value ?? "").normalize("NFKC").toLowerCase().replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim();
}

function getCourseTopicText(course) {
  const tags = Array.isArray(course?.tags) ? course.tags : [];
  return [
    course?.title,
    course?.category,
    course?.domain,
    ...tags
  ].filter((value) => typeof value === "string").join(" ");
}

function isTechnologyCourse(course) {
  const domainId = normalizeText(course?.domain).replace(/\s/g, "-");
  if (TECHNICAL_DOMAIN_IDS.has(domainId)) return true;
  return TECHNICAL_TOPIC_PATTERN.test(getCourseTopicText(course));
}

function getDomainTag(course) {
  const signals = normalizeText(getCourseTopicText(course));
  const domainId = normalizeText(course?.domain).replace(/\s/g, "-");

  if (/\b(ai agents?|agentic|retrieval augmented generation|rag)\b/.test(signals)) return "AI Agents";
  if (/\b(dsa|data structures?|algorithms?)\b/.test(signals)) return "DSA";
  if (/\b(full stack|mern|mean stack)\b/.test(signals)) return "Full-Stack";
  if (/\b(back end|backend)\b/.test(signals)) return "Backend";
  if (/\b(front end|frontend|react|next js|javascript|typescript)\b/.test(signals)) return "Frontend";
  if (/\bsystem design\b/.test(signals)) return "System Design";
  if (/\b(operating systems?|dbms|computer networks?|computer science)\b/.test(signals)) return "Computer Science";
  if (/\b(cyber security|cybersecurity|ethical hacking|penetration testing)\b/.test(signals)) return "Cybersecurity";
  if (/\b(cloud|devops|docker|kubernetes|aws|azure)\b/.test(signals)) return "Cloud & DevOps";
  if (/\b(database|sql|postgresql|mysql|mongodb)\b/.test(signals)) return "Databases";
  if (/\b(ai|artificial intelligence|machine learning|deep learning|generative ai|llm|gpt)\b/.test(signals)) return "AI & ML";

  const domainLabel = DOMAIN_LABELS[domainId];
  if (domainLabel) return domainLabel;
  const category = String(course?.category || "").trim();
  return category ? category.slice(0, 28) : "Technology";
}

function getSafeThumbnail(value) {
  const thumbnail = String(value ?? "").trim();
  if (/^https:\/\//i.test(thumbnail)) return thumbnail;
  if (thumbnail.startsWith("/") && !thumbnail.startsWith("//")) return thumbnail;
  return null;
}

export function formatCourseRuntime(seconds) {
  const value = Number(seconds);
  if (!Number.isFinite(value) || value <= 0) return "";
  const roundedMinutes = Math.round(value / 60);
  const hours = Math.floor(roundedMinutes / 60);
  const minutes = roundedMinutes % 60;
  return minutes > 0 ? hours + "h " + minutes + "m" : hours + "h";
}

export function toLongFormCourseCard(course) {
  if (!course || typeof course !== "object" || Array.isArray(course)) return null;
  if (course.isPublished !== true) return null;

  const id = String(course._id ?? course.id ?? "").trim();
  const title = String(course.title ?? "").trim();
  const modules = Array.isArray(course.modules) ? course.modules : [];
  const metadata = course.cardMetadata && typeof course.cardMetadata === "object" ? course.cardMetadata : {};
  const runtimeSeconds = Number(metadata.youtubeRuntimeSeconds);

  if (!id || !title || modules.length === 0) return null;
  if (!Number.isFinite(runtimeSeconds) || runtimeSeconds < MINIMUM_YOUTUBE_RUNTIME_SECONDS) return null;
  if (!isTechnologyCourse(course)) return null;

  return {
    id,
    title,
    domainTag: getDomainTag(course),
    durationSeconds: Math.round(runtimeSeconds),
    durationLabel: formatCourseRuntime(runtimeSeconds),
    moduleCount: modules.length,
    thumbnailUrl: getSafeThumbnail(course.thumbnail)
  };
}

export function selectLongFormCourses(courses) {
  if (!Array.isArray(courses)) return [];
  const seen = new Set();
  const result = [];
  for (const course of courses) {
    const card = toLongFormCourseCard(course);
    if (!card || seen.has(card.id)) continue;
    seen.add(card.id);
    result.push(card);
  }
  return result;
}
