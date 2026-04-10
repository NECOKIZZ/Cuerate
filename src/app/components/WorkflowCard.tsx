import { useRef, useState } from 'react';
import { Bookmark, ChevronDown, Heart, Play } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { useNavigate } from 'react-router';
import { Workflow } from '../../lib/types';
import { truncateText } from '../../lib/text';

interface WorkflowCardProps {
  workflow: Workflow;
  onLike?: (id: string) => void;
  onSave?: (id: string) => void;
  isLiked?: boolean;
  isSaved?: boolean;
}

export function WorkflowCard({
  workflow,
  onLike,
  onSave,
  isLiked = false,
  isSaved = false,
}: WorkflowCardProps) {
  const navigate = useNavigate();
  const [isHovering, setIsHovering] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const displayAuthorHandle = truncateText(workflow.authorHandle, 18);
  const displayTitle = truncateText(workflow.title, 56);
  const coverAspectRatio = workflow.mediaAspectRatio === 'portrait' ? '9 / 12' : '16 / 10';

  const handleMouseEnter = () => {
    if (!workflow.coverVideoUrl) {
      return;
    }
    setIsHovering(true);
    if (videoRef.current) {
      videoRef.current.play().catch(() => {
        // Ignore autoplay failures for muted preview videos.
      });
    }
  };

  const handleMouseLeave = () => {
    if (!workflow.coverVideoUrl) {
      return;
    }
    setIsHovering(false);
    if (videoRef.current) {
      videoRef.current.pause();
      videoRef.current.currentTime = 0;
    }
  };

  return (
    <div className="prompt-masonry-item group rounded-[var(--cuerate-r-lg)] border border-[#f5a623]/30 bg-[linear-gradient(180deg,rgba(245,166,35,0.14),rgba(245,166,35,0.05))] p-4 shadow-[0_0_40px_rgba(245,166,35,0.08)]">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <img
            src={workflow.authorAvatar}
            alt={workflow.authorHandle}
            className="h-[34px] w-[34px] rounded-full border-2 border-[#f5a623] object-cover object-center"
          />
          <div className="min-w-0">
            <button
              onClick={() => navigate(`/user/${workflow.authorHandle}`)}
              className="max-w-[132px] truncate font-primary font-medium text-[var(--cuerate-text-1)] transition-colors hover:text-[#f5a623]"
              title={`@${workflow.authorHandle}`}
            >
              @{displayAuthorHandle}
            </button>
            <div className="flex items-center gap-2">
              <span className="font-accent text-xs text-[var(--cuerate-text-2)]">
                {formatDistanceToNow(workflow.createdAt, { addSuffix: true })}
              </span>
            </div>
          </div>
        </div>

        <div className="rounded-full border border-[#f5a623]/30 bg-black/20 px-3 py-1.5 font-accent text-xs font-medium text-[#ffd27c]">
          {workflow.stepCount}
        </div>
      </div>

      <button
        onClick={() => navigate(`/workflow/${workflow.id}`)}
        className="group relative mb-4 block w-full overflow-hidden rounded-[var(--cuerate-r-lg)] text-left transition-transform duration-300 hover:-translate-y-0.5 hover:shadow-[0_14px_30px_rgba(245,166,35,0.22)]"
        style={{ aspectRatio: coverAspectRatio }}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
      >
        {workflow.coverVideoUrl ? (
          <video
            ref={videoRef}
            src={workflow.coverVideoUrl}
            poster={workflow.coverThumbnailUrl}
            className="absolute inset-0 h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.02]"
            muted
            playsInline
            loop
            style={{ opacity: isHovering ? 1 : 0 }}
          />
        ) : (
          <img
            src={workflow.coverThumbnailUrl}
            alt={workflow.title}
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.02]"
          />
        )}
        {workflow.coverVideoUrl && (
          <img
            src={workflow.coverThumbnailUrl}
            alt={workflow.title}
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.02]"
            style={{ opacity: isHovering ? 0 : 1 }}
          />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-black/10" />

        <div className="absolute left-3 top-3 flex items-center gap-2">
          <span className="rounded-full border border-white/20 bg-black/35 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-white backdrop-blur-md">
            {workflow.tool}
          </span>
        </div>
        {workflow.coverVideoUrl && (
          <div
            className="absolute inset-0 flex items-center justify-center bg-black/20 transition-colors pointer-events-none"
            style={{ opacity: isHovering ? 0 : 1 }}
          >
            <div className="flex h-16 w-16 items-center justify-center rounded-full border-4 border-[#f5a623] bg-black/30 shadow-[0_0_28px_rgba(245,166,35,0.35)] backdrop-blur-sm transition-transform duration-200 group-hover:scale-105">
              <Play className="ml-1 h-6 w-6 fill-[#f5a623] text-[#f5a623]" />
            </div>
          </div>
        )}
      </button>

      <h3 className="mb-3 font-primary text-xl font-semibold text-[var(--cuerate-text-1)]" title={workflow.title}>
        {displayTitle}
      </h3>

      <div className="mb-4 flex flex-wrap gap-2">
        {workflow.tags.map((tag) => (
          <span
            key={`${workflow.id}-${tag}`}
            className="rounded-full bg-[#f5a623]/10 px-3 py-1 font-accent text-sm text-[#ffd27c]"
          >
            #{tag}
          </span>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-2">
        <button
          onClick={() => onLike?.(workflow.id)}
          className={`flex min-h-[44px] items-center justify-center gap-2 rounded-[var(--cuerate-r-pill)] px-4 py-3 font-accent text-sm font-medium transition-all ${
            isLiked
              ? 'border border-red-500/30 bg-red-500/10 text-red-400'
              : 'glass-surface text-[var(--cuerate-text-2)] hover:border-red-400/30 hover:text-red-300'
          }`}
        >
          <Heart className={`h-4 w-4 ${isLiked ? 'fill-red-400' : ''}`} />
          <span>{workflow.likes}</span>
        </button>

        <button
          onClick={() => onSave?.(workflow.id)}
          className={`flex min-h-[44px] items-center justify-center gap-2 rounded-[var(--cuerate-r-pill)] px-4 py-3 font-accent text-sm font-medium transition-all ${
            isSaved
              ? 'border border-[#f5a623]/40 bg-[#f5a623]/12 text-[#ffd27c]'
              : 'glass-surface text-[var(--cuerate-text-2)] hover:border-[#f5a623]/30 hover:text-[#ffd27c]'
          }`}
        >
          <Bookmark className={`h-4 w-4 ${isSaved ? 'fill-[#f5a623]' : ''}`} />
          <span>Save</span>
        </button>
      </div>

      <button
        onClick={() => navigate(`/workflow/${workflow.id}`)}
        className="mt-4 flex w-full items-center justify-center rounded-[var(--cuerate-r-pill)] border border-[#f5a623]/20 bg-black/10 py-2 text-[#ffd27c] transition-all duration-200 hover:border-[#f5a623]/40 hover:bg-[#f5a623]/10"
        aria-label="Open workflow thread"
      >
        <ChevronDown className="h-4 w-4 transition-transform duration-200 group-hover:translate-y-0.5" />
      </button>
    </div>
  );
}
