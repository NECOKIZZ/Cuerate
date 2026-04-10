import { useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { ArrowLeft, Eye, EyeOff, GitFork } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { promptsApi } from '../../lib/backend';
import { getAIModelConfig } from '../../lib/aiModelLogos';
import { useBackendQuery } from '../../lib/useBackendQuery';
import { truncateText } from '../../lib/text';

export function PromptDetail() {
  const navigate = useNavigate();
  const { promptId } = useParams<{ promptId: string }>();
  const [isPromptVisible, setIsPromptVisible] = useState(true);
  const { data: prompt, isLoading } = useBackendQuery(
    () => (promptId ? promptsApi.getPromptById(promptId) : Promise.resolve(null)),
    null,
    [promptId],
  );

  if (isLoading) {
    return (
      <div className="min-h-screen px-4 py-10 md:px-8">
        <div className="mx-auto max-w-3xl rounded-[var(--cuerate-r-xl)] border border-[var(--cuerate-text-3)] bg-[var(--cuerate-surface)] p-8 text-center">
          <p className="font-primary text-2xl text-[var(--cuerate-text-1)]">Loading prompt...</p>
        </div>
      </div>
    );
  }

  if (!prompt) {
    return (
      <div className="min-h-screen px-4 py-10 md:px-8">
        <div className="mx-auto max-w-3xl rounded-[var(--cuerate-r-xl)] border border-[var(--cuerate-text-3)] bg-[var(--cuerate-surface)] p-8 text-center">
          <p className="font-primary text-2xl text-[var(--cuerate-text-1)]">Prompt not found</p>
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

  const aiModel = getAIModelConfig(prompt.model);
  const displayAuthorHandle = truncateText(prompt.authorHandle, 22);
  const displayForkedFromHandle = prompt.forkedFromAuthorHandle
    ? truncateText(prompt.forkedFromAuthorHandle, 20)
    : null;

  return (
    <div className="relative h-[calc(100dvh-5rem)] md:h-dvh overflow-hidden bg-black">
      <div className="absolute inset-0 flex items-center justify-center px-2 py-2 md:px-4 md:py-4">
        <div className="h-full w-full flex items-center justify-center">
          {prompt.contentType === 'video' ? (
            <video
              src={prompt.videoUrl}
              poster={prompt.thumbnailUrl}
              className="h-full w-auto max-h-full max-w-full object-contain"
              controls
              autoPlay
              loop
              muted
              playsInline
            />
          ) : (
            <img
              src={prompt.thumbnailUrl}
              alt="Prompt preview"
              className="h-full w-auto max-h-full max-w-full object-contain"
            />
          )}
        </div>
      </div>

      <div className="pointer-events-none absolute inset-x-0 top-0 h-28 bg-gradient-to-b from-black/70 to-transparent" />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t from-black/85 via-black/55 to-transparent" />

      <div className="absolute left-3 top-3 z-10 flex items-center gap-2 md:left-4 md:top-4">
        <button
          onClick={() => navigate(-1)}
          className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-black/45 px-3 py-2 font-accent text-xs text-white backdrop-blur-sm transition-colors hover:bg-black/65 md:text-sm"
        >
          <ArrowLeft className="h-4 w-4" />
          <span>Back</span>
        </button>

        <button
          onClick={() => navigate(`/user/${prompt.authorHandle}`)}
          className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-black/45 px-3 py-2 text-left backdrop-blur-sm transition-colors hover:bg-black/65"
          title={`@${prompt.authorHandle}`}
        >
          <img
            src={prompt.authorAvatar}
            alt={prompt.authorHandle}
            className="h-6 w-6 rounded-full border border-[var(--cuerate-indigo)] object-cover object-center"
          />
          <span className="max-w-[120px] truncate font-accent text-xs text-white md:max-w-[160px]">
            @{displayAuthorHandle}
          </span>
        </button>
      </div>

      <div className="absolute right-3 top-3 z-10 flex items-center gap-2 md:right-4 md:top-4">
        <div className="h-7 rounded-[var(--cuerate-r-pill)] border border-white/20 bg-black/45 px-2.5 backdrop-blur-sm flex items-center gap-1.5">
          {aiModel.logoUrl ? (
            <img src={aiModel.logoUrl} alt={aiModel.name} className="h-4 w-auto" />
          ) : (
            <span className={`font-accent text-[10px] font-bold ${aiModel.color}`}>
              {aiModel.name}
            </span>
          )}
        </div>
        <span className="rounded-[var(--cuerate-r-pill)] border border-white/20 bg-black/45 px-2.5 py-1 font-accent text-[10px] text-white backdrop-blur-sm md:text-xs">
          {prompt.moodLabel}
        </span>
        <button
          onClick={() => setIsPromptVisible((current) => !current)}
          className="inline-flex items-center gap-1.5 rounded-[var(--cuerate-r-pill)] border border-white/20 bg-black/55 px-2.5 py-1.5 font-accent text-[10px] text-white backdrop-blur-md transition-colors hover:bg-black/70 md:px-3 md:text-xs"
        >
          {isPromptVisible ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
          <span>{isPromptVisible ? 'Hide prompt' : 'Show prompt'}</span>
        </button>
      </div>

      {isPromptVisible && (
        <div className="absolute inset-x-0 bottom-0 z-10 px-3 pb-3 md:px-4 md:pb-4">
          <div className="mx-auto w-full max-w-4xl rounded-[var(--cuerate-r-xl)] border border-white/20 bg-black/55 p-3 backdrop-blur-md md:p-4">
            <div className="mb-2 flex items-center justify-between gap-2">
              <span className="font-accent text-[10px] uppercase tracking-[0.14em] text-[var(--cuerate-text-2)] md:text-xs">
                {formatDistanceToNow(prompt.createdAt, { addSuffix: true })}
              </span>
              {prompt.isForked && prompt.forkedFromAuthorHandle && (
                <span className="inline-flex items-center gap-1 text-[10px] text-[var(--cuerate-indigo)] md:text-xs">
                  <GitFork className="h-3 w-3" />
                  Forked from @{displayForkedFromHandle}
                </span>
              )}
            </div>
            <div className="max-h-24 overflow-y-auto md:max-h-32">
              <p className="whitespace-pre-wrap font-accent text-xs leading-relaxed text-white md:text-sm">
                {prompt.promptText}
              </p>
            </div>
            {prompt.styleTags.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1.5 md:mt-3 md:gap-2">
                {prompt.styleTags.map((tag) => (
                  <span
                    key={`${prompt.id}-${tag}`}
                    className="rounded-[var(--cuerate-r-pill)] border border-[var(--cuerate-blue)]/35 bg-[var(--cuerate-blue)]/15 px-2 py-0.5 font-accent text-[10px] text-[var(--cuerate-blue)] md:text-xs"
                  >
                    #{tag}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
