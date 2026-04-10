import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import {
  ArrowLeft,
  ArrowRight,
  Bookmark,
  Copy,
  Heart,
  Image as ImageIcon,
  Play,
  Wand2,
} from 'lucide-react';
import { workflowsApi } from '../../lib/backend';
import { useAuth } from '../../lib/auth-context';
import { useBackendQuery } from '../../lib/useBackendQuery';
import { Workflow, WorkflowGenerationType } from '../../lib/types';

const generationTypeLabels: Record<WorkflowGenerationType, string> = {
  prompt_to_video: 'Prompt to video',
  image_to_video: 'Image to video',
  frames_to_video: 'Two frames to video',
  prompt_to_image: 'Prompt to image',
};

const generationTypeAccent: Record<WorkflowGenerationType, string> = {
  prompt_to_video: 'bg-sky-500/15 text-sky-200 border-sky-400/30',
  image_to_video: 'bg-indigo-500/15 text-indigo-200 border-indigo-400/30',
  frames_to_video: 'bg-emerald-500/15 text-emerald-200 border-emerald-400/30',
  prompt_to_image: 'bg-amber-500/15 text-amber-200 border-amber-400/30',
};

async function copyText(value: string) {
  try {
    await navigator.clipboard.writeText(value);
  } catch {
    const textArea = document.createElement('textarea');
    textArea.value = value;
    textArea.style.position = 'fixed';
    textArea.style.left = '-999999px';
    document.body.appendChild(textArea);
    textArea.focus();
    textArea.select();
    document.execCommand('copy');
    textArea.remove();
  }
}

export function WorkflowDetail() {
  const navigate = useNavigate();
  const { workflowId } = useParams();
  const { user: activeUser, isLoading: authIsLoading } = useAuth();

  const { data: workflowData, isLoading } = useBackendQuery(
    () => (workflowId ? workflowsApi.getWorkflowById(workflowId) : Promise.resolve(null)),
    null,
    [workflowId],
  );
  const { data: likedWorkflowIds } = useBackendQuery(
    () => (activeUser ? workflowsApi.getLikedWorkflowIds(activeUser.uid) : Promise.resolve([])),
    [],
    [activeUser?.uid],
  );
  const { data: savedWorkflowIds } = useBackendQuery(
    () => (activeUser ? workflowsApi.getSavedWorkflowIds(activeUser.uid) : Promise.resolve([])),
    [],
    [activeUser?.uid],
  );

  const [workflow, setWorkflow] = useState<Workflow | null>(null);
  const [saved, setSaved] = useState(false);
  const [liked, setLiked] = useState(false);
  const [copiedStepId, setCopiedStepId] = useState<string | null>(null);
  const [expandedPrompts, setExpandedPrompts] = useState<Set<string>>(new Set());

  useEffect(() => {
    setWorkflow(workflowData);
  }, [workflowData]);

  useEffect(() => {
    if (!workflowId) {
      return;
    }
    setLiked(likedWorkflowIds.includes(workflowId));
    setSaved(savedWorkflowIds.includes(workflowId));
  }, [likedWorkflowIds, savedWorkflowIds, workflowId]);

  if (isLoading) {
    return (
      <div className="min-h-screen px-4 py-10 md:px-8">
        <div className="mx-auto max-w-2xl rounded-[var(--cuerate-r-xl)] border border-[var(--cuerate-text-3)] bg-[var(--cuerate-surface)] p-8 text-center">
          <p className="font-primary text-2xl text-[var(--cuerate-text-1)]">Loading workflow...</p>
        </div>
      </div>
    );
  }

  if (!workflow) {
    return (
      <div className="min-h-screen px-4 py-10 md:px-8">
        <div className="mx-auto max-w-2xl rounded-[var(--cuerate-r-xl)] border border-[var(--cuerate-text-3)] bg-[var(--cuerate-surface)] p-8 text-center">
          <p className="font-primary text-2xl text-[var(--cuerate-text-1)]">Workflow not found</p>
          <button
            onClick={() => navigate('/')}
            className="mt-6 rounded-[var(--cuerate-r-pill)] bg-[var(--cuerate-indigo)] px-5 py-3 font-accent text-sm font-medium text-white"
          >
            Back to feed
          </button>
        </div>
      </div>
    );
  }

  const mediaAspectRatio = workflow.mediaAspectRatio === 'portrait' ? '9 / 16' : '16 / 9';

  const handleToggleLike = async () => {
    if (authIsLoading) {
      return;
    }

    if (!activeUser) {
      navigate('/auth');
      return;
    }

    const wasLiked = liked;
    setLiked(!wasLiked);
    setWorkflow((prev) =>
      prev
        ? {
            ...prev,
            likes: Math.max(0, prev.likes + (wasLiked ? -1 : 1)),
          }
        : prev,
    );

    try {
      const result = await workflowsApi.toggleLike(workflow.id, activeUser.uid);
      setLiked(result.liked);
      setWorkflow((prev) => (prev ? { ...prev, likes: result.likes } : prev));
    } catch {
      setLiked(wasLiked);
      setWorkflow((prev) =>
        prev
          ? {
              ...prev,
              likes: Math.max(0, prev.likes + (wasLiked ? 1 : -1)),
            }
          : prev,
      );
    }
  };

  const handleToggleSave = async () => {
    if (authIsLoading) {
      return;
    }

    if (!activeUser) {
      navigate('/auth');
      return;
    }

    const wasSaved = saved;
    setSaved(!wasSaved);
    setWorkflow((prev) =>
      prev
        ? {
            ...prev,
            saves: Math.max(0, prev.saves + (wasSaved ? -1 : 1)),
          }
        : prev,
    );

    try {
      const result = await workflowsApi.toggleSave(workflow.id, activeUser.uid);
      setSaved(result.saved);
      setWorkflow((prev) => (prev ? { ...prev, saves: result.saves } : prev));
    } catch {
      setSaved(wasSaved);
      setWorkflow((prev) =>
        prev
          ? {
              ...prev,
              saves: Math.max(0, prev.saves + (wasSaved ? 1 : -1)),
            }
          : prev,
      );
    }
  };

  return (
    <div className="min-h-screen pb-10">
      <div className="sticky top-0 z-40 border-b border-[var(--cuerate-text-3)] bg-[rgba(7,10,23,0.88)] backdrop-blur-xl">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-4 md:px-8">
          <button
            onClick={() => navigate(-1)}
            className="inline-flex items-center gap-2 rounded-full border border-[#f5a623]/25 px-4 py-2 font-accent text-sm text-[#ffd27c] transition-colors hover:bg-[#f5a623]/10"
          >
            <ArrowLeft className="h-4 w-4" />
            <span>Back</span>
          </button>
          <span className="font-accent text-xs uppercase tracking-[0.18em] text-[#f5c970]">
            Workflow thread
          </span>
        </div>
      </div>

      <div className="mx-auto max-w-3xl px-4 py-6 md:px-8">
        <div className="relative pl-8">
          <div className="absolute bottom-0 left-3 top-0 w-px bg-gradient-to-b from-[#f5a623]/70 via-[#f5a623]/30 to-transparent" />

          <section className="relative mb-6 rounded-[var(--cuerate-r-xl)] border border-[#f5a623]/30 bg-[linear-gradient(180deg,rgba(245,166,35,0.16),rgba(245,166,35,0.05))] p-4 shadow-[0_0_44px_rgba(245,166,35,0.08)]">
            <div className="absolute left-[-31px] top-10 h-4 w-4 rounded-full border-4 border-[#f5a623] bg-[var(--cuerate-bg)] shadow-[0_0_18px_rgba(245,166,35,0.45)]" />

            <div className="mb-4 flex items-start justify-between gap-3">
              <h1 className="font-primary text-2xl font-semibold text-[var(--cuerate-text-1)]">
                {workflow.title}
              </h1>
              <span className="rounded-full border border-[#f5a623]/30 bg-[#f5a623]/12 px-3 py-1 font-accent text-xs font-medium text-[#ffe1a6]">
                {workflow.stepCount} step workflow
              </span>
            </div>

            <div className="group relative mb-4 overflow-hidden rounded-[var(--cuerate-r-lg)] transition-transform duration-300 hover:-translate-y-0.5 hover:shadow-[0_14px_30px_rgba(245,166,35,0.2)]" style={{ aspectRatio: mediaAspectRatio }}>
              {workflow.coverVideoUrl ? (
                <video
                  src={workflow.coverVideoUrl}
                  poster={workflow.coverThumbnailUrl}
                  className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
                  muted
                  playsInline
                  loop
                  autoPlay
                  controls
                />
              ) : (
                <img
                  src={workflow.coverThumbnailUrl}
                  alt={workflow.title}
                  className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
                />
              )}
              <div className="absolute inset-0 bg-gradient-to-t from-black/45 via-black/5 to-black/5" />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => void handleToggleSave()}
                disabled={authIsLoading}
                className={`flex min-h-[44px] items-center justify-center gap-2 rounded-[var(--cuerate-r-pill)] px-4 py-3 font-accent text-sm font-medium transition-all ${
                  saved
                    ? 'border border-[#f5a623]/35 bg-[#f5a623]/12 text-[#ffd27c]'
                    : 'glass-surface text-[var(--cuerate-text-2)] hover:border-[#f5a623]/30 hover:text-[#ffd27c]'
                }`}
              >
                <Bookmark className={`h-4 w-4 ${saved ? 'fill-[#f5a623]' : ''}`} />
                <span>Save</span>
              </button>
              <button
                onClick={() => void handleToggleLike()}
                disabled={authIsLoading}
                className={`flex min-h-[44px] items-center justify-center gap-2 rounded-[var(--cuerate-r-pill)] px-4 py-3 font-accent text-sm font-medium transition-all ${
                  liked
                    ? 'border border-red-500/30 bg-red-500/10 text-red-300'
                    : 'glass-surface text-[var(--cuerate-text-2)] hover:border-red-400/30 hover:text-red-300'
                }`}
              >
                <Heart className={`h-4 w-4 ${liked ? 'fill-red-400' : ''}`} />
                <span>{workflow.likes}</span>
              </button>
            </div>
          </section>

          {workflow.steps.map((step) => (
            <section
              key={step.id}
              className="relative mb-6 rounded-[var(--cuerate-r-xl)] border border-[var(--cuerate-text-3)] bg-[rgba(15,18,33,0.86)] p-4 backdrop-blur-xl"
            >
              <div className="absolute left-[-31px] top-10 h-4 w-4 rounded-full border-4 border-[#f5a623]/70 bg-[var(--cuerate-bg)]" />

              <div className="mb-4 flex flex-wrap items-center gap-2">
                <span className="rounded-full bg-[#f5a623]/12 px-3 py-1 font-accent text-xs font-medium text-[#ffd27c]">
                  {step.stepNumber}
                </span>
                <span
                  className={`rounded-full border px-3 py-1 font-accent text-xs font-medium ${generationTypeAccent[step.generationType]}`}
                >
                  {generationTypeLabels[step.generationType]}
                </span>
              </div>

              <h2 className="font-primary text-xl font-semibold text-[var(--cuerate-text-1)]">
                {step.label}
              </h2>

              <div className="mt-4 space-y-4">
                {step.generationType === 'image_to_video' && step.inputImageUrl && (
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="group overflow-hidden rounded-[var(--cuerate-r-lg)] border border-[var(--cuerate-text-3)] bg-black/20 transition-transform duration-300 hover:-translate-y-0.5 hover:shadow-[0_12px_26px_rgba(245,166,35,0.16)]">
                      <div className="flex items-center gap-2 border-b border-[var(--cuerate-text-3)] px-3 py-2 font-accent text-xs uppercase tracking-[0.12em] text-[var(--cuerate-text-2)]">
                        <ImageIcon className="h-3.5 w-3.5" />
                        <span>Source image</span>
                      </div>
                      <div style={{ aspectRatio: mediaAspectRatio }}>
                        <img src={step.inputImageUrl} alt={step.label} className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]" />
                      </div>
                    </div>
                  </div>
                )}

                {step.generationType === 'frames_to_video' && step.startFrameUrl && step.endFrameUrl && (
                  <div className="grid items-center gap-2 md:grid-cols-[1fr_auto_1fr]">
                    <div className="group overflow-hidden rounded-[var(--cuerate-r-lg)] border border-[var(--cuerate-text-3)] bg-black/20 transition-transform duration-300 hover:-translate-y-0.5 hover:shadow-[0_12px_26px_rgba(245,166,35,0.16)]">
                      <div className="flex items-center gap-2 border-b border-[var(--cuerate-text-3)] px-3 py-2 font-accent text-xs uppercase tracking-[0.12em] text-[var(--cuerate-text-2)]">
                        <ImageIcon className="h-3.5 w-3.5" />
                        <span>Start</span>
                      </div>
                      <div style={{ aspectRatio: mediaAspectRatio }}>
                        <img src={step.startFrameUrl} alt={`${step.label} start`} className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]" />
                      </div>
                    </div>

                    <div className="flex items-center justify-center px-1">
                      <ArrowRight className="h-3.5 w-3.5 text-[var(--cuerate-text-2)]" />
                    </div>

                    <div className="group overflow-hidden rounded-[var(--cuerate-r-lg)] border border-[var(--cuerate-text-3)] bg-black/20 transition-transform duration-300 hover:-translate-y-0.5 hover:shadow-[0_12px_26px_rgba(245,166,35,0.16)]">
                      <div className="flex items-center gap-2 border-b border-[var(--cuerate-text-3)] px-3 py-2 font-accent text-xs uppercase tracking-[0.12em] text-[var(--cuerate-text-2)]">
                        <ImageIcon className="h-3.5 w-3.5" />
                        <span>End</span>
                      </div>
                      <div style={{ aspectRatio: mediaAspectRatio }}>
                        <img src={step.endFrameUrl} alt={`${step.label} end`} className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]" />
                      </div>
                    </div>
                  </div>
                )}

                {step.promptText && (
                  <div className="rounded-[var(--cuerate-r-lg)] border border-[var(--cuerate-text-3)] bg-[var(--cuerate-indigo)]/6 p-4">
                    <div className="mb-2 flex items-center gap-2 font-accent text-xs uppercase tracking-[0.14em] text-[var(--cuerate-text-2)]">
                      <Wand2 className="h-3.5 w-3.5" />
                      <span>Prompt</span>
                    </div>
                    <p
                      className={`font-accent text-sm leading-6 text-[var(--cuerate-text-1)] ${
                        expandedPrompts.has(step.id) ? '' : 'line-clamp-2'
                      }`}
                    >
                      {step.promptText}
                    </p>
                    {step.promptText.length > 120 && (
                      <button
                        onClick={() =>
                          setExpandedPrompts((prev) => {
                            const next = new Set(prev);
                            if (next.has(step.id)) {
                              next.delete(step.id);
                            } else {
                              next.add(step.id);
                            }
                            return next;
                          })
                        }
                        className="mt-2 font-accent text-xs text-[#ffd27c] hover:text-[#ffe8b8]"
                      >
                        {expandedPrompts.has(step.id) ? 'Show less' : 'Show more'}
                      </button>
                    )}
                  </div>
                )}

                <div className="group overflow-hidden rounded-[var(--cuerate-r-lg)] border border-[var(--cuerate-text-3)] bg-black/20 transition-transform duration-300 hover:-translate-y-0.5 hover:shadow-[0_14px_28px_rgba(245,166,35,0.16)]">
                  <div className="flex items-center gap-2 border-b border-[var(--cuerate-text-3)] px-3 py-2 font-accent text-xs uppercase tracking-[0.12em] text-[var(--cuerate-text-2)]">
                    {step.resultContentType === 'video' ? <Play className="h-3.5 w-3.5" /> : <ImageIcon className="h-3.5 w-3.5" />}
                    <span>Result</span>
                  </div>
                  <div style={{ aspectRatio: mediaAspectRatio }}>
                    {step.resultContentType === 'video' ? (
                      <video
                        src={step.resultMediaUrl}
                        poster={step.resultThumbnailUrl}
                        className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
                        controls
                        playsInline
                        preload="metadata"
                      />
                    ) : (
                      <img
                        src={step.resultThumbnailUrl}
                        alt={`${step.label} result`}
                        className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
                      />
                    )}
                  </div>
                </div>

                {step.note && (
                  <div className="rounded-[var(--cuerate-r-lg)] border border-[#f5a623]/20 bg-[#f5a623]/8 p-4">
                    <p className="font-accent text-sm leading-6 text-[#ffe4b0]">{step.note}</p>
                  </div>
                )}

                {step.promptText && (
                  <button
                    onClick={() => {
                      void copyText(step.promptText ?? '');
                      setCopiedStepId(step.id);
                      window.setTimeout(() => setCopiedStepId((current) => (current === step.id ? null : current)), 1800);
                    }}
                    className="inline-flex min-h-[44px] items-center gap-2 rounded-[var(--cuerate-r-pill)] bg-[var(--cuerate-indigo)] px-4 py-3 font-accent text-sm font-medium text-white transition-opacity hover:opacity-90"
                  >
                    <Copy className="h-4 w-4" />
                    <span>{copiedStepId === step.id ? 'Copied' : 'Copy prompt'}</span>
                  </button>
                )}
              </div>
            </section>
          ))}

          <button
            onClick={() => {
              const promptLines = workflow.steps
                .filter((step) => step.promptText)
                .map((step, index) => `${index + 1}. ${step.promptText}`)
                .join('\n\n');
              if (!promptLines) {
                return;
              }
              void copyText(promptLines);
            }}
            className="mt-2 inline-flex min-h-[44px] items-center gap-2 rounded-[var(--cuerate-r-pill)] border border-[#f5a623]/30 bg-[#f5a623]/10 px-5 py-3 font-accent text-sm font-medium text-[#ffe4b0] transition-colors hover:bg-[#f5a623]/18"
          >
            <Copy className="h-4 w-4" />
            <span>Copy all prompts</span>
          </button>
        </div>
      </div>
    </div>
  );
}
