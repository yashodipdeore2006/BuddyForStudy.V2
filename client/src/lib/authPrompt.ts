import type { AuthReturnLocation, AuthResumeContext, EnrollmentResumeIntent } from "@/lib/authNavigation";

export type AuthPromptOptions = {
  from?: AuthReturnLocation;
  resumeIntent?: EnrollmentResumeIntent;
  resumeContext?: AuthResumeContext;
  title?: string;
  description?: string;
  courseTitle?: string;
  contextLabel?: string;
};

export function requestAuthPrompt(options: AuthPromptOptions): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent<AuthPromptOptions>("bfs:auth-required", { detail: options }));
}
