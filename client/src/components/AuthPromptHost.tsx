import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import EnrollmentAuthDialog from "@/components/EnrollmentAuthDialog";
import {
  readAuthNavigationState,
  type AuthNavigationState,
} from "@/lib/authNavigation";
import type { AuthPromptOptions } from "@/lib/authPrompt";

type ActivePrompt = AuthNavigationState & Pick<
  AuthPromptOptions,
  "title" | "description" | "courseTitle" | "contextLabel"
>;

export default function AuthPromptHost() {
  const location = useLocation();
  const [prompt, setPrompt] = useState<ActivePrompt | null>(null);

  useEffect(() => {
    const handleAuthRequired = (event: Event) => {
      const detail = (event as CustomEvent<AuthPromptOptions>).detail;
      if (!detail) return;
      const safeState = readAuthNavigationState({
        ...detail,
        from: detail.from || location,
      });
      setPrompt({
        ...safeState,
        title: typeof detail.title === "string" ? detail.title.slice(0, 140) : undefined,
        description: typeof detail.description === "string" ? detail.description.slice(0, 500) : undefined,
        courseTitle: typeof detail.courseTitle === "string" ? detail.courseTitle.slice(0, 180) : undefined,
        contextLabel: typeof detail.contextLabel === "string" ? detail.contextLabel.slice(0, 80) : undefined,
      });
    };

    window.addEventListener("bfs:auth-required", handleAuthRequired);
    return () => window.removeEventListener("bfs:auth-required", handleAuthRequired);
  }, [location]);

  return (
    <EnrollmentAuthDialog
      open={Boolean(prompt)}
      intent={prompt?.resumeIntent || null}
      from={prompt?.from}
      resumeContext={prompt?.resumeContext}
      title={prompt?.title}
      description={prompt?.description}
      courseTitle={prompt?.courseTitle}
      contextLabel={prompt?.contextLabel}
      onClose={() => setPrompt(null)}
    />
  );
}
