import { useRef, useState, type KeyboardEvent, type MouseEvent } from 'react';
import { Heart, Bookmark, GitFork, Copy, Check, Play } from 'lucide-react';
import { Prompt } from '../../lib/types';
import { useNavigate } from 'react-router';
import { formatDistanceToNow } from 'date-fns';
import { getAIModelConfig } from '../../lib/aiModelLogos';
import { truncateText } from '../../lib/text';

interface PromptCardProps {
  prompt: Prompt;
  onLike?: (id: string) => void;
  onSave?: (id: string) => void;
  onFork?: (id: string) => void;
  onCopy?: (id: string) => void;
  onFollow?: (authorUid: string) => void;
  isLiked?: boolean;
  isSaved?: boolean;
  isForked?: boolean;
  isCopied?: boolean;
  isFollowing?: boolean;
  showFollowButton?: boolean;
}

export function PromptCard({
  prompt,
  onLike,
  onSave,
  onFork,
  onCopy,
  onFollow,
  isLiked = false,
  isSaved = false,
  isForked: userHasForked = false,
  isCopied = false,
  isFollowing = false,
  showFollowButton = true,
}: PromptCardProps) {
  const navigate = useNavigate();
  const [copiedState, setCopiedState] = useState(isCopied);
  const [isHovering, setIsHovering] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const aiModel = getAIModelConfig(prompt.model);
  const displayAuthorHandle = truncateText(prompt.authorHandle, 18);
  const displayForkedFromHandle = prompt.forkedFromAuthorHandle
    ? truncateText(prompt.forkedFromAuthorHandle, 18)
    : null;
  const mediaAspectRatio =
    prompt.mediaWidth && prompt.mediaHeight
      ? `${prompt.mediaWidth} / ${prompt.mediaHeight}`
      : prompt.aspectRatio === 'portrait'
        ? '9 / 16'
        : '16 / 9';

  // Truncate prompt text
  const MAX_PROMPT_LENGTH = 120;
  const isTruncated = prompt.promptText.length > MAX_PROMPT_LENGTH;
  const displayPrompt = isTruncated 
    ? prompt.promptText.substring(0, MAX_PROMPT_LENGTH) + '...' 
    : prompt.promptText;
  const promptDetailPath = `/prompt/${prompt.id}`;

  const handleCardNavigate = () => {
    navigate(promptDetailPath);
  };

  const handleCardClick = (event: MouseEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement;
    if (target.closest('button, a, input, textarea')) {
      return;
    }
    handleCardNavigate();
  };

  const handleCardKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'Enter' && event.key !== ' ') {
      return;
    }
    event.preventDefault();
    handleCardNavigate();
  };

  const handleCopy = async () => {
    try {
      // Try modern Clipboard API first
      await navigator.clipboard.writeText(prompt.promptText);
      setCopiedState(true);
      onCopy?.(prompt.id);
    } catch (err) {
      // Fallback to older method
      const textArea = document.createElement('textarea');
      textArea.value = prompt.promptText;
      textArea.style.position = 'fixed';
      textArea.style.left = '-999999px';
      textArea.style.top = '-999999px';
      document.body.appendChild(textArea);
      textArea.focus();
      textArea.select();
      try {
        document.execCommand('copy');
        setCopiedState(true);
        onCopy?.(prompt.id);
      } catch (execErr) {
        console.error('Copy failed:', execErr);
      }
      textArea.remove();
    }
    setTimeout(() => setCopiedState(false), 2000);
  };

  const handleMouseEnter = () => {
    if (prompt.contentType !== 'video') {
      return;
    }
    setIsHovering(true);
    if (videoRef.current) {
      videoRef.current.play().catch(() => {
        // Ignore autoplay failures in muted hover previews.
      });
    }
  };

  const handleMouseLeave = () => {
    if (prompt.contentType !== 'video') {
      return;
    }
    setIsHovering(false);
    if (videoRef.current) {
      videoRef.current.pause();
      videoRef.current.currentTime = 0;
    }
  };

  return (
    <div
      className="prompt-masonry-item glass-surface rounded-[var(--cuerate-r-lg)] p-4 card-top-edge cursor-pointer transition-transform duration-300 hover:-translate-y-0.5"
      role="button"
      tabIndex={0}
      onClick={handleCardClick}
      onKeyDown={handleCardKeyDown}
      aria-label={`Open prompt by ${prompt.authorHandle}`}
    >
      {/* Card Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-3">
          <img
            src={prompt.authorAvatar}
            alt={prompt.authorHandle}
            className="w-[34px] h-[34px] rounded-full border-2 border-[var(--cuerate-indigo)] object-cover object-center"
          />
          <div className="min-w-0">
            <button
              onClick={(event) => {
                event.stopPropagation();
                navigate(`/user/${prompt.authorHandle}`);
              }}
              className="max-w-[132px] truncate font-primary font-medium text-[var(--cuerate-text-1)] hover:text-[var(--cuerate-indigo)] transition-colors"
              title={`@${prompt.authorHandle}`}
            >
              @{displayAuthorHandle}
            </button>
            <div className="flex items-center gap-2">
              <span className="font-accent text-xs text-[var(--cuerate-text-2)]">
                {formatDistanceToNow(prompt.createdAt, { addSuffix: true })}
              </span>
              
            </div>
          </div>
        </div>
        {showFollowButton && (
          <button
            onClick={(event) => {
              event.stopPropagation();
              onFollow?.(prompt.authorUid);
            }}
            className={`px-4 py-1.5 rounded-[var(--cuerate-r-pill)] ${
              isFollowing
                ? 'bg-[var(--cuerate-indigo)]/10 text-[var(--cuerate-indigo)]'
                : 'bg-[var(--cuerate-indigo)] text-white indigo-glow'
            } font-accent text-xs font-medium transition-opacity hover:opacity-90`}
          >
            {isFollowing ? 'Following' : 'Follow'}
          </button>
        )}
      </div>

      {/* Fork Attribution */}
      {prompt.isForked && prompt.forkedFromAuthorHandle && prompt.forkedFromId && (
        <div className="mb-3 flex items-center gap-2 px-3 py-2 rounded-[var(--cuerate-r-md)] bg-[var(--cuerate-indigo)]/10">
          <GitFork className="w-3 h-3 text-[var(--cuerate-indigo)]" />
          <button
            onClick={(event) => {
              event.stopPropagation();
              navigate(`/prompt/${prompt.forkedFromId}`);
            }}
            className="font-accent text-xs text-[var(--cuerate-indigo)] hover:underline"
            title={`Open parent prompt from @${prompt.forkedFromAuthorHandle}`}
          >
            Forked from @{displayForkedFromHandle}
          </button>
        </div>
      )}

      {/* Media Thumbnail */}
      <div
        className="relative mb-3 rounded-[var(--cuerate-r-sm)] overflow-hidden group w-full cursor-pointer transition-transform duration-300 hover:-translate-y-0.5 hover:shadow-[0_12px_28px_rgba(37,99,235,0.25)]"
        style={{
          aspectRatio: mediaAspectRatio
        }}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
      >
        {prompt.contentType === 'video' && (
          <video
            ref={videoRef}
            src={prompt.videoUrl}
            className="absolute inset-0 w-full h-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
            loop
            muted
            playsInline
            style={{ opacity: isHovering ? 1 : 0 }}
          />
        )}

        {/* Thumbnail image */}
        <img
          src={prompt.thumbnailUrl}
          alt="Prompt thumbnail"
          className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
          style={{ opacity: isHovering && prompt.contentType === 'video' ? 0 : 1 }}
        />

        {prompt.contentType === 'video' && (
          <>
            <div
              className="absolute inset-0 flex items-center justify-center bg-black/20 group-hover:bg-black/30 transition-colors pointer-events-none"
              style={{ opacity: isHovering ? 0 : 1 }}
            >
              <div className="w-16 h-16 rounded-full border-4 border-[var(--cuerate-blue)] flex items-center justify-center blue-glow">
                <Play className="w-6 h-6 text-[var(--cuerate-blue)] fill-[var(--cuerate-blue)] ml-1" />
              </div>
            </div>
          </>
        )}

        {/* AI Model Logo Badge - TOP LEFT */}
        <div className="absolute top-2 sm:top-3 left-2 sm:left-3 h-5 sm:h-6 px-2 sm:px-2.5 rounded-[var(--cuerate-r-pill)] glass-surface border border-white/20 backdrop-blur-md flex items-center gap-1 sm:gap-1.5 pointer-events-none">
          {aiModel.logoUrl ? (
            <img src={aiModel.logoUrl} alt={aiModel.name} className="h-3 sm:h-4 w-auto" />
          ) : (
            <span className={`font-accent text-[9px] sm:text-[10px] font-bold ${aiModel.color}`}>
              {aiModel.name}
            </span>
          )}
        </div>

      </div>

      {/* Prompt Text Box */}
      <div
        className="w-full mb-3 p-4 rounded-[var(--cuerate-r-md)] bg-[var(--cuerate-indigo)]/5 border border-[var(--cuerate-indigo)]/20 hover:border-[var(--cuerate-indigo)]/40 transition-colors text-left cursor-pointer"
      >
        <p className="font-accent text-sm sm:text-base text-[var(--cuerate-text-2)] leading-relaxed">
          {displayPrompt}
          {isTruncated && (
            <span className="text-[var(--cuerate-indigo)] font-medium ml-1">more</span>
          )}
        </p>
      </div>

      {/* Style Tags */}
      <div className="flex flex-wrap gap-2 mb-3">
        {prompt.styleTags.map((tag) => (
          <span
            key={tag}
            className="px-3 py-1 rounded-[var(--cuerate-r-pill)] bg-[var(--cuerate-blue)]/10 font-accent text-sm text-[var(--cuerate-blue)]"
          >
            #{tag}
          </span>
        ))}
      </div>

      {/* Action Row */}
      <div className="grid grid-cols-2 gap-2">
        <button
          onClick={(event) => {
            event.stopPropagation();
            onLike?.(prompt.id);
          }}
          className={`flex items-center justify-center gap-2 px-4 py-3 rounded-[var(--cuerate-r-pill)] font-accent text-sm font-medium transition-all min-h-[44px] ${
            isLiked
              ? 'bg-red-500/10 text-red-500 border border-red-500/30'
              : 'glass-surface text-[var(--cuerate-text-2)] hover:text-red-400 hover:border-red-400/30'
          }`}
        >
          <Heart className={`w-4 h-4 ${isLiked ? 'fill-red-500' : ''}`} />
          <span>{prompt.likes}</span>
        </button>

        <button
          onClick={(event) => {
            event.stopPropagation();
            onSave?.(prompt.id);
          }}
          className={`flex items-center justify-center gap-2 px-4 py-3 rounded-[var(--cuerate-r-pill)] font-accent text-sm font-medium transition-all min-h-[44px] ${
            isSaved
              ? 'bg-[var(--cuerate-indigo)]/10 text-[var(--cuerate-indigo)] border border-[var(--cuerate-indigo)]/30'
              : 'glass-surface text-[var(--cuerate-text-2)] hover:text-[var(--cuerate-indigo)] hover:border-[var(--cuerate-indigo)]/30'
          }`}
        >
          <Bookmark className={`w-4 h-4 ${isSaved ? 'fill-[var(--cuerate-indigo)]' : ''}`} />
          <span>Save</span>
        </button>

        <button
          onClick={(event) => {
            event.stopPropagation();
            onFork?.(prompt.id);
          }}
          className="flex items-center justify-center gap-2 px-4 py-3 rounded-[var(--cuerate-r-pill)] glass-surface text-[var(--cuerate-text-2)] hover:text-[#4cce8a] hover:border-[#4cce8a]/30 font-accent text-sm font-medium transition-all min-h-[44px]"
        >
          <GitFork className="w-4 h-4" />
          <span>Fork</span>
        </button>

        <button
          onClick={(event) => {
            event.stopPropagation();
            void handleCopy();
          }}
          className={`flex items-center justify-center gap-2 px-4 py-3 rounded-[var(--cuerate-r-pill)] font-accent text-sm font-medium transition-all min-h-[44px] ${
            copiedState
              ? 'bg-[#4cce8a] text-white border border-[#4cce8a]'
              : 'bg-[var(--cuerate-indigo)] text-white indigo-glow hover:opacity-90 border border-transparent'
          }`}
        >
          {copiedState ? (
            <>
              <Check className="w-4 h-4" />
              <span>Copied</span>
            </>
          ) : (
            <>
              <Copy className="w-4 h-4" />
              <span>Copy</span>
            </>
          )}
        </button>
      </div>
    </div>
  );
}
