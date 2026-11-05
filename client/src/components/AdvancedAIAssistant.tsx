import { useCallback, useEffect, useState } from "react";
import { Bot, Brain, CheckCircle2, Loader2, MessageCircleQuestion, RefreshCcw, Send, Sparkles } from "lucide-react";
import { apiFetch } from "@/lib/api";

type Usage = {
  enabled: boolean;
  plan: { id: string; name: string };
  lesson: {
    id: string;
    title: string;
    durationSeconds: number;
    durationKnown: boolean;
  };
  questions: {
    perHourVideo: number;
    lessonLimit: number;
    lessonUsed: number;
    lessonRemaining: number;
    monthlyLimit: number;
    monthlyUsed: number;
    monthlyRemaining: number;
  };
  recentQuestions: Array<{
    question: string;
    answer: string;
    askedAt: string;
    cachedHits: number;
  }>;
};

function isUpgradeGateError(error: unknown) {
  return error instanceof Error && /not included in your current plan|reached your Advanced AI (?:summary|question) limit for this month/i.test(error.message);
}

export default function AdvancedAIAssistant({
  courseId,
  lessonId,
}: {
  courseId: string;
  lessonId: string;
}) {
  const [usage, setUsage] = useState<Usage | null>(null);
  const [supported, setSupported] = useState(true);
  const [loadingUsage, setLoadingUsage] = useState(true);
  const [loadingInsight, setLoadingInsight] = useState(false);
  const [asking, setAsking] = useState(false);
  const [insight, setInsight] = useState<{ summary?: string; keyNotes?: string[]; fromCache?: boolean; pendingReview?: boolean; message?: string } | null>(null);
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState<{ question: string; answer?: string; fromCache: boolean; pendingReview?: boolean; message?: string } | null>(null);
  const [error, setError] = useState("");
  const [open, setOpen] = useState(false);

  const loadUsage = useCallback(async () => {
    setLoadingUsage(true);
    setError("");
    try {
      const data = await apiFetch(
        "/api/advanced-ai/usage?courseId=" +
          encodeURIComponent(courseId) +
          "&lessonId=" +
          encodeURIComponent(lessonId)
      );
      setUsage(data.enabled ? data : null);
      setSupported(Boolean(data.enabled));
    } catch (e) {
      const message = e instanceof Error ? e.message : "Advanced AI is unavailable";
      if (/not included in your current plan|not included|403/i.test(message)) {
        setSupported(false);
        setError("");
      } else {
        setError(message);
      }
    } finally {
      setLoadingUsage(false);
    }
  }, [courseId, lessonId]);

  useEffect(() => {
    setOpen(false);
    setInsight(null);
    setAnswer(null);
    setQuestion("");
    void loadUsage();
  }, [loadUsage]);

  async function generateInsight() {
    setLoadingInsight(true);
    setError("");
    try {
      const data = await apiFetch("/api/advanced-ai/insight", {
        method: "POST",
        body: JSON.stringify({ courseId, lessonId }),
        showFeatureUpgrade: true,
      });
      setInsight(data);
      setOpen(true);
      await loadUsage();
    } catch (e) {
      if (!isUpgradeGateError(e)) setError(e instanceof Error ? e.message : "Unable to generate lesson summary");
    } finally {
      setLoadingInsight(false);
    }
  }

  async function askQuestion() {
    const clean = question.trim();
    if (!clean) return;

    setAsking(true);
    setError("");
    try {
      const data = await apiFetch("/api/advanced-ai/ask", {
        method: "POST",
        body: JSON.stringify({ courseId, lessonId, question: clean }),
        showFeatureUpgrade: true,
      });
      if (data.pendingReview) {
        setAnswer({
          question: clean,
          fromCache: Boolean(data.fromCache),
          pendingReview: true,
          message: data.message || "Your AI answer is waiting for administrator approval.",
        });
      } else {
        setAnswer({
          question: data.question,
          answer: data.answer,
          fromCache: Boolean(data.fromCache),
        });
      }
      setQuestion("");
      setOpen(true);
      if (data.usage) setUsage(data.usage);
    } catch (e) {
      if (!isUpgradeGateError(e)) setError(e instanceof Error ? e.message : "Unable to answer your question");
    } finally {
      setAsking(false);
    }
  }

  return (
    <section className="mt-6 overflow-hidden rounded-2xl border border-indigo-100 bg-white shadow-sm">
      <div className="flex flex-col gap-4 border-b border-indigo-100 bg-gradient-to-r from-indigo-50 to-blue-50 p-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-indigo-600 text-white shadow-lg shadow-indigo-600/20">
            <Bot className="h-5 w-5" />
          </div>
          <div>
            <p className="text-xs font-bold uppercase tracking-[.14em] text-indigo-600">Advanced AI</p>
            <h2 className="mt-1 text-lg font-extrabold text-slate-950">Lesson Study Assistant</h2>
            <p className="mt-1 text-sm text-slate-600">
              Get a summary, key notes, and ask questions limited to this lesson's learning material.
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => void generateInsight()}
          disabled={loadingInsight || loadingUsage}
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-bold text-white shadow-lg shadow-indigo-600/20 transition hover:bg-indigo-700 disabled:opacity-60"
        >
          {loadingInsight ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
          {insight ? "Refresh summary" : "Summary & key notes"}
        </button>
      </div>

      <div className="grid gap-4 p-5 lg:grid-cols-[1fr_280px]">
        <div className="space-y-4">
          {insight && (
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              {insight.pendingReview ? (
                <div role="status" className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4">
                  <Brain className="mt-0.5 h-5 w-5 shrink-0 text-amber-700" />
                  <div>
                    <h3 className="font-bold text-slate-900">Summary awaiting review</h3>
                    <p className="mt-1 text-sm leading-6 text-slate-700">{insight.message || "This AI lesson insight is waiting for administrator approval."}</p>
                  </div>
                </div>
              ) : (
                <>
                  <div className="flex items-center gap-2">
                    <Brain className="h-4 w-4 text-indigo-600" />
                    <h3 className="font-bold text-slate-900">Lesson summary</h3>
                    {insight.fromCache && <span className="rounded-full bg-green-50 px-2 py-1 text-[10px] font-bold text-green-700">Cached</span>}
                  </div>
                  <p className="mt-3 whitespace-pre-wrap text-sm leading-7 text-slate-700">{insight.summary}</p>
                  <h4 className="mt-5 font-bold text-slate-900">Key notes</h4>
                  <ul className="mt-2 space-y-2">
                    {(insight.keyNotes || []).map((note, index) => (
                      <li key={note + "-" + index} className="flex gap-2 text-sm leading-6 text-slate-700">
                        <CheckCircle2 className="mt-1 h-4 w-4 shrink-0 text-green-600" />
                        <span>{note}</span>
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </div>
          )}

          <div className="rounded-2xl border border-slate-200 bg-white p-4">
            <div className="flex items-center gap-2">
              <MessageCircleQuestion className="h-4 w-4 text-blue-600" />
              <h3 className="font-bold text-slate-900">Ask about this lesson</h3>
            </div>
            <p className="mt-1 text-xs text-slate-500">
              The assistant will not answer from other modules or unrelated topics.
            </p>
            <div className="mt-3 flex flex-col gap-2 sm:flex-row">
              <input
                className="input-field flex-1"
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    void askQuestion();
                  }
                }}
                placeholder="Ask a question about what you are learning..."
                maxLength={2000}
                disabled={asking}
              />
              <button
                type="button"
                className="btn-primary justify-center"
                onClick={() => void askQuestion()}
                disabled={asking || !question.trim()}
              >
                {asking ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                Ask
              </button>
            </div>
          </div>

          {answer && (
            <div className="rounded-2xl border border-blue-100 bg-blue-50 p-4">
              <div className="flex items-center gap-2">
                <MessageCircleQuestion className="h-4 w-4 text-blue-600" />
                <p className="text-sm font-bold text-slate-900">{answer.question}</p>
                {answer.fromCache && <span className="ml-auto rounded-full bg-green-50 px-2 py-1 text-[10px] font-bold text-green-700">Cached</span>}
              </div>
              {answer.pendingReview ? (
                <p role="status" className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm leading-6 text-slate-700">{answer.message || "This AI answer is waiting for administrator approval."}</p>
              ) : (
                <p className="mt-3 whitespace-pre-wrap text-sm leading-7 text-slate-700">{answer.answer}</p>
              )}
            </div>
          )}

          {open && usage?.recentQuestions?.length ? (
            <div className="rounded-2xl border border-slate-200 bg-white p-4">
              <div className="flex items-center gap-2">
                <RefreshCcw className="h-4 w-4 text-slate-500" />
                <h3 className="font-bold text-slate-900">Your recent questions</h3>
              </div>
              <div className="mt-3 space-y-3">
                {usage.recentQuestions.map((item, index) => (
                  <details key={item.askedAt + "-" + index} className="rounded-xl bg-slate-50 p-3">
                    <summary className="cursor-pointer text-sm font-semibold text-slate-800">{item.question}</summary>
                    <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-600">{item.answer}</p>
                  </details>
                ))}
              </div>
            </div>
          ) : null}

          {error && <div className="rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">{error}</div>}
        </div>

        <aside className="h-fit rounded-2xl border border-slate-200 bg-slate-50 p-4">
          <p className="text-xs font-bold uppercase tracking-[.14em] text-slate-400">AI allowance</p>
          {loadingUsage ? (
            <div className="mt-4 flex items-center gap-2 text-sm text-slate-500"><Loader2 className="h-4 w-4 animate-spin" /> Loading limits...</div>
          ) : usage ? (
            <>
              <p className="mt-2 text-sm font-bold text-slate-900">{usage.plan.name} plan</p>
              <div className="mt-4 rounded-xl bg-white p-3">
                <p className="text-xs text-slate-500">This lesson</p>
                <p className="mt-1 text-2xl font-extrabold text-slate-950">{usage.questions.lessonRemaining}</p>
                <p className="text-xs text-slate-500">new questions remaining of {usage.questions.lessonLimit}</p>
                <p className="mt-2 text-[11px] text-slate-400">
                  {usage.questions.perHourVideo} questions/hour of video
                  {usage.lesson?.durationKnown ? "" : " · duration unknown"}
                </p>
              </div>
              <div className="mt-3 rounded-xl bg-white p-3">
                <p className="text-xs text-slate-500">Monthly Advanced AI Q&A</p>
                <p className="mt-1 text-lg font-extrabold text-slate-950">
                  {usage.questions.monthlyLimit === -1 ? "Unlimited" : usage.questions.monthlyRemaining}
                </p>
                <p className="text-xs text-slate-500">
                  {usage.questions.monthlyLimit === -1
                    ? "No monthly quota"
                    : "remaining of " + usage.questions.monthlyLimit}
                </p>
              </div>
            </>
          ) : !supported ? (
            <div className="mt-3 rounded-xl border border-indigo-100 bg-white p-3">
              <p className="text-sm font-bold text-slate-900">Upgrade to unlock Advanced AI</p>
              <p className="mt-1 text-xs leading-5 text-slate-500">
                You can read the lesson and its resources as usual. Choose Summary or submit a question to see available plans.
              </p>
            </div>
          ) : null}
        </aside>
      </div>
    </section>
  );
}
