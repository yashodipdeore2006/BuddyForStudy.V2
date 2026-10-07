import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { apiFetch } from '@/lib/api';
import { CheckCircle2, Circle, Sparkles, Loader2, ArrowLeft, ExternalLink, PlayCircle } from 'lucide-react';

export default function AIRoadmapPlayer() {
  const { roadmapId } = useParams<{ roadmapId: string }>();
  const [roadmap, setRoadmap] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [quizAnswers, setQuizAnswers] = useState<Record<number, number[]>>({});
  const [quizBusy, setQuizBusy] = useState<number | null>(null);\n  const [quizGenerating, setQuizGenerating] = useState<number | null>(null);

  useEffect(() => {
    if (!roadmapId) return;
    apiFetch(`/api/roadmaps/${roadmapId}`)
      .then((data) => setRoadmap(data.roadmap))
      .catch((err) => setError(err.message || 'Unable to load roadmap'))
      .finally(() => setLoading(false));
  }, [roadmapId]);

  const completed = useMemo(() => new Set(roadmap?.completedLessonIds || []), [roadmap]);

  function lessonIdFor(module: any, moduleIndex: number, lesson: any, lessonIndex: number) {
    return String(lesson.id || lesson._id || `module-${moduleIndex + 1}-lesson-${lessonIndex + 1}`);
  }

  async function generateQuiz(moduleIndex: number) {
    if (!roadmapId) return;
    setQuizGenerating(moduleIndex); setError('');
    try {
      const data = await apiFetch(`/api/roadmaps/${roadmapId}/quizzes/${moduleIndex}/generate`, {
        method: 'POST'
      });
      setRoadmap(data.roadmap);
      setQuizAnswers((current) => ({ ...current, [moduleIndex]: [] }));
    } catch (err: any) {
      setError(err.message || 'Unable to generate quiz');
    } finally {
      setQuizGenerating(null);
    }
  }

  async function submitQuiz(moduleIndex: number, questionCount: number) {
    if (!roadmapId) return;
    const answers = quizAnswers[moduleIndex] || [];
    if (answers.length !== questionCount || answers.some((answer) => answer < 0)) {
      setError('Answer every quiz question before submitting.');
      return;
    }
    setQuizBusy(moduleIndex); setError('');
    try {
      const data = await apiFetch(`/api/roadmaps/${roadmapId}/quizzes/${moduleIndex}/submit`, {
        method: 'POST',
        body: JSON.stringify({ moduleIndex, answers })
      });
      setRoadmap(data.roadmap);
    } catch (err: any) {
      setError(err.message || 'Unable to submit quiz');
    } finally { setQuizBusy(null); }
  }

  async function complete(lessonId: string) {
    if (!roadmapId || completed.has(lessonId)) return;
    setBusy(lessonId); setError('');
    try {
      const data = await apiFetch(`/api/roadmaps/${roadmapId}/lessons/${encodeURIComponent(lessonId)}/complete`, { method: 'POST' });
      setRoadmap(data.roadmap);
    } catch (err: any) {
      setError(err.message || 'Unable to update progress');
    } finally { setBusy(''); }
  }

  if (loading) return <div className="flex min-h-screen items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-blue-600" /></div>;
  if (error && !roadmap) return <div className="mx-auto max-w-3xl px-4 py-16 text-center"><p className="text-red-600">{error}</p><Link to="/dashboard" className="btn-primary mt-6">Back to Dashboard</Link></div>;

  return <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
    <Link to="/dashboard" className="inline-flex items-center gap-2 text-sm font-semibold text-slate-600"><ArrowLeft className="h-4 w-4" />Dashboard</Link>
    <div className="mt-5 rounded-2xl border border-blue-100 bg-blue-50 p-6">
      <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-blue-600"><Sparkles className="h-4 w-4" />AI Learning Roadmap</div>
      <h1 className="mt-2 text-3xl font-bold text-slate-900">{roadmap?.course?.title}</h1>
      <p className="mt-2 text-slate-600">{roadmap?.course?.description}</p>
      <div className="mt-5 flex items-center gap-3"><div className="h-2 flex-1 overflow-hidden rounded-full bg-white"><div className="h-full rounded-full bg-blue-600" style={{width: `${roadmap?.progress?.percentage || 0}%`}} /></div><span className="text-sm font-bold text-blue-700">{roadmap?.progress?.percentage || 0}%</span></div>
    </div>

    {error && <p className="mt-4 text-sm text-red-600">{error}</p>}

    <div className="mt-8 space-y-5">
      {(roadmap?.course?.modules || []).map((module: any, index: number) => <section key={module.title || index} className="card p-5">
        <div><p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Module {index + 1}</p><h2 className="mt-1 text-lg font-bold text-slate-900">{module.title}</h2><p className="mt-1 text-sm text-slate-500">{module.description}</p></div>
        <div className="mt-4 space-y-2">
          {(module.lessons || []).map((lesson: any, lessonIndex: number) => {
            const id = lessonIdFor(module, index, lesson, lessonIndex);
            const done = completed.has(id);
            return <div key={id} className="flex items-center gap-3 rounded-lg border border-slate-100 p-3">
              {done ? <CheckCircle2 className="h-5 w-5 flex-shrink-0 text-green-600" /> : <Circle className="h-5 w-5 flex-shrink-0 text-slate-300" />}
              <div className="min-w-0 flex-1">
                <p className={`font-medium ${done ? 'text-slate-400 line-through' : 'text-slate-800'}`}>{lesson.title}</p>
                <p className="text-xs text-slate-400">{lesson.type}</p>
                {lesson.type === 'tutorial' && (lesson.tutorial?.videos?.length || lesson.tutorial?.resources?.length) ? (
                  <div className="mt-3 space-y-3">
                    {lesson.tutorial?.videos?.[0]?.videoId ? (
                      <div className="overflow-hidden rounded-xl border border-slate-200 bg-slate-950">
                        <div className="aspect-video w-full">
                          <iframe
                            className="h-full w-full"
                            src={lesson.tutorial.videos[0].embedUrl || `https://www.youtube.com/embed/${lesson.tutorial.videos[0].videoId}`}
                            title={lesson.tutorial.videos[0].title}
                            loading="lazy"
                            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                            allowFullScreen
                          />
                        </div>
                        <div className="flex items-center gap-2 bg-white p-3">
                          <PlayCircle className="h-5 w-5 flex-shrink-0 text-red-600" />
                          <span className="min-w-0 flex-1 text-sm font-semibold text-slate-800">{lesson.tutorial.videos[0].title}</span>
                          <a href={lesson.tutorial.videos[0].url} target="_blank" rel="noreferrer" className="flex-shrink-0 text-slate-400 hover:text-blue-600" aria-label="Open on YouTube">
                            <ExternalLink className="h-4 w-4" />
                          </a>
                        </div>
                      </div>
                    ) : null}

                    {lesson.tutorial?.videos?.slice(1).map((video: any) => (
                      <a key={video.videoId || video.url} href={video.url} target="_blank" rel="noreferrer" className="flex items-center gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3 hover:bg-slate-100">
                        <PlayCircle className="h-5 w-5 flex-shrink-0 text-red-600" />
                        <span className="min-w-0 flex-1 truncate text-sm font-medium text-slate-700">{video.title}</span>
                        <ExternalLink className="h-4 w-4 flex-shrink-0 text-slate-400" />
                      </a>
                    ))}

                    {!lesson.tutorial?.videos?.length && (lesson.tutorial?.resources || []).map((url: string) => (
                      <a key={url} href={url} target="_blank" rel="noreferrer" className="flex items-center gap-2 text-sm font-medium text-blue-600">
                        <ExternalLink className="h-4 w-4" />Open learning resource
                      </a>
                    ))}
                  </div>
                ) : null}
              </div>
              <button disabled={done || busy === id} onClick={() => complete(id)} className={done ? 'rounded-lg bg-green-50 px-3 py-2 text-xs font-semibold text-green-700' : 'rounded-lg bg-blue-600 px-3 py-2 text-xs font-semibold text-white'}>{busy === id ? 'Saving...' : done ? 'Completed' : 'Mark complete'}</button>
            </div>;
          })}
        </div>
        {module.quiz?.questions?.length ? (
          <div className="mt-6 rounded-xl border border-indigo-100 bg-indigo-50/50 p-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-indigo-500">Knowledge Check</p>
              <h3 className="mt-1 text-base font-bold text-slate-900">{module.quiz.title || 'Module Quiz'}</h3>
            </div>
            <div className="mt-4 space-y-5">
              {module.quiz.questions.map((question: any, questionIndex: number) => (
                <div key={questionIndex}>
                  <p className="text-sm font-semibold text-slate-800">{questionIndex + 1}. {question.question}</p>
                  <div className="mt-2 grid gap-2 sm:grid-cols-2">
                    {(question.options || []).map((option: string, optionIndex: number) => {
                      const selected = quizAnswers[index]?.[questionIndex] === optionIndex;
                      return (
                        <button key={optionIndex} type="button" onClick={() => setQuizAnswers((current) => {
                          const answers = current[index]
                            ? [...current[index]]
                            : Array(module.quiz.questions.length).fill(-1);
                          answers[questionIndex] = optionIndex;
                          return { ...current, [index]: answers };
                        })} className={`rounded-lg border px-3 py-2 text-left text-sm ${selected ? 'border-indigo-500 bg-indigo-100 text-indigo-800' : 'border-slate-200 bg-white text-slate-700'}`}>
                          {option}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
            <button type="button" disabled={quizBusy === index} onClick={() => submitQuiz(index, module.quiz.questions.length)} className="mt-5 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60">
              {quizBusy === index ? 'Submitting...' : 'Submit quiz'}
            </button>
            {(() => {
              const attempts = roadmap.quizAttempts?.filter((attempt: any) => attempt.moduleIndex === index) || [];
              const latest = attempts[attempts.length - 1];
              return latest ? <p className="mt-3 text-sm font-semibold text-indigo-700">Latest score: {latest.score}/{latest.total}</p> : null;
            })()}
          </div>
        ) : (
          <div className="mt-6 rounded-xl border border-indigo-100 bg-indigo-50/50 p-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-indigo-500">Knowledge Check</p>
              <h3 className="mt-1 text-base font-bold text-slate-900">Test what you learned</h3>
              <p className="mt-1 text-sm text-slate-500">Gemini generates a fresh 5-question quiz from this module only.</p>
            </div>
            <button
              type="button"
              disabled={quizGenerating === index}
              onClick={() => generateQuiz(index)}
              className="mt-4 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
            >
              {quizGenerating === index ? 'Generating quiz...' : 'Generate quiz'}
            </button>
          </div>
        )}
      </section>)}
    </div>
  </div>;
}