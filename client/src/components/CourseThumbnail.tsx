import React, { useMemo, useState } from "react";

export type ThumbnailVariant = "node-circuit" | "terminal-matrix" | "bento-tile" | "isometric-stack" | "kinetic-mesh";

export interface CourseThumbnailProps {
  identity?: string;
  imageUrl?: string;
  title: string;
  domain: string;
  skills: string[];
  level: string;
  variant?: ThumbnailVariant;
  accentHex?: string;
  surfaceHex?: string;
  topRightActions?: React.ReactNode;
}

function hashString(value: string): number {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash << 5) - hash + value.charCodeAt(index);
    hash |= 0;
  }
  return Math.abs(hash);
}

export default function CourseThumbnail({
  identity,
  imageUrl,
  title,
  domain,
  skills = [],
  level = "Beginner",
  variant = "kinetic-mesh",
  accentHex = "#4F46E5",
  surfaceHex = "#0F172A",
  topRightActions,
}: CourseThumbnailProps) {
  const seed = useMemo(() => hashString(identity || title), [identity, title]);
  const visibleSkills = skills.slice(0, 2);
  const offset = (seed % 18) - 9;
  const [failedImageUrl, setFailedImageUrl] = useState<string | null>(null);
  const showOriginalImage = Boolean(imageUrl) && failedImageUrl !== imageUrl;

  return (
    <div
      style={!showOriginalImage ? {
        backgroundColor: surfaceHex,
        backgroundImage: "radial-gradient(120% 100% at 100% 0%, " + accentHex + "29 0%, transparent 65%), linear-gradient(180deg, rgba(255,255,255,0.03) 0%, rgba(0,0,0,0.28) 100%)",
      } : undefined}
      className="relative h-[168px] w-full select-none overflow-hidden rounded-t-xl border-b border-slate-800/80 font-sans text-slate-100"
    >
      {showOriginalImage ? (
        <img
          src={imageUrl || undefined}
          alt=""
          aria-hidden="true"
          draggable={false}
          decoding="async"
          className="pointer-events-none absolute inset-0 h-full w-full object-cover"
          onError={() => setFailedImageUrl(imageUrl || null)}
        />
      ) : (
        <>
      {variant === "node-circuit" && (
        <svg className="pointer-events-none absolute inset-0 h-full w-full opacity-25" viewBox="0 0 320 168" fill="none" aria-hidden="true">
          <path d={"M -10 " + (45 + offset) + " H 95 L 125 " + (75 + offset) + " H 235 L 265 40 H 330"} stroke="#94A3B8" strokeWidth="1" />
          <path d={"M 30 155 L 75 " + (115 - offset) + " H 190 L 220 140 H 310"} stroke={accentHex} strokeWidth="1.25" />
          <circle cx="95" cy={45 + offset} r="3" fill={surfaceHex} stroke="#94A3B8" strokeWidth="1.5" />
          <circle cx="235" cy={75 + offset} r="3.5" fill={accentHex} />
          <circle cx="190" cy={115 - offset} r="3" fill={surfaceHex} stroke={accentHex} strokeWidth="1.5" />
        </svg>
      )}

      {variant === "terminal-matrix" && (
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          <div className="absolute left-3.5 top-2.5 flex items-center gap-1.5 opacity-40">
            <span className="h-2 w-2 rounded-full bg-slate-500" />
            <span className="h-2 w-2 rounded-full bg-slate-600" />
            <span className="h-2 w-2 rounded-full bg-slate-700" />
            <span className="ml-1.5 max-w-[150px] truncate font-mono text-[9px] uppercase tracking-wider text-slate-400">
              ~/curriculum/{domain.toLowerCase().replace(/\s+/g, "-")}
            </span>
          </div>
          <pre className="absolute bottom-2 right-2 text-right font-mono text-[9px] leading-tight text-slate-400/[0.15]">
            {"const track = init('" + level + "');\nawait track.verify({\n  modules: true,\n  production: 1\n});"}
          </pre>
        </div>
      )}

      {variant === "bento-tile" && (
        <div className="pointer-events-none absolute inset-0 grid grid-cols-12 grid-rows-6 gap-1.5 p-2.5 opacity-25">
          <div className="col-span-8 row-span-4 rounded-md border border-slate-700/80 bg-slate-900/40" />
          <div className="col-span-4 row-span-3 rounded-md border border-slate-700/60 bg-slate-800/30" />
          <div style={{ borderColor: accentHex + "55" }} className="col-span-4 row-span-3 rounded-md border bg-slate-900/50" />
          <div className="col-span-8 row-span-2 rounded-md border border-slate-700/60 bg-slate-800/20" />
        </div>
      )}

      {variant === "isometric-stack" && (
        <svg className="pointer-events-none absolute -bottom-3 right-8 h-44 w-44 opacity-25" viewBox="0 0 160 160" fill="none" aria-hidden="true">
          <polygon points="80,105 140,78 80,51 20,78" stroke="#94A3B8" strokeWidth="1.2" fill="rgba(15,23,42,0.6)" />
          <polygon points="80,85 140,58 80,31 20,58" stroke={accentHex} strokeWidth="1.4" fill="rgba(15,23,42,0.75)" />
          <polygon points="80,65 140,38 80,11 20,38" stroke="#E2E8F0" strokeWidth="1.2" fill={accentHex + "22"} />
        </svg>
      )}

      {variant === "kinetic-mesh" && (
        <>
          <div
            className="pointer-events-none absolute inset-0 opacity-[0.07]"
            style={{
              backgroundImage: "linear-gradient(to right, #94a3b8 1px, transparent 1px), linear-gradient(to bottom, #94a3b8 1px, transparent 1px)",
              backgroundSize: "20px 20px",
            }}
          />
          <span className="pointer-events-none absolute -bottom-3 right-2 text-[44px] font-black uppercase leading-none tracking-tighter text-white/[0.04]">
            {domain.split(" ")[0]}
          </span>
        </>
      )}

      <div className={"relative z-10 flex h-full flex-col justify-between p-3.5 pr-12 pb-10 " + (variant === "terminal-matrix" ? "pt-7" : "")}>
        <div className="flex max-h-[54px] flex-wrap items-start gap-1.5 overflow-hidden">
          <span
            style={{ borderColor: accentHex + "66", color: "#E2E8F0" }}
            className="inline-flex items-center gap-1.5 rounded border bg-slate-900/80 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider"
          >
            <span style={{ backgroundColor: accentHex }} className="h-1.5 w-1.5 rounded-full" />
            {domain}
          </span>
          {visibleSkills.map((skill) => (
            <span key={skill} className="rounded border border-slate-700/80 bg-slate-800/90 px-2 py-0.5 text-[10px] font-medium text-slate-300">
              {skill}
            </span>
          ))}
        </div>
        <div className="line-clamp-2 text-[15px] font-bold leading-[1.28] tracking-tight text-slate-50">
          {title}
        </div>
      </div>

      <div className="absolute bottom-2.5 left-3.5 z-10">
        <span className="inline-block rounded-full bg-slate-50 px-2.5 py-0.5 text-[11px] font-semibold text-slate-900">
          {level}
        </span>
      </div>

        </>
      )}

      {topRightActions && (
        <div className="absolute right-2.5 top-2.5 z-20 flex flex-col gap-1.5">
          {topRightActions}
        </div>
      )}
    </div>
  );
}
