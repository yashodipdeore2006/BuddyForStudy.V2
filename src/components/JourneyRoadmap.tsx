import { useEffect, useMemo, useRef, useState } from "react";
import { apiFetch } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { BookOpen, Clock3, X } from "lucide-react";

export type JourneyStage = { id: string; order: number; title: string; hours: number; lessonIds: string[]; skills: string[]; outcome: string; emoji?: string };
type JourneyProgress = { completedLessonIds: string[]; percent: number; stageProgress: number[]; position: number; lastActivityAt: string | null; paceHoursPerDay: number };
type JourneyData = { courseId: string; title: string; theme: string; totalHours: number; stages: JourneyStage[]; progress: JourneyProgress | null };
type Props = { courseId: string; enrolled?: boolean; onViewLessons: (lessonIds: string[]) => void; onEnroll: () => void; onContinue: () => void; nextLessonTitle?: string; completed?: boolean };
type Point = { x: number; y: number };
const scenery = { trail: ["☀️", "🌳", "🌲", "⛰️", "🏔️", "❄️"] };
const rankNames = ["Explorer", "Apprentice", "Builder", "Specialist", "Expert", "Master"];

export default function JourneyRoadmap({ courseId, enrolled, onViewLessons, onEnroll, onContinue, nextLessonTitle, completed = false }: Props) {
  const { session } = useAuth();
  const [data, setData] = useState<JourneyData | null>(null);
  const isEnrolled = enrolled ?? Boolean(data?.progress);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [pace, setPace] = useState(1);
  const [selected, setSelected] = useState<number | null>(null);
  const [displayDistance, setDisplayDistance] = useState(0);
  const [roadLength, setRoadLength] = useState(0);
  const [lengths, setLengths] = useState<number[]>([]);
  const [motionEnabled, setMotionEnabled] = useState(true);
  const [celebrate, setCelebrate] = useState<number[]>([]);
  const pathRef = useRef<SVGPathElement | null>(null);
  const markerRef = useRef<SVGGElement | null>(null);
  const dialogRef = useRef<HTMLElement | null>(null);
  const previousDoneRef = useRef<Set<number>>(new Set());
  const frameRef = useRef<number | null>(null);
  const displayDistanceRef = useRef(0);
  const introRef = useRef(false);
  const previousPositionRef = useRef(0);
  const points = useMemo<Point[]>(() => Array.from({ length: (data?.stages.length || 0) + 1 }, (_, i) => ({ x: i === 0 ? 180 : i % 2 ? 290 : 70, y: i === 0 ? 40 : 40 + i * 210 - 10 })), [data?.stages.length]);
  const pathD = useMemo(() => points.slice(1).reduce((path, b, index) => { const a = points[index]; const m = (b.y - a.y) * 0.55; return path + " C" + a.x + " " + (a.y + m) + " " + b.x + " " + (b.y - m) + " " + b.x + " " + b.y; }, points.length ? "M" + points[0].x + " " + points[0].y : ""), [points]);
  const height = 120 + (data?.stages.length || 0) * 210;
  const targetPosition = isEnrolled ? Math.max(0, Math.min(data?.stages.length || 0, data?.progress?.position || 0)) : 0;
  const rankIndex = data?.stages.length ? Math.min(rankNames.length - 1, Math.floor((data.progress?.stageProgress.filter((value) => value >= 1).length || 0) / data.stages.length * rankNames.length)) : 0;
  const xp = (data?.progress?.completedLessonIds.length || 0) * 50;
  const weightedCompletion = data?.stages.length ? Math.min(1, (data.progress?.position || 0) / data.stages.length) : 0;
  const hoursLeft = Math.max(0, (data?.totalHours || 0) * (1 - weightedCompletion));
  const finishDate = new Date(Date.now() + Math.ceil(hoursLeft / Math.max(1, pace) * 86400000));

  useEffect(() => { let active = true; setLoading(true); setError(""); setData(null); apiFetch("/api/courses/" + encodeURIComponent(courseId) + "/roadmap").then((result) => { if (active) { const roadmap = result.roadmap as JourneyData; setData(roadmap); setPace(roadmap.progress?.paceHoursPerDay || 1); } }).catch((reason) => { if (active) setError(reason instanceof Error ? reason.message : "Unable to load the journey roadmap."); }).finally(() => { if (active) setLoading(false); }); return () => { active = false; }; }, [courseId, enrolled, session?.user?.id]);
  useEffect(() => { const query = window.matchMedia("(prefers-reduced-motion: reduce)"); const sync = () => setMotionEnabled(!query.matches); sync(); query.addEventListener("change", sync); return () => query.removeEventListener("change", sync); }, []);
  useEffect(() => { const road = pathRef.current; if (!road || !data?.stages.length) { setLengths([]); setRoadLength(0); return; } const total = road.getTotalLength(); const found = [0]; for (let i = 1; i < points.length; i += 1) { let low = 0; let high = total; for (let step = 0; step < 40; step += 1) { const mid = (low + high) / 2; if (road.getPointAtLength(mid).y < points[i].y) low = mid; else high = mid; } found.push((low + high) / 2); } setRoadLength(total); setLengths(found); }, [data?.stages.length, pathD, points]);
  const distanceFor = (position: number) => { if (!lengths.length) return 0; const last = lengths.length - 1; if (position >= last) return lengths[last]; const k = Math.max(0, Math.floor(position)); const w = position - k; return lengths[k] + (lengths[k + 1] - lengths[k]) * w; };
  useEffect(() => { if (!lengths.length || !roadLength) return; const target = distanceFor(targetPosition); const oldPosition = previousPositionRef.current; const oldDistance = distanceFor(oldPosition); if (!motionEnabled) { displayDistanceRef.current = target; setDisplayDistance(target); previousPositionRef.current = targetPosition; introRef.current = true; return; } if (frameRef.current !== null) cancelAnimationFrame(frameRef.current); const first = !introRef.current; introRef.current = true; const from = first ? 0 : displayDistanceRef.current || oldDistance; const delta = target - from; const duration = Math.min(1600, Math.max(500, Math.abs(delta) * 1.3)); const started = performance.now(); const animate = (now: number) => { const p = Math.min(1, (now - started) / duration); const eased = p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2; displayDistanceRef.current = from + delta * eased; setDisplayDistance(from + delta * eased); if (p < 1) frameRef.current = requestAnimationFrame(animate); else { frameRef.current = null; previousPositionRef.current = targetPosition; markerRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" }); } }; frameRef.current = requestAnimationFrame(animate); return () => { if (frameRef.current !== null) cancelAnimationFrame(frameRef.current); }; }, [lengths, targetPosition, motionEnabled, roadLength]);
  useEffect(() => {
    if (!data?.progress || !lengths.length || !motionEnabled) { previousDoneRef.current = new Set(); return; }
    const done = new Set(data.progress.stageProgress.map((value, index) => value >= 1 ? index : -1).filter((index) => index >= 0));
    const newlyDone = [...done].filter((index) => !previousDoneRef.current.has(index));
    previousDoneRef.current = done;
    if (!newlyDone.length) return;
    setCelebrate((previous) => [...new Set([...previous, ...newlyDone])]);
    const timer = window.setTimeout(() => setCelebrate((previous) => previous.filter((index) => !newlyDone.includes(index))), 1000);
    return () => window.clearTimeout(timer);
  }, [data?.progress?.percent, lengths.length, motionEnabled]);
  useEffect(() => {
    if (selected === null) return;
    dialogRef.current?.querySelector<HTMLElement>("button, [href], input, select, textarea, [tabindex]:not([tabindex=\"-1\"])")?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") { setSelected(null); return; }
      if (event.key !== "Tab" || !dialogRef.current) return;
      const focusable = Array.from(dialogRef.current.querySelectorAll<HTMLElement>("button, [href], input, select, textarea, [tabindex]:not([tabindex=\"-1\"])")).filter((element) => !element.hasAttribute("disabled"));
      if (!focusable.length) return;
      const first = focusable[0]; const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selected]);
  async function changePace(value: number) { setPace(value); try { await apiFetch("/api/me/learning-pace", { method: "PUT", body: JSON.stringify({ hoursPerDay: value }) }); } catch (reason) { setError(reason instanceof Error ? reason.message : "Unable to save your learning pace."); } }

  if (loading) return <div className="mx-auto max-w-[460px] animate-pulse space-y-4 p-4" role="status" aria-label="Loading journey roadmap"><div className="grid grid-cols-3 gap-3">{[1, 2, 3].map((item) => <div key={item} className="h-20 rounded-2xl bg-slate-200 dark:bg-slate-800" />)}</div><div className="h-[720px] rounded-3xl bg-slate-200 dark:bg-slate-800" /></div>;
  if (error && !data) return <div role="alert" className="rounded-2xl border border-red-200 p-5 text-sm text-red-700">{error}</div>;
  if (!data || !data.stages.length) return <div className="rounded-2xl border border-dashed border-slate-300 p-10 text-center text-sm text-slate-500">Roadmap not available yet.</div>;
  const activeStageIndex = Math.min(data.stages.length - 1, Math.floor(targetPosition));
  const activeStage = data.stages[activeStageIndex];
  const nextStage = data.stages.find((stage) => !(Number(data.progress?.stageProgress[stage.order - 1] || 0) >= 1));
  const svgPoint = pathRef.current?.getPointAtLength(Math.max(0, Math.min(roadLength, displayDistance))) || points[0];
  const decorations = scenery[data.theme as keyof typeof scenery] || scenery.trail;
  return <div className="mx-auto w-full max-w-[460px] pb-24 text-slate-900 dark:text-slate-100">
    <div className="mb-5 grid grid-cols-2 gap-2 sm:grid-cols-4">
      <Stat label="Rank" value={isEnrolled ? rankNames[rankIndex] : "Preview"} />
      <Stat label="XP earned" value={isEnrolled ? String(xp) : "—"} />
      <Stat label="Time left" value={isEnrolled ? hoursLeft.toFixed(1) + " h" : "—"} />
      <Stat label="Finish by" value={isEnrolled ? finishDate.toLocaleDateString(undefined, { day: "numeric", month: "short" }) : "—"} />
    </div>
    {isEnrolled && <div className="mb-4 flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-900"><label htmlFor="journey-pace" className="text-sm font-medium">Daily learning pace</label><select id="journey-pace" value={pace} onChange={(event) => void changePace(Number(event.target.value))} className="input-field w-32 text-sm">{[1, 2, 3, 4].map((hours) => <option key={hours} value={hours}>{hours} h/day</option>)}</select></div>}
    <div className="overflow-hidden rounded-3xl border border-slate-200 bg-gradient-to-b from-emerald-50 via-lime-50 to-slate-100 p-2 dark:border-slate-700 dark:from-slate-900 dark:via-slate-900 dark:to-slate-950">
      <svg viewBox={"0 0 360 " + height} width="100%" height="auto" role="img" aria-label={"Journey roadmap for " + data.title + ", " + data.stages.length + " stages"} className="block h-auto w-full">
        <defs><clipPath id="journey-map-clip"><rect x="4" y="4" width="352" height={height - 8} rx="24" /></clipPath><linearGradient id="journey-trail-gradient" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#10b981" /><stop offset="100%" stopColor="#7c3aed" /></linearGradient></defs>
        <g clipPath="url(#journey-map-clip)">
          {data.stages.map((stage, index) => <rect key={stage.id} x="4" y={index * 210 + 40} width="352" height="210" fill={["#dff3d8", "#d9e8d2", "#e7efd1", "#e6e3d8", "#e1eaf0"][Math.round(index / Math.max(1, data.stages.length - 1) * 4)]} opacity={0.65} />)}
          {points.map((point, index) => <text key={"decor-" + index} x={index % 2 ? 22 : 320} y={point.y + 55} fontSize="21" opacity=".75">{decorations[Math.min(decorations.length - 1, Math.round(index / Math.max(1, points.length - 1) * (decorations.length - 1)))]}</text>)}
          <path ref={pathRef} d={pathD} fill="none" stroke="#b5c4b5" strokeWidth="24" strokeLinecap="round" strokeDasharray="1 16" />
          <path d={pathD} fill="none" stroke="url(#journey-trail-gradient)" strokeWidth="7" strokeLinecap="round" strokeDasharray={displayDistance + " " + (roadLength + 20)} />
          {data.stages.map((stage, index) => { const point = points[index + 1]; const done = displayDistance >= (lengths[index + 1] || Infinity) - 0.5; const now = !done && data.stages.slice(0, index).every((_previous, previousIndex) => displayDistance >= (lengths[previousIndex + 1] || Infinity) - 0.5); const labelX = index % 2 === 0 ? point.x - 28 : point.x + 28; const anchor = index % 2 === 0 ? "end" : "start"; return <g key={stage.id} role="button" tabIndex={0} aria-label={"Open stage " + stage.order + ": " + stage.title} onClick={() => setSelected(index)} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); setSelected(index); } }} className="cursor-pointer outline-none focus-visible:[&>circle]:stroke-violet-600 focus-visible:[&>circle]:stroke-[5]"><circle cx={point.x} cy={point.y} r={now ? 22 : 18} fill={done ? "#dcfce7" : now ? "#fef3c7" : "#f8fafc"} stroke={done ? "#16a34a" : now ? "#d97706" : "#94a3b8"} strokeWidth={now ? 4 : 2} /><text x={point.x} y={point.y + 6} textAnchor="middle" fontSize="17">{done ? (stage.emoji || "✓") : stage.order}</text><text x={labelX} y={point.y - 6} textAnchor={anchor} fontSize="11" fontWeight="700" fill={done || now ? "currentColor" : "#64748b"}>{stage.title.length > 22 ? stage.title.slice(0, 21) + "…" : stage.title}</text><text x={labelX} y={point.y + 11} textAnchor={anchor} fontSize="9" fill={done || now ? "currentColor" : "#64748b"}>{"Stage " + stage.order + " · " + stage.hours + " h"}</text></g>; })}
          {points.length > 0 && <g><circle cx={points[0].x} cy={points[0].y} r="18" fill="#fff" stroke="#0f766e" strokeWidth="3" /><text x={points[0].x} y={points[0].y + 6} textAnchor="middle" fontSize="18">📍</text><text x="208" y="44" fontSize="11" fontWeight="700" fill="currentColor">Start</text></g>}
          {points.length > 1 && <text x={points[points.length - 1].x} y={points[points.length - 1].y + 45} textAnchor="middle" fontSize="23">🏁</text>}
          {isEnrolled && <g ref={markerRef} transform={"translate(" + svgPoint.x + " " + svgPoint.y + ")"}><circle r="25" fill="#8b5cf6" opacity={motionEnabled ? ".16" : "0"} /><circle r="17" fill="#fff" stroke="#7c3aed" strokeWidth="3" /><text textAnchor="middle" y="6" fontSize="17">🧗</text></g>}
        </g>
      </svg>
    </div>
    {isEnrolled && <div className="sticky bottom-2 z-20 mt-4 rounded-2xl border border-slate-200 bg-white/95 p-4 shadow-lg backdrop-blur dark:border-slate-700 dark:bg-slate-900/95"><p className="text-sm font-semibold">Now working on: {activeStage?.title || "Journey start"}</p><p className="mt-1 text-xs text-slate-500">{data.progress?.completedLessonIds.length || 0} of {data.stages.reduce((sum, stage) => sum + stage.lessonIds.length, 0)} lessons done · {data.progress?.percent || 0}%</p><div className="mt-3 h-1.5 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800"><div className="h-full rounded-full bg-violet-600 transition-all" style={{ width: (data.progress?.percent || 0) + "%" }} /></div><button type="button" onClick={completed ? onContinue : onContinue} className="btn-primary mt-4 w-full justify-center">{completed ? "Review course" : nextLessonTitle ? "Continue: " + nextLessonTitle : "Start learning"}</button></div>}
    {!isEnrolled && <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900"><p className="font-semibold">Your learning journey starts here</p><p className="mt-1 text-sm text-slate-500">{data.stages.length} milestones · {data.totalHours} estimated hours</p><button type="button" onClick={onEnroll} className="btn-primary mt-4 w-full justify-center">Enroll to start your journey</button></div>}
    {selected !== null && data.stages[selected] && <div className="fixed inset-0 z-[100] flex items-end justify-center bg-slate-950/40 p-0 sm:items-center sm:p-4" onMouseDown={(event) => { if (event.target === event.currentTarget) setSelected(null); }}><section ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="journey-stage-title" className="max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-t-3xl bg-white p-6 shadow-2xl dark:bg-slate-900 sm:rounded-3xl"><div className="flex items-start justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-wider text-violet-600">Stage {selected + 1} of {data.stages.length}</p><h2 id="journey-stage-title" className="mt-1 text-xl font-bold">{data.stages[selected].title}</h2></div><button type="button" onClick={() => setSelected(null)} aria-label="Close stage details" className="rounded-full p-2 hover:bg-slate-100 dark:hover:bg-slate-800"><X className="h-5 w-5" /></button></div><p className="mt-3 text-sm text-slate-500">{!isEnrolled ? "Preview" : (data.progress?.stageProgress[selected] || 0) >= 1 ? "Complete" : selected === activeStageIndex ? "In progress" : selected > activeStageIndex ? "Up next" : "Locked"} · {data.stages[selected].hours} hours</p><div className="mt-4 h-2 rounded-full bg-slate-100 dark:bg-slate-800"><div className="h-2 rounded-full bg-violet-600" style={{ width: ((data.progress?.stageProgress[selected] || 0) * 100) + "%" }} /></div>{data.stages[selected].skills.length > 0 && <div className="mt-5"><h3 className="text-sm font-semibold">Skills you’ll practice</h3><div className="mt-2 flex flex-wrap gap-2">{data.stages[selected].skills.map((skill) => <span key={skill} className="rounded-full bg-violet-50 px-3 py-1 text-xs font-medium text-violet-700 dark:bg-violet-950 dark:text-violet-200">{skill}</span>)}</div></div>}{data.stages[selected].outcome && <p className="mt-5 text-sm leading-6 text-slate-600 dark:text-slate-300">By the end you will have: {data.stages[selected].outcome}</p>}<button type="button" onClick={() => { onViewLessons(data.stages[selected!].lessonIds); setSelected(null); }} className="btn-primary mt-6 w-full justify-center"><BookOpen className="h-4 w-4" />View lessons</button></section></div>}
    {error && <p role="status" className="mt-3 text-sm text-amber-700">{error}</p>}
  </div>;
}

function Stat({ label, value }: { label: string; value: string }) { return <div className="rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-900"><p className="text-[11px] font-medium text-slate-500">{label}</p><p className="mt-1 truncate text-sm font-bold">{value}</p></div>; }
