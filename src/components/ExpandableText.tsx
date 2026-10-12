import { useState } from "react";

type Props = {
  text?: string | null;
  lines?: 2 | 3;
  maxLength?: number;
  className?: string;
  moreLabel?: string;
  lessLabel?: string;
};

export default function ExpandableText({
  text = "",
  lines = 2,
  maxLength = 220,
  className = "",
  moreLabel = "Read more",
  lessLabel = "Show less",
}: Props) {
  const value = String(text || "").trim();
  const [expanded, setExpanded] = useState(false);

  if (!value) return null;

  const shouldExpand = value.length > maxLength;

  return (
    <div className={className}>
      <p
        className={
          expanded
            ? ""
            : lines === 3
              ? "line-clamp-3"
              : "line-clamp-2"
        }
      >
        {value}
      </p>

      {shouldExpand && (
        <button
          type="button"
          onClick={() => setExpanded((current) => !current)}
          className="mt-1 text-xs font-bold text-blue-600 transition hover:text-blue-700 hover:underline"
        >
          {expanded ? lessLabel : moreLabel}
        </button>
      )}
    </div>
  );
}
