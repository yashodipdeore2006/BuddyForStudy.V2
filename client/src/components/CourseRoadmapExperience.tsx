import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import {
  AlertCircle,
  ArrowRight,
  BookOpen,
  Check,
  CheckCircle2,
  Circle,
  CircleDot,
  Clock3,
  Code2,
  ExternalLink,
  FileText,
  Github,
  Loader2,
  PlayCircle,
  Search,
  ShieldCheck,
  Target,
  Trophy,
  X
} from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { apiFetch } from "@/lib/api";
import type { CourseRoadmapDocument, CourseRoadmapNode, CourseRoadmapPhase, RoadmapFilter } from "@/lib/courseRoadmap";
import "@/styles/course-roadmap.css";

type Props = {
  courseId: string;
  document: CourseRoadmapDocument;
  enrolled: boolean;
  onEnroll: () => void;
  onContinue: (lessonId: string) => void;
  onToggleCompletion: (lessonId: string, completed: boolean) => Promise<void>;
};

type ResourceVideo = {
  title?: string;
  url?: string;
  videoId?: string;
  duration?: string;
  durationSeconds?: number;
  channelTitle?: string;
  thumbnail?: string;
};

type LessonDetail = {
  description?: string;
  type?: "tutorial" | "project" | "quiz";
  module?: {
    title?: string;
    description?: string;
    resources?: Array<{ title?: string; url?: string; type?: string }>;
  };
  tutorial?: { content?: string; resources?: string[]; videos?: ResourceVideo[] };
  project?: {
    description?: string;
    objectives?: string[];
    requirements?: string[];
    instructions?: string;
    expectedOutcome?: string;
    features?: string[];
    resources?: string[];
    starterCodeUrl?: string;
    videos?: ResourceVideo[];
  };
  quiz?: { focusTopics?: string[]; instructions?: string };
};

const FILTERS: Array<{ id: RoadmapFilter; label: string }> = [
  { id: "all", label: "All Modules" },
  { id: "foundations", label: "Core Foundations" },
  { id: "projects", label: "Hands-On Projects" },
  { id: "completed", label: "Completed" },
  { id: "remaining", label: "Remaining" }
];

function formatHours(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return "Time not specified";
  if (value < 1) return Math.max(1, Math.round(value * 60)) + " min";
  return Number(value.toFixed(1)).toString() + "h";
}

function formatVideoDuration(video: ResourceVideo): string {
  const seconds = Number(video.durationSeconds) || 0;
  if (seconds > 0) {
    const minutes = Math.round(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const remainder = minutes % 60;
    return hours > 0 ? hours + "h " + remainder + "m" : minutes + "m";
  }
  return String(video.duration || "").trim();
}

function safeExternalUrl(value: unknown): string {
  const raw = String(value ?? "").trim();
  if (!raw) return "";
  try {
    const parsed = new URL(raw);
    return parsed.protocol === "https:" || parsed.protocol === "http:" ? parsed.toString() : "";
  } catch {
    return "";
  }
}

function getVideoUrl(video: ResourceVideo): string {
  const direct = safeExternalUrl(video.url);
  if (direct) return direct;
  const id = String(video.videoId || "").trim();
  return /^[a-zA-Z0-9_-]{11}$/.test(id) ? "https://www.youtube.com/watch?v=" + id : "";
}

function uniqueTopicList(values: unknown[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const text = String(value ?? "").replace(/\s+/g, " ").trim();
    if (!text || text.length < 3 || seen.has(text.toLowerCase())) continue;
    seen.add(text.toLowerCase());
    result.push(text);
    if (result.length >= 6) break;
  }
  return result;
}

function getDetailTopics(node: CourseRoadmapNode, detail: LessonDetail | null): string[] {
  const fromProject = [
    ...(detail?.project?.objectives || []),
    ...(detail?.project?.requirements || []),
    ...(detail?.project?.features || [])
  ];
  const tutorialLines = String(detail?.tutorial?.content || "")
    .split(/\r?\n|[•;]+/)
    .map((line) => line.replace(/^(?:[-*#]|\d+[.)])\s*/, "").trim())
    .filter((line) => line.length >= 4 && line.length <= 110 && !/^https?:\/\//i.test(line));
  const descriptionTopics = String(detail?.description || "")
    .split(/[.!?;\n]+/)
    .map((line) => line.trim())
    .filter((line) => line.length >= 8 && line.length <= 110);
  return uniqueTopicList([
    ...(detail?.quiz?.focusTopics || []),
    ...fromProject,
    ...tutorialLines,
    ...descriptionTopics,
    node.description,
    ...(node.subtopics || [])
  ]);
}

function getWhyItMatters(node: CourseRoadmapNode, phase: CourseRoadmapPhase, description: string): string[] {
  if (description) {
    const sentences = description.split(/(?<=[.!?])\s+/).filter(Boolean);
    return sentences.length >= 2
      ? [sentences.slice(0, Math.ceil(sentences.length / 2)).join(" "), sentences.slice(Math.ceil(sentences.length / 2)).join(" ")]
      : [sentences[0] || description, phase.outcome || "This milestone contributes to the outcome of the " + phase.title + " phase."];
  }
  if (phase.outcome) {
    return [
      "This milestone is part of " + phase.title + " and develops the skills required for this stage.",
      phase.outcome
    ];
  }
  return [
    "This lesson is part of " + phase.title + " in " + node.moduleTitle + ".",
    "Completing it moves your course progress forward and prepares you for the next milestone."
  ];
}

function getLessonTask(node: CourseRoadmapNode, detail: LessonDetail | null): string {
  const task = String(
    detail?.project?.instructions ||
    detail?.project?.description ||
    detail?.project?.expectedOutcome ||
    node.projectTask ||
    ""
  ).trim();
  if (task) return task;
  if (node.lessonType === "quiz") return String(detail?.quiz?.instructions || "Complete the knowledge check in the lesson player and review any missed topics.");
  return "Open the lesson, work through the instructor's example, and apply the concept in a small working exercise.";
}

function NodeIcon({ type }: { type: CourseRoadmapNode["type"] }) {
  if (type === "capstone") return <Trophy className="h-4 w-4" aria-hidden="true" />;
  if (type === "project") return <Code2 className="h-4 w-4" aria-hidden="true" />;
  if (type === "checkpoint") return <ShieldCheck className="h-4 w-4" aria-hidden="true" />;
  return <BookOpen className="h-4 w-4" aria-hidden="true" />;
}

function getTypeLabel(type: CourseRoadmapNode["type"]): string {
  return type === "capstone" ? "Capstone" : type === "project" ? "Project" : type === "checkpoint" ? "Checkpoint" : "Core concept";
}

function getStatusLabel(status: CourseRoadmapNode["status"]): string {
  return status === "completed" ? "Completed" : status === "in_progress" ? "In progress" : "Not started";
}

export default function CourseRoadmapExperience({
  courseId,
  document,
  enrolled,
  onEnroll,
  onContinue,
  onToggleCompletion
}: Props) {
  const { session } = useAuth();
  const [activeFilter, setActiveFilter] = useState<RoadmapFilter>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [lessonDetail, setLessonDetail] = useState<LessonDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState("");
  const [checkedTopics, setCheckedTopics] = useState<Record<string, string[]>>({});
  const [savingProgress, setSavingProgress] = useState(false);
  const [progressError, setProgressError] = useState("");
  const [notice, setNotice] = useState("");
  const drawerRef = useRef<HTMLElement>(null);

  const nodesById = useMemo(() => new Map(document.nodes.map((node) => [node.id, node] as const)), [document.nodes]);
  const selectedNode = selectedNodeId ? nodesById.get(selectedNodeId) || null : null;
  const selectedPhase = selectedNode
    ? document.phases.find((phase) => phase.id === selectedNode.phaseId) || document.phases[0]
    : null;

  const visibleNodeIds = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    return new Set(document.nodes.filter((node) => {
      if (activeFilter === "foundations" && !["core", "checkpoint"].includes(node.type)) return false;
      if (activeFilter === "projects" && !["project", "capstone"].includes(node.type)) return false;
      if (activeFilter === "completed" && node.status !== "completed") return false;
      if (activeFilter === "remaining" && node.status === "completed") return false;
      if (!query) return true;
      const content = [node.title, node.moduleTitle, node.phaseTitle, ...node.subtopics].join(" ").toLowerCase();
      return content.includes(query);
    }).map((node) => node.id));
  }, [document.nodes, activeFilter, searchQuery]);

  const selectedTopics = useMemo(
    () => selectedNode ? getDetailTopics(selectedNode, lessonDetail) : [],
    [selectedNode, lessonDetail]
  );
  const checkedForSelectedNode = selectedNode ? checkedTopics[selectedNode.id] || [] : [];
  const whyItMatters = selectedNode && selectedPhase
    ? getWhyItMatters(selectedNode, selectedPhase, String(lessonDetail?.description || selectedNode.description || lessonDetail?.module?.description || ""))
    : [];
  const projectVideos = [
    ...(lessonDetail?.tutorial?.videos || []),
    ...(lessonDetail?.project?.videos || [])
  ].filter((video, index, all) => getVideoUrl(video) && all.findIndex((candidate) => getVideoUrl(candidate) === getVideoUrl(video)) === index);
  const referenceLinks = uniqueTopicList([
    ...(lessonDetail?.tutorial?.resources || []),
    ...(lessonDetail?.project?.resources || [])
  ]).map((value) => ({ label: value.replace(/^https?:\/\//i, "").slice(0, 80), url: safeExternalUrl(value) })).filter((item) => item.url);
  const moduleResources = (lessonDetail?.module?.resources || [])
    .map((resource) => ({
      title: String(resource.title || "Course resource"),
      url: safeExternalUrl(resource.url),
      type: String(resource.type || "link")
    }))
    .filter((resource) => resource.url);
  const documentationResources = moduleResources.filter((resource) => ["document", "article"].includes(resource.type));
  const practiceResources = moduleResources.filter((resource) => resource.type === "repository");
  const otherModuleResources = moduleResources.filter((resource) => !["document", "article", "repository"].includes(resource.type));
  const starterCodeUrl = safeExternalUrl(lessonDetail?.project?.starterCodeUrl);
  const completedPhaseCount = document.phases.filter((phase) => phase.status === "completed").length;

  useEffect(() => {
    if (!selectedNodeId || !enrolled || !session?.user.id) {
      setLessonDetail(null);
      setDetailLoading(false);
      setDetailError("");
      return;
    }

    let active = true;
    setLessonDetail(null);
    setDetailLoading(true);
    setDetailError("");
    apiFetch<{ item?: LessonDetail; module?: LessonDetail["module"] }>(
      "/api/courses/" + encodeURIComponent(courseId) + "/learn/" + encodeURIComponent(selectedNodeId)
    ).then((response) => {
      if (active) setLessonDetail(response.item ? { ...response.item, module: response.module } : null);
    }).catch((error) => {
      if (active) setDetailError(error instanceof Error ? error.message : "Full lesson details are unavailable.");
    }).finally(() => {
      if (active) setDetailLoading(false);
    });

    return () => { active = false; };
  }, [courseId, enrolled, selectedNodeId, session?.user.id]);

  useEffect(() => {
    if (!selectedNodeId) return;
    const previousOverflow = document.body.style.overflow;
    const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    document.body.style.overflow = "hidden";
    const focusTimer = window.setTimeout(() => {
      drawerRef.current?.querySelector<HTMLElement>("button, a[href], input, [tabindex]:not([tabindex='-1'])")?.focus();
    }, 0);

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setSelectedNodeId(null);
        return;
      }
      if (event.key !== "Tab" || !drawerRef.current) return;
      const focusable = Array.from(drawerRef.current.querySelectorAll<HTMLElement>(
        "button:not([disabled]), a[href], input:not([disabled]), [tabindex]:not([tabindex='-1'])"
      ));
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.clearTimeout(focusTimer);
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
      if (previouslyFocused?.isConnected) previouslyFocused.focus();
    };
  }, [selectedNodeId]);

  const openNode = (node: CourseRoadmapNode) => {
    setProgressError("");
    setNotice("");
    setSelectedNodeId(node.id);
  };

  const handleToggleCompletion = async () => {
    if (!selectedNode || !enrolled || savingProgress) return;
    setSavingProgress(true);
    setProgressError("");
    setNotice("");
    try {
      await onToggleCompletion(selectedNode.id, selectedNode.status !== "completed");
      setNotice(selectedNode.status === "completed" ? "Milestone moved back to in progress." : "Milestone marked as completed.");
    } catch (error) {
      setProgressError(error instanceof Error ? error.message : "Unable to update learning progress.");
    } finally {
      setSavingProgress(false);
    }
  };

  const toggleTopic = (topic: string) => {
    if (!selectedNode) return;
    setCheckedTopics((current) => {
      const previous = current[selectedNode.id] || [];
      const next = previous.includes(topic) ? previous.filter((item) => item !== topic) : [...previous, topic];
      return { ...current, [selectedNode.id]: next };
    });
  };

  const currentNode = document.nodes.find((node) => node.status === "in_progress");
  const currentPhase = document.phases.find((phase) => phase.id === document.progress.currentPhaseId);
  const outcome = document.courseMeta.outcome || "Follow a structured path through this course, one milestone at a time.";
  const cssVars = {
    "--roadmap-primary": document.brandThemeTokens.primary,
    "--roadmap-secondary": document.brandThemeTokens.secondary,
    "--roadmap-bg": document.brandThemeTokens.background,
    "--roadmap-surface": document.brandThemeTokens.surface,
    "--roadmap-surface-muted": document.brandThemeTokens.surfaceMuted,
    "--roadmap-border": document.brandThemeTokens.border,
    "--roadmap-text": document.brandThemeTokens.text,
    "--roadmap-muted": document.brandThemeTokens.mutedText
  } as CSSProperties;

  return (
    <div className="bfs-course-roadmap" style={cssVars}>
      <header className="bfs-roadmap-hero">
        <div className="bfs-roadmap-hero__copy">
          <p className="bfs-roadmap-eyebrow">YOUR COURSE ROADMAP</p>
          <h1>{document.courseMeta.title}</h1>
          <p className="bfs-roadmap-hero__outcome">{outcome}</p>
          <div className="bfs-roadmap-hero__tags">
            {document.courseMeta.level && <span>{document.courseMeta.level}</span>}
            <span>{document.courseMeta.phaseCount} phases</span>
            <span>{document.courseMeta.lessonCount} milestones</span>
          </div>
        </div>
        <div className="bfs-roadmap-hero__actions">
          {enrolled && currentNode ? (
            <button type="button" className="bfs-roadmap-primary-button" onClick={() => onContinue(currentNode.id)}>
              Continue learning <ArrowRight size={16} aria-hidden="true" />
            </button>
          ) : !enrolled ? (
            <button type="button" className="bfs-roadmap-primary-button" onClick={onEnroll}>
              View course and enroll <ArrowRight size={16} aria-hidden="true" />
            </button>
          ) : null}
        </div>
      </header>

      <section className="bfs-roadmap-telemetry" aria-label="Live learning progress">
        <article className="bfs-roadmap-telemetry__completion">
          <div className="bfs-roadmap-telemetry__label">
            <span>Course completion</span>
            <strong>{enrolled ? document.progress.percent + "%" : "Preview"}</strong>
          </div>
          <div className="bfs-roadmap-progress-track" role="progressbar" aria-label="Course completion" aria-valuemin={0} aria-valuemax={100} aria-valuenow={document.progress.percent}>
            <span style={{ width: document.progress.percent + "%" }} />
          </div>
          <p>{enrolled ? document.progress.completedCount + " of " + document.progress.totalCount + " milestones complete" : "Enroll to track your progress across milestones."}</p>
        </article>
        <article className="bfs-roadmap-telemetry__metric">
          <span><Clock3 size={16} aria-hidden="true" /> Estimated time left</span>
          <strong>{document.progress.completedCount === document.progress.totalCount && document.progress.totalCount > 0 ? "0h" : document.progress.hoursRemaining > 0 ? formatHours(document.progress.hoursRemaining) : "Not estimated"}</strong>
          <small>Based on available course durations</small>
        </article>
        <article className="bfs-roadmap-telemetry__metric">
          <span><Target size={16} aria-hidden="true" /> Current phase</span>
          <strong>{enrolled ? currentPhase?.title || "Course completed" : "Course preview"}</strong>
          <small>{completedPhaseCount} of {document.phases.length} phases cleared</small>
        </article>
        <article className="bfs-roadmap-telemetry__metric">
          <span><Trophy size={16} aria-hidden="true" /> Milestones</span>
          <strong>{document.progress.completedCount} / {document.progress.totalCount}</strong>
          <small>Completed across your course roadmap</small>
        </article>
      </section>

      <section className="bfs-roadmap-explorer" aria-label="Course roadmap explorer">
        <div className="bfs-roadmap-explorer__toolbar">
          <div className="bfs-roadmap-filters" role="group" aria-label="Filter roadmap milestones">
            {FILTERS.map((filter) => (
              <button
                key={filter.id}
                type="button"
                className={activeFilter === filter.id ? "is-active" : ""}
                aria-pressed={activeFilter === filter.id}
                onClick={() => setActiveFilter(filter.id)}
              >
                {filter.label}
              </button>
            ))}
          </div>
          <label className="bfs-roadmap-search">
            <Search size={16} aria-hidden="true" />
            <span className="bfs-sr-only">Search roadmap milestones</span>
            <input value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} placeholder="Search milestones or topics" />
            {searchQuery && <button type="button" aria-label="Clear search" onClick={() => setSearchQuery("")}><X size={14} /></button>}
          </label>
        </div>

        <div className="bfs-roadmap-phase-list">
          {document.phases.map((phase) => {
            const phaseNodes = phase.nodeIds.map((nodeId) => nodesById.get(nodeId)).filter((node): node is CourseRoadmapNode => Boolean(node && visibleNodeIds.has(node.id)));
            if (!phaseNodes.length) return null;
            const phaseStyle = { "--phase-fill": phase.completionPercent + "%" } as CSSProperties;
            return (
              <section className="bfs-roadmap-phase" key={phase.id} aria-labelledby={"phase-title-" + phase.id}>
                <header className="bfs-roadmap-phase__header">
                  <div className="bfs-roadmap-phase__number">{String(phase.order).padStart(2, "0")}</div>
                  <div className="bfs-roadmap-phase__heading">
                    <p>PHASE {phase.order} · {phase.nodeCount} MILESTONES</p>
                    <h2 id={"phase-title-" + phase.id}>{phase.title}</h2>
                    {phase.outcome && <span>{phase.outcome}</span>}
                  </div>
                  <div className="bfs-roadmap-phase__stats">
                    <strong>{phase.completionPercent}%</strong>
                    <span>{formatHours(phase.estimatedHours)}</span>
                  </div>
                </header>
                {phase.skills.length > 0 && (
                  <div className="bfs-roadmap-phase__skills" aria-label="Phase focus areas">
                    {phase.skills.map((skill) => <span key={skill}>{skill}</span>)}
                  </div>
                )}
                <div className="bfs-roadmap-node-list" style={phaseStyle}>
                  {phaseNodes.map((node) => (
                    <button
                      type="button"
                      key={node.id}
                      className={[
                        "bfs-roadmap-node",
                        "bfs-roadmap-node--" + node.type,
                        node.status === "completed" ? "is-completed" : "",
                        node.status === "in_progress" ? "is-current" : ""
                      ].filter(Boolean).join(" ")}
                      onClick={() => openNode(node)}
                      aria-label={"Open " + node.title + ". " + getTypeLabel(node.type) + ". " + getStatusLabel(node.status)}
                    >
                      <span className="bfs-roadmap-node__rail">
                        <span className="bfs-roadmap-node__dot">
                          {node.status === "completed" ? <Check size={15} aria-hidden="true" /> : <NodeIcon type={node.type} />}
                        </span>
                      </span>
                      <span className="bfs-roadmap-node__card">
                        <span className="bfs-roadmap-node__topline">
                          <span className="bfs-roadmap-node__type"><NodeIcon type={node.type} />{getTypeLabel(node.type)}</span>
                          <span className={"bfs-roadmap-node__status node-status--" + node.status}>
                            {node.status === "completed" ? <CheckCircle2 size={13} /> : node.status === "in_progress" ? <CircleDot size={13} /> : <Circle size={13} />}
                            {getStatusLabel(node.status)}
                          </span>
                        </span>
                        <span className="bfs-roadmap-node__title">{node.title}</span>
                        <span className="bfs-roadmap-node__meta">
                          <span>{node.moduleTitle}</span>
                          <span><Clock3 size={13} />{formatHours(node.estimatedHours)}</span>
                          {node.prerequisites.length > 0 && <span>Requires previous milestone</span>}
                        </span>
                        {node.subtopics.length > 0 && (
                          <span className="bfs-roadmap-node__topics">
                            {node.subtopics.slice(0, 3).map((topic) => <span key={topic}>{topic}</span>)}
                          </span>
                        )}
                      </span>
                      <ArrowRight className="bfs-roadmap-node__arrow" size={17} aria-hidden="true" />
                    </button>
                  ))}
                </div>
              </section>
            );
          })}
          {visibleNodeIds.size === 0 && (
            <div className="bfs-roadmap-empty">
              <Search size={22} aria-hidden="true" />
              <strong>No matching milestones</strong>
              <span>Try another search term or choose a different filter.</span>
              <button type="button" onClick={() => { setSearchQuery(""); setActiveFilter("all"); }}>Clear filters</button>
            </div>
          )}
        </div>
      </section>

      {selectedNode && selectedPhase && (
        <div className="bfs-roadmap-drawer-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setSelectedNodeId(null); }}>
          <aside
            ref={drawerRef}
            className="bfs-roadmap-drawer"
            role="dialog"
            aria-modal="true"
            aria-labelledby="bfs-roadmap-drawer-title"
            aria-describedby="bfs-roadmap-drawer-description"
          >
            <div className="bfs-roadmap-drawer__handle" aria-hidden="true" />
            <header className="bfs-roadmap-drawer__header">
              <div>
                <p>PHASE {selectedPhase.order} · {selectedPhase.title}</p>
                <h2 id="bfs-roadmap-drawer-title">{selectedNode.title}</h2>
                <div className="bfs-roadmap-drawer__badges">
                  <span>{getTypeLabel(selectedNode.type)}</span>
                  <span>{getStatusLabel(selectedNode.status)}</span>
                  <span>{formatHours(selectedNode.estimatedHours)}</span>
                </div>
              </div>
              <button type="button" className="bfs-roadmap-icon-button" aria-label="Close milestone details" onClick={() => setSelectedNodeId(null)}><X size={19} /></button>
            </header>

            <div className="bfs-roadmap-drawer__content" id="bfs-roadmap-drawer-description">
              <section className="bfs-roadmap-detail-section">
                <h3>Why this matters</h3>
                {whyItMatters.map((paragraph, index) => <p key={index}>{paragraph}</p>)}
              </section>

              <section className="bfs-roadmap-detail-section">
                <div className="bfs-roadmap-detail-section__title">
                  <h3>Key topics</h3>
                  <span>{checkedForSelectedNode.length}/{selectedTopics.length} reviewed</span>
                </div>
                {selectedTopics.length > 0 ? (
                  <div className="bfs-roadmap-topic-list">
                    {selectedTopics.map((topic) => (
                      <label key={topic} className={checkedForSelectedNode.includes(topic) ? "is-checked" : ""}>
                        <input type="checkbox" checked={checkedForSelectedNode.includes(topic)} onChange={() => toggleTopic(topic)} />
                        <span>{topic}</span>
                      </label>
                    ))}
                  </div>
                ) : (
                  <p className="bfs-roadmap-muted">Topic-level metadata has not been added to this lesson yet. Open the lesson to review its full content.</p>
                )}
                {selectedPhase.skills.length > 0 && <div className="bfs-roadmap-phase-focus"><span>Phase focus</span>{selectedPhase.skills.map((skill) => <span key={skill}>{skill}</span>)}</div>}
              </section>

              <section className="bfs-roadmap-detail-section">
                <h3>Hands-on action</h3>
                <div className="bfs-roadmap-action-card">
                  <Target size={18} aria-hidden="true" />
                  <p>{getLessonTask(selectedNode, lessonDetail)}</p>
                </div>
                {lessonDetail?.project?.expectedOutcome && <p className="bfs-roadmap-muted"><strong>Expected result:</strong> {lessonDetail.project.expectedOutcome}</p>}
              </section>

              <section className="bfs-roadmap-detail-section">
                <div className="bfs-roadmap-detail-section__title">
                  <h3>Curated resources</h3>
                  {detailLoading && <span className="bfs-roadmap-loading"><Loader2 size={14} />Loading lesson resources</span>}
                </div>
                {detailError && <p className="bfs-roadmap-resource-note" role="status"><AlertCircle size={15} />{detailError}</p>}
                {!enrolled && <p className="bfs-roadmap-muted">Full curated videos, references and practice material are available after enrollment.</p>}
                {projectVideos.length > 0 && (
                  <div className="bfs-roadmap-resource-group">
                    <h4><PlayCircle size={15} />Video tutorials</h4>
                    {projectVideos.map((video) => {
                      const url = getVideoUrl(video);
                      return (
                        <a key={url} href={url} target="_blank" rel="noopener noreferrer">
                          <span><strong>{video.title || "Course video"}</strong><small>{video.channelTitle || "YouTube"}{formatVideoDuration(video) ? " · " + formatVideoDuration(video) : ""}</small></span>
                          <ExternalLink size={14} />
                        </a>
                      );
                    })}
                  </div>
                )}
                {referenceLinks.length > 0 && (
                  <div className="bfs-roadmap-resource-group">
                    <h4><FileText size={15} />Reference links</h4>
                    {referenceLinks.map((item) => (
                      <a key={item.url} href={item.url} target="_blank" rel="noopener noreferrer">
                        <span><strong>{item.label}</strong><small>Provided with this lesson</small></span>
                        <ExternalLink size={14} />
                      </a>
                    ))}
                  </div>
                )}
                {documentationResources.length > 0 && (
                  <div className="bfs-roadmap-resource-group">
                    <h4><FileText size={15} />Documentation & articles</h4>
                    {documentationResources.map((resource) => (
                      <a key={resource.url} href={resource.url} target="_blank" rel="noopener noreferrer">
                        <span><strong>{resource.title}</strong><small>Course-provided reference</small></span>
                        <ExternalLink size={14} />
                      </a>
                    ))}
                  </div>
                )}
                {practiceResources.length > 0 && (
                  <div className="bfs-roadmap-resource-group">
                    <h4><Github size={15} />Practice repositories</h4>
                    {practiceResources.map((resource) => (
                      <a key={resource.url} href={resource.url} target="_blank" rel="noopener noreferrer">
                        <span><strong>{resource.title}</strong><small>Course-provided repository</small></span>
                        <ExternalLink size={14} />
                      </a>
                    ))}
                  </div>
                )}
                {otherModuleResources.length > 0 && (
                  <div className="bfs-roadmap-resource-group">
                    <h4><ExternalLink size={15} />More course resources</h4>
                    {otherModuleResources.map((resource) => (
                      <a key={resource.url} href={resource.url} target="_blank" rel="noopener noreferrer">
                        <span><strong>{resource.title}</strong><small>Course-provided link</small></span>
                        <ExternalLink size={14} />
                      </a>
                    ))}
                  </div>
                )}
                {starterCodeUrl && (
                  <div className="bfs-roadmap-resource-group">
                    <h4><Github size={15} />Practice material</h4>
                    <a href={starterCodeUrl} target="_blank" rel="noopener noreferrer">
                      <span><strong>Open starter code</strong><small>Project repository or workspace</small></span>
                      <ExternalLink size={14} />
                    </a>
                  </div>
                )}
                {!detailLoading && enrolled && !detailError && projectVideos.length === 0 && referenceLinks.length === 0 && documentationResources.length === 0 && practiceResources.length === 0 && otherModuleResources.length === 0 && !starterCodeUrl && (
                  <p className="bfs-roadmap-muted">No separate resource links are attached to this lesson. Open it in the player for the lesson content.</p>
                )}
              </section>
            </div>

            <footer className="bfs-roadmap-drawer__footer">
              {enrolled ? (
                <>
                  <button type="button" className="bfs-roadmap-secondary-button" onClick={() => onContinue(selectedNode.id)}>
                    <BookOpen size={16} />Open lesson
                  </button>
                  <button type="button" className="bfs-roadmap-primary-button" onClick={() => void handleToggleCompletion()} disabled={savingProgress}>
                    {savingProgress ? <Loader2 size={16} className="animate-spin" /> : selectedNode.status === "completed" ? <CircleDot size={16} /> : <CheckCircle2 size={16} />}
                    {savingProgress ? "Saving…" : selectedNode.status === "completed" ? "Mark as In Progress" : "Mark as Completed"}
                  </button>
                </>
              ) : (
                <button type="button" className="bfs-roadmap-primary-button" onClick={onEnroll}>
                  Enroll to track progress <ArrowRight size={16} />
                </button>
              )}
              {progressError && <p className="bfs-roadmap-drawer__error" role="alert">{progressError}</p>}
              {notice && <p className="bfs-roadmap-drawer__notice" role="status">{notice}</p>}
            </footer>
          </aside>
        </div>
      )}
    </div>
  );
}
