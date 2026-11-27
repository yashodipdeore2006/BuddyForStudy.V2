import { useEffect, useRef } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { ArrowRight, BookOpen, LogIn, UserPlus, X } from "lucide-react";
import { routes } from "@/lib/routes";
import {
  createAuthNavigationState,
  type AuthReturnLocation,
  type AuthResumeContext,
  type EnrollmentResumeIntent,
} from "@/lib/authNavigation";

type EnrollmentAuthDialogProps = {
  open: boolean;
  courseTitle?: string;
  intent: EnrollmentResumeIntent | null;
  from?: AuthReturnLocation;
  resumeContext?: AuthResumeContext;
  title?: string;
  description?: string;
  contextLabel?: string;
  onClose: () => void;
};

export default function EnrollmentAuthDialog({
  open,
  courseTitle,
  intent,
  from,
  resumeContext,
  title: titleOverride,
  description: descriptionOverride,
  contextLabel,
  onClose,
}: EnrollmentAuthDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    else if (!open && dialog.open) dialog.close();
  }, [open]);

  const continueTo = (destination: string) => {
    const state = createAuthNavigationState(from || location, intent || undefined, resumeContext);
    onClose();
    navigate(destination, { state });
  };

  const isCheckout = intent?.type === "checkout";
  const title = titleOverride || (isCheckout
    ? "Sign in to continue to checkout"
    : intent ? "Sign in to enroll" : "Sign in to continue");
  const description = descriptionOverride || (isCheckout
    ? "Sign in or create a free account to continue. You will review the payment separately before anything is charged."
    : intent
      ? "Sign in or create a free account to keep this course and continue your enrollment."
      : "Sign in or create a free account to access this part of BuddyForStudy.");

  return (
    <dialog
      ref={dialogRef}
      onClose={onClose}
      onCancel={(event) => { event.preventDefault(); onClose(); }}
      onClick={(event) => { if (event.target === dialogRef.current) onClose(); }}
      aria-labelledby="enrollment-auth-title"
      aria-describedby="enrollment-auth-description"
      className="w-[calc(100%-2rem)] max-w-md overflow-visible rounded-3xl border border-slate-200 bg-white p-0 text-slate-950 shadow-2xl backdrop:bg-slate-950/60 backdrop:backdrop-blur-sm"
    >
      <section className="relative p-6 sm:p-7">
        <button
          type="button"
          onClick={onClose}
          aria-label="Close sign-in options"
          className="absolute right-4 top-4 inline-flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 text-slate-500 transition hover:bg-slate-50 hover:text-slate-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-violet-600"
        ><X className="h-4 w-4" aria-hidden="true" /></button>
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-violet-50 text-violet-700">
          <BookOpen className="h-6 w-6" aria-hidden="true" />
        </div>
        <h2 id="enrollment-auth-title" className="mt-5 pr-8 text-xl font-extrabold tracking-tight">{title}</h2>
        <p id="enrollment-auth-description" className="mt-2 text-sm leading-6 text-slate-600">{description}</p>
        {courseTitle && (
          <div className="mt-5 rounded-2xl border border-violet-100 bg-violet-50/70 p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-violet-700">{contextLabel || "Your selected course"}</p>
            <p className="mt-1 line-clamp-2 font-bold text-slate-900">{courseTitle}</p>
          </div>
        )}
        <div className="mt-6 grid gap-3">
          <button
            type="button"
            onClick={() => continueTo(routes.login())}
            className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-violet-700 px-4 py-3 text-sm font-bold text-white transition hover:bg-violet-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-700"
          ><LogIn className="h-4 w-4" aria-hidden="true" />Sign in<ArrowRight className="h-4 w-4" aria-hidden="true" /></button>
          <button
            type="button"
            onClick={() => continueTo(routes.register())}
            className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm font-bold text-slate-800 transition hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-700"
          ><UserPlus className="h-4 w-4" aria-hidden="true" />Create a free account</button>
        </div>
        <p className="mt-4 text-center text-xs leading-5 text-slate-500">
          {intent ? "Your course selection will be preserved while you authenticate." : resumeContext?.type === "ai-roadmap" ? "Your roadmap topic and language preferences will be preserved. Generation will remain under your control." : "You will return to the page you were trying to access after authentication."}
        </p>
      </section>
    </dialog>
  );
}
