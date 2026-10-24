import { LoaderCircle } from "lucide-react";
import type { ButtonHTMLAttributes } from "react";
import { getCourseIntent, USER_INTENTS, type CourseActionState } from "@/lib/intents";

interface CourseActionButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "onClick"> {
  state: CourseActionState;
  onClick: () => void;
  loading?: boolean;
  disabledReason?: string;
}

export default function CourseActionButton({
  state,
  onClick,
  loading = false,
  disabled = false,
  disabledReason,
  className = "",
  ...props
}: CourseActionButtonProps) {
  const intent = USER_INTENTS[getCourseIntent(state)];
  const Icon = intent.icon;
  const unavailable = disabled || loading;
  return (
    <button
      {...props}
      type="button"
      onClick={onClick}
      disabled={unavailable}
      aria-label={intent.ariaLabel}
      title={disabledReason || (unavailable ? "Please wait" : intent.label)}
      className={["bfs-course-action", className].filter(Boolean).join(" ")}
    >
      {loading ? <LoaderCircle className="bfs-spin" size={16} aria-hidden="true" /> : Icon ? <Icon size={16} aria-hidden="true" /> : null}
      <span>{loading ? (state === "not-enrolled-free" || state === "not-enrolled-paid" ? "Enrolling" : "Opening") : intent.label}</span>
    </button>
  );
}
