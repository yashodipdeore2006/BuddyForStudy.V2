import { useEffect, useId, useRef, useState } from "react";

type Props = {
  text?: string | null;
  lines?: 2 | 3;
  maxLength?: number;
  className?: string;
  moreLabel?: string;
  lessLabel?: string;
  presentation?: "inline" | "popup";
  popupTitle?: string;
};

export default function ExpandableText({
  text = "",
  lines = 2,
  maxLength = 220,
  className = "",
  moreLabel = "Read more",
  lessLabel = "Show less",
  presentation = "inline",
  popupTitle = "Full description",
}: Props) {
  const value = String(text || "").trim();
  const [expanded, setExpanded] = useState(false);
  const dialogId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!expanded || presentation !== "popup") return;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    dialogRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setExpanded(false);
      }
      if (event.key === "Tab" && dialogRef.current) {
        const focusable = Array.from(dialogRef.current.querySelectorAll<HTMLElement>('button:not([disabled]),a[href],[tabindex="0"]'));
        if (!focusable.length) {
          event.preventDefault();
          dialogRef.current.focus();
        } else if (event.shiftKey && document.activeElement === focusable[0]) {
          event.preventDefault();
          focusable[focusable.length - 1].focus();
        } else if (!event.shiftKey && document.activeElement === focusable[focusable.length - 1]) {
          event.preventDefault();
          focusable[0].focus();
        }
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      if (previousFocus?.isConnected) previousFocus.focus();
      else triggerRef.current?.focus();
    };
  }, [expanded, presentation]);

  if (!value) return null;
  const shouldExpand = value.length > maxLength;

  return (
    <div className={className}>
      <p className={expanded && presentation === "inline" ? "" : lines === 3 ? "line-clamp-3" : "line-clamp-2"}>
        {value}
      </p>

      {shouldExpand && (
        <button
          ref={triggerRef}
          type="button"
          aria-haspopup={presentation === "popup" ? "dialog" : undefined}
          aria-expanded={presentation === "popup" ? expanded : undefined}
          aria-controls={presentation === "popup" ? dialogId : undefined}
          onClick={() => setExpanded((current) => !current)}
          className="mt-1 text-xs font-bold text-blue-600 transition hover:text-blue-700 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
        >
          {presentation === "popup" ? moreLabel : expanded ? lessLabel : moreLabel}
        </button>
      )}

      {presentation === "popup" && expanded && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/45 p-4"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setExpanded(false);
          }}
        >
          <div
            ref={dialogRef}
            id={dialogId}
            role="dialog"
            aria-modal="true"
            aria-labelledby={dialogId + "-title"}
            tabIndex={-1}
            className="flex max-h-[min(70vh,560px)] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white text-slate-900 shadow-2xl outline-none"
          >
            <div className="flex items-start justify-between gap-4 border-b border-slate-100 px-5 py-4">
              <h2 id={dialogId + "-title"} className="text-base font-semibold">{popupTitle}</h2>
              <button
                type="button"
                aria-label="Close full description"
                onClick={() => setExpanded(false)}
                className="rounded-lg px-2 py-1 text-lg leading-none text-slate-500 hover:bg-slate-100 hover:text-slate-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-600"
              >
                ×
              </button>
            </div>
            <div className="min-h-0 overflow-y-auto overscroll-contain px-5 py-4 text-sm leading-6 text-slate-600">
              <p className="whitespace-pre-line break-words">{value}</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
