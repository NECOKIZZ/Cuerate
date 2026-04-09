import { useRef, useState } from 'react';
import { Heart, Bookmark, GitFork, Copy, Check, Play, Maximize2, X } from 'lucide-react';
import { Prompt } from '../../lib/types';
import { useNavigate } from 'react-router';
import { formatDistanceToNow } from 'date-fns';
import { getAIModelConfig } from '../../lib/aiModelLogos';
import { motion, AnimatePresence } from 'motion/react';
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
  const [isExpanded, setIsExpanded] = useState(false);
  const [isCardExpanded, setIsCardExpanded] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const expandedVideoRef = useRef<HTMLVideoElement>(null);
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
    <div className="prompt-masonry-item glass-surface rounded-[var(--cuerate-r-lg)] p-4 card-top-edge">
      {/* Card Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-3">
          <img
            src={prompt.authorAvatar}
            alt={prompt.authorHandle}
            className="w-[34px] h-[34px] rounded-full border-2 border-[var(--cuerate-indigo)]"
          />
          <div className="min-w-0">
            <button
              onClick={() => navigate(`/user/${prompt.authorHandle}`)}
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
            onClick={() => onFollow?.(prompt.authorUid)}
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
      {prompt.isForked && prompt.forkedFromAuthorHandle && (
        <div className="mb-3 flex items-center gap-2 px-3 py-2 rounded-[var(--cuerate-r-md)] bg-[var(--cuerate-indigo)]/10">
          <GitFork className="w-3 h-3 text-[var(--cuerate-indigo)]" />
          <span className="font-accent text-xs text-[var(--cuerate-indigo)]" title={`@${prompt.forkedFromAuthorHandle}`}>
            Forked from @{displayForkedFromHandle}
          </span>
        </div>
      )}

      {/* Media Thumbnail */}
      <button
        onClick={() => {
          if (prompt.contentType !== 'video') {
            return;
          }
          setIsExpanded(true);
          setTimeout(() => {
            if (expandedVideoRef.current) {
              expandedVideoRef.current.play().catch(() => {});
            }
          }, 100);
        }}
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

            <div className="absolute bottom-3 right-3 p-2 rounded-[var(--cuerate-r-pill)] glass-surface border border-white/20 pointer-events-none">
              <Maximize2 className="w-4 h-4 text-[var(--cuerate-text-1)]" />
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

        {/* Mood Label - BOTTOM LEFT */}
        <div className="absolute bottom-2 sm:bottom-3 left-2 sm:left-3 px-2 sm:px-3 py-1 sm:py-1.5 rounded-[var(--cuerate-r-pill)] glass-surface font-accent text-[10px] sm:text-xs text-[var(--cuerate-text-1)] pointer-events-none">
          {prompt.moodLabel}
        </div>
      </button>

      {/* Prompt Text Box */}
      <button
        onClick={() => setIsCardExpanded(true)}
        className="w-full mb-3 p-4 rounded-[var(--cuerate-r-md)] bg-[var(--cuerate-indigo)]/5 border border-[var(--cuerate-indigo)]/20 hover:border-[var(--cuerate-indigo)]/40 transition-colors text-left cursor-pointer"
      >
        <p className="font-accent text-sm sm:text-base text-[var(--cuerate-text-2)] leading-relaxed">
          {displayPrompt}
          {isTruncated && (
            <span className="text-[var(--cuerate-indigo)] font-medium ml-1">more</span>
          )}
        </p>
      </button>

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
          onClick={() => onLike?.(prompt.id)}
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
          onClick={() => onSave?.(prompt.id)}
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
          onClick={() => onFork?.(prompt.id)}
          className="flex items-center justify-center gap-2 px-4 py-3 rounded-[var(--cuerate-r-pill)] glass-surface text-[var(--cuerate-text-2)] hover:text-[#4cce8a] hover:border-[#4cce8a]/30 font-accent text-sm font-medium transition-all min-h-[44px]"
        >
          <GitFork className="w-4 h-4" />
          <span>Fork</span>
        </button>

        <button
          onClick={handleCopy}
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

      {/* Fullscreen Video Modal */}
      <AnimatePresence>
        {isExpanded && prompt.contentType === 'video' && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/95 backdrop-blur-sm p-4"
            onClick={() => {
              setIsExpanded(false);
              if (expandedVideoRef.current) {
                expandedVideoRef.current.pause();
              }
            }}
          >
            <button
              onClick={() => {
                setIsExpanded(false);
                if (expandedVideoRef.current) {
                  expandedVideoRef.current.pause();
                }
              }}
              className="absolute top-6 right-6 p-3 rounded-full glass-surface hover:bg-[var(--cuerate-indigo)]/20 transition-colors z-10"
            >
              <X className="w-6 h-6 text-white" />
            </button>

            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="relative"
              style={{
                ...(prompt.aspectRatio === 'portrait'
                  ? { height: '85vh', aspectRatio: '9/16' }
                  : { width: '90vw', maxWidth: '1536px', aspectRatio: '16/9' }
                )
              }}
              onClick={(event) => event.stopPropagation()}
            >
              <video
                ref={expandedVideoRef}
                src={prompt.videoUrl}
                className="w-full h-full rounded-[var(--cuerate-r-lg)] object-cover"
                loop
                muted
                playsInline
                controls
              />
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Expanded Card Modal */}
      <AnimatePresence>
        {isCardExpanded && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
            style={{ paddingTop: 'env(safe-area-inset-top)', paddingBottom: 'env(safe-area-inset-bottom)' }}
            onClick={() => setIsCardExpanded(false)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 20 }}
              transition={{ duration: 0.2 }}
              className="w-full max-w-2xl max-h-[90vh] overflow-y-auto glass-surface rounded-[var(--cuerate-r-xl)] border border-[var(--cuerate-text-3)]"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header */}
              <div className="sticky top-0 glass-nav border-b border-[var(--cuerate-text-3)] px-5 py-3 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <img
                    src={prompt.authorAvatar}
                    alt={prompt.authorHandle}
                    className="w-10 h-10 rounded-full border-2 border-[var(--cuerate-indigo)]"
                  />
                  <div className="min-w-0">
                    <button
                      onClick={() => {
                        setIsCardExpanded(false);
                        navigate(`/user/${prompt.authorHandle}`);
                      }}
                      className="max-w-[164px] truncate font-primary font-bold text-base text-white hover:text-[var(--cuerate-indigo)] transition-colors"
                      title={`@${prompt.authorHandle}`}
                    >
                      @{displayAuthorHandle}
                    </button>
                    <p className="font-accent text-xs text-[var(--cuerate-text-2)]">
                      {formatDistanceToNow(prompt.createdAt, { addSuffix: true })}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setIsCardExpanded(false)}
                  className="p-2 rounded-full hover:bg-[var(--cuerate-surface)] transition-colors"
                >
                  <X className="w-5 h-5 text-[var(--cuerate-text-2)]" />
                </button>
              </div>

              {/* Content */}
              <div className="p-5 space-y-4">
                {/* Fork Attribution */}
                {prompt.isForked && prompt.forkedFromAuthorHandle && (
                  <div className="glass-surface rounded-[var(--cuerate-r-lg)] p-3 border border-[var(--cuerate-text-3)]">
                    <p className="font-accent text-xs text-[var(--cuerate-text-2)] mb-2">Forked from</p>
                    <div className="flex items-center gap-3">
                      <GitFork className="w-4 h-4 text-[var(--cuerate-indigo)]" />
                      <p className="font-accent text-sm text-[var(--cuerate-indigo)]" title={`@${prompt.forkedFromAuthorHandle}`}>
                        @{displayForkedFromHandle}
                      </p>
                    </div>
                  </div>
                )}

                {/* Media Thumbnail */}
                {prompt.contentType === 'video' ? (
                  <button
                    onClick={() => {
                      setIsCardExpanded(false);
                      setIsExpanded(true);
                      setTimeout(() => {
                        if (expandedVideoRef.current) {
                          expandedVideoRef.current.play().catch(() => {});
                        }
                      }, 100);
                    }}
                    className="relative w-full rounded-[var(--cuerate-r-lg)] overflow-hidden group cursor-pointer"
                    style={{
                      aspectRatio: mediaAspectRatio
                    }}
                  >
                    <img
                      src={prompt.thumbnailUrl}
                      alt="Video thumbnail"
                      className="w-full h-full object-cover"
                    />

                    <div className="absolute inset-0 flex items-center justify-center bg-black/20 group-hover:bg-black/30 transition-colors">
                      <div className="w-16 h-16 rounded-full border-4 border-[var(--cuerate-blue)] flex items-center justify-center blue-glow">
                        <Play className="w-6 h-6 text-[var(--cuerate-blue)] fill-[var(--cuerate-blue)] ml-1" />
                      </div>
                    </div>

                    <div className="absolute top-3 left-3 h-6 px-2.5 rounded-[var(--cuerate-r-pill)] glass-surface border border-white/20 backdrop-blur-md flex items-center gap-1.5 pointer-events-none">
                      {aiModel.logoUrl ? (
                        <img src={aiModel.logoUrl} alt={aiModel.name} className="h-4 w-auto" />
                      ) : (
                        <span className={`font-accent text-[10px] font-bold ${aiModel.color}`}>
                          {aiModel.name}
                        </span>
                      )}
                    </div>

                    <div className="absolute bottom-3 left-3 px-3 py-1.5 rounded-[var(--cuerate-r-pill)] glass-surface font-accent text-xs text-[var(--cuerate-text-1)] pointer-events-none">
                      {prompt.moodLabel}
                    </div>
                  </button>
                ) : (
                  <div
                    className="relative w-full rounded-[var(--cuerate-r-lg)] overflow-hidden"
                    style={{
                      aspectRatio: mediaAspectRatio
                    }}
                  >
                    <img
                      src={prompt.thumbnailUrl}
                      alt="Image thumbnail"
                      className="w-full h-full object-cover"
                    />

                    <div className="absolute top-3 left-3 h-6 px-2.5 rounded-[var(--cuerate-r-pill)] glass-surface border border-white/20 backdrop-blur-md flex items-center gap-1.5 pointer-events-none">
                      {aiModel.logoUrl ? (
                        <img src={aiModel.logoUrl} alt={aiModel.name} className="h-4 w-auto" />
                      ) : (
                        <span className={`font-accent text-[10px] font-bold ${aiModel.color}`}>
                          {aiModel.name}
                        </span>
                      )}
                    </div>

                    <div className="absolute bottom-3 left-3 px-3 py-1.5 rounded-[var(--cuerate-r-pill)] glass-surface font-accent text-xs text-[var(--cuerate-text-1)] pointer-events-none">
                      {prompt.moodLabel}
                    </div>
                  </div>
                )}

                {/* Full Prompt Text */}
                <div>
                  <label className="block font-accent text-sm font-medium text-[var(--cuerate-text-1)] mb-2">
                    Prompt
                  </label>
                  <div className="glass-surface rounded-[var(--cuerate-r-lg)] border border-[var(--cuerate-text-3)] p-4">
                    <p className="font-accent text-sm text-[var(--cuerate-text-1)] leading-relaxed whitespace-pre-wrap">
                      {prompt.promptText}
                    </p>
                  </div>
                </div>

                {/* Style Tags */}
                <div>
                  <label className="block font-accent text-sm font-medium text-[var(--cuerate-text-1)] mb-2">
                    Tags
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {prompt.styleTags.map((tag) => (
                      <span
                        key={tag}
                        className="px-3 py-1.5 rounded-[var(--cuerate-r-pill)] bg-[var(--cuerate-blue)]/10 font-accent text-sm text-[var(--cuerate-blue)] border border-[var(--cuerate-blue)]/20"
                      >
                        #{tag}
                      </span>
                    ))}
                  </div>
                </div>

                {/* Action Buttons */}
                <div className="grid grid-cols-2 gap-2 pt-2">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onLike?.(prompt.id);
                    }}
                    className={`flex items-center justify-center gap-2 px-4 py-3 rounded-[var(--cuerate-r-pill)] font-accent text-sm font-medium transition-all min-h-[44px] ${
                      isLiked
                        ? 'bg-red-500/10 text-red-500 border border-red-500/30'
                        : 'glass-surface text-[var(--cuerate-text-2)] hover:text-red-400 hover:border-red-400/30 border border-[var(--cuerate-text-3)]'
                    }`}
                  >
                    <Heart className={`w-4 h-4 ${isLiked ? 'fill-red-500' : ''}`} />
                    <span>{prompt.likes}</span>
                  </button>

                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onSave?.(prompt.id);
                    }}
                    className={`flex items-center justify-center gap-2 px-4 py-3 rounded-[var(--cuerate-r-pill)] font-accent text-sm font-medium transition-all min-h-[44px] ${
                      isSaved
                        ? 'bg-[var(--cuerate-indigo)]/10 text-[var(--cuerate-indigo)] border border-[var(--cuerate-indigo)]/30'
                        : 'glass-surface text-[var(--cuerate-text-2)] hover:text-[var(--cuerate-indigo)] hover:border-[var(--cuerate-indigo)]/30 border border-[var(--cuerate-text-3)]'
                    }`}
                  >
                    <Bookmark className={`w-4 h-4 ${isSaved ? 'fill-[var(--cuerate-indigo)]' : ''}`} />
                    <span>Save</span>
                  </button>

                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setIsCardExpanded(false);
                      onFork?.(prompt.id);
                    }}
                    className="flex items-center justify-center gap-2 px-4 py-3 rounded-[var(--cuerate-r-pill)] glass-surface text-[var(--cuerate-text-2)] hover:text-[#4cce8a] hover:border-[#4cce8a]/30 font-accent text-sm font-medium transition-all min-h-[44px] border border-[var(--cuerate-text-3)]"
                  >
                    <GitFork className="w-4 h-4" />
                    <span>Fork</span>
                  </button>

                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleCopy();
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
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
