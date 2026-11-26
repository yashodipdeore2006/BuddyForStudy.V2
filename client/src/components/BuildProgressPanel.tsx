import { CheckCircle2, Circle, Clock3, LoaderCircle, Sparkles, Video, AlertTriangle } from "lucide-react";
import { getBuildProgress } from "@/lib/buildProgress.js";
import type { BuildProgressNode } from "@/lib/buildProgress.js";

type Props = { topic: string; status: string; nodes: BuildProgressNode[] };

const stages = [
  { id: "curriculum", label: "Designing your learning path", description: "Organizing skills, modules and the right learning sequence." },
  { id: "resources", label: "Finding learning resources", description: "Matching suitable learning material to each lesson." },
  { id: "finalizing", label: "Finishing your roadmap", description: "Saving the generated course and checking the final details." }
] as const;

export default function BuildProgressPanel({ topic, status, nodes }: Props) {
  const progress = getBuildProgress(status, nodes);
  const activeIndex = progress.stage === "queued" || progress.stage === "curriculum" ? 0
    : progress.stage === "resources" ? 1
      : progress.stage === "finalizing" ? 2 : 3;
  const activeStage = stages[Math.min(activeIndex, stages.length - 1)];
  const queued = progress.stage === "queued";
  const failed = progress.stage === "failed";
  const complete = progress.stage === "complete";

  return (
    <section className="mx-auto w-full max-w-xl rounded-2xl border border-violet-100 bg-white p-5 shadow-sm sm:p-7" role="status" aria-live="polite" aria-busy={!complete && !failed}>
      <div className="flex items-start gap-3">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-violet-50 text-violet-700">
          {queued ? <Clock3 size={21} aria-hidden="true" /> : complete ? <CheckCircle2 size={22} aria-hidden="true" /> : failed ? <AlertTriangle size={21} aria-hidden="true" /> : <Sparkles size={21} aria-hidden="true" />}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-bold uppercase tracking-[.14em] text-violet-700">Build with AI</p>
          <h3 className="mt-1 text-lg font-bold tracking-tight text-slate-950">
            {queued ? "Your build is in the queue" : failed ? "Your roadmap needs another try" : complete ? "Your roadmap is ready" : activeStage.label}
          </h3>
          <p className="mt-1 break-words text-sm leading-6 text-slate-600">
            {queued
              ? "We’re preparing your request. Generation will begin as soon as a build slot is available."
              : failed
                ? "The build could not be completed. Review the message below and retry when ready."
                : complete
                  ? "Your personalized learning path has been generated."
                  : activeStage.description}
          </p>
          {topic ? <p className="mt-2 truncate text-xs font-semibold text-slate-500" title={topic}>Creating a path for: {topic}</p> : null}
        </div>
      </div>

      <ol className="mt-6 grid grid-cols-3 gap-2" aria-label="Roadmap generation stages">
        {stages.map((stage, index) => {
          const done = index < activeIndex || complete;
          const active = index === activeIndex && !complete && !failed;
          return (
            <li key={stage.id} className="min-w-0">
              <div className={"mb-2 h-1.5 rounded-full " + (done ? "bg-violet-600" : active ? "bg-violet-200" : "bg-slate-100")}>
                {active ? <div className="h-full w-2/5 animate-pulse rounded-full bg-violet-600" /> : null}
              </div>
              <div className="flex items-start gap-1.5">
                {done ? <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-violet-700" aria-hidden="true" />
                  : active ? <LoaderCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 animate-spin text-violet-700" aria-hidden="true" />
                    : <Circle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-300" aria-hidden="true" />}
                <span className={"text-[11px] font-semibold leading-4 " + (active || done ? "text-slate-800" : "text-slate-400")}>{stage.label}</span>
              </div>
            </li>
          );
        })}
      </ol>

      <div className="mt-6 rounded-xl bg-slate-50 p-4">
        <div className="mb-2 flex items-center justify-between gap-3 text-xs">
          <span className="font-semibold text-slate-700">{progress.total > 0 ? "Learning resources processed" : "Preparing your learning path"}</span>
          {progress.total > 0 ? <span className="shrink-0 font-bold tabular-nums text-slate-900">{progress.completed} of {progress.total}</span> : <span className="text-slate-500">In progress</span>}
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-slate-200" role="progressbar" aria-label="Learning resources processed" aria-valuemin={0} aria-valuemax={progress.total || 1} aria-valuenow={progress.total > 0 ? progress.completed : 0}>
          {progress.total > 0
            ? <div className="h-full rounded-full bg-violet-600 transition-[width] duration-500 ease-out" style={{ width: String(progress.progressValue) + "%" }} />
            : <div className="h-full w-2/5 animate-pulse rounded-full bg-violet-600" />}
        </div>
        {progress.total > 0 ? (
          <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-slate-600">
            <span className="inline-flex items-center gap-1"><CheckCircle2 size={12} className="text-emerald-600" aria-hidden="true" /> {progress.ready} ready</span>
            {progress.attention > 0 ? <span className="inline-flex items-center gap-1"><AlertTriangle size={12} className="text-amber-600" aria-hidden="true" /> {progress.attention} need attention</span> : null}
            {progress.remaining > 0 ? <span className="inline-flex items-center gap-1"><Video size={12} className="text-slate-500" aria-hidden="true" /> {progress.remaining} remaining</span> : null}
          </div>
        ) : null}
      </div>
      {progress.attention > 0 ? <p className="mt-3 text-xs leading-5 text-amber-800">Some lessons may need a resource retry. We’ll keep the learning path available rather than discard the whole roadmap.</p> : null}
      <p className="mt-4 text-center text-xs text-slate-500">You can keep this window open while BuddyForStudy prepares your course.</p>
    </section>
  );
}
