import { useEffect, useState } from 'react';
import { Bell, Settings, Image, Video, Filter, ChevronDown } from 'lucide-react';
import { useNavigate } from 'react-router';
import { PromptCard } from '../components/PromptCard';
import { ForkPromptModal } from '../components/ForkPromptModal';
import { authApi, metaApi, promptsApi } from '../../lib/backend';
import { useAuth } from '../../lib/auth-context';
import { useBackendQuery } from '../../lib/useBackendQuery';
import { Prompt } from '../../lib/types';

export function Feed() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [activeFilter, setActiveFilter] = useState('All');
  const [contentType, setContentType] = useState<'all' | 'image' | 'video'>('all');
  const [hasUnreadNotifications] = useState(true);
  const [followedUsers, setFollowedUsers] = useState<Set<string>>(new Set());
  const [likedPrompts, setLikedPrompts] = useState<Set<string>>(new Set());
  const [savedPrompts, setSavedPrompts] = useState<Set<string>>(new Set());
  const [copiedPrompts, setCopiedPrompts] = useState<Set<string>>(new Set());
  const [forkModalPrompt, setForkModalPrompt] = useState<Prompt | null>(null);
  const [showFilters, setShowFilters] = useState(false);
  const [promptOverrides, setPromptOverrides] = useState<Record<string, Prompt>>({});

  const { data: prompts } = useBackendQuery(() => promptsApi.getFeedPrompts(), [], []);
  const { data: availableModels } = useBackendQuery(() => metaApi.getAvailableModels(), [], []);
  const { data: availableStyleTags } = useBackendQuery(() => metaApi.getAvailableStyleTags(), [], []);
  const { data: currentUser } = useBackendQuery(() => authApi.getCurrentUser(), null, []);
  const activeUser = user ?? currentUser;
  const { data: likedPromptIds } = useBackendQuery(
    () => (activeUser ? promptsApi.getLikedPromptIds(activeUser.uid) : Promise.resolve([])),
    [],
    [activeUser?.uid],
  );

  const hydratedPrompts = prompts.map((prompt) => promptOverrides[prompt.id] ?? prompt);

  const filters = ['All', ...availableModels, ...availableStyleTags.slice(0, 4)];

  useEffect(() => {
    setLikedPrompts(new Set(likedPromptIds));
  }, [likedPromptIds]);

  const handleFollow = (authorHandle: string) => {
    setFollowedUsers((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(authorHandle)) {
        newSet.delete(authorHandle);
      } else {
        newSet.add(authorHandle);
      }
      return newSet;
    });
  };

  const handleLike = (promptId: string) => {
    if (!activeUser) {
      navigate('/auth');
      return;
    }

    const targetPrompt = hydratedPrompts.find((entry) => entry.id === promptId);
    if (!targetPrompt) {
      return;
    }

    const wasLiked = likedPrompts.has(promptId);

    setLikedPrompts((prev) => {
      const newSet = new Set(prev);
      if (wasLiked) {
        newSet.delete(promptId);
      } else {
        newSet.add(promptId);
      }
      return newSet;
    });

    setPromptOverrides((prev) => ({
      ...prev,
      [promptId]: {
        ...targetPrompt,
        likes: Math.max(0, targetPrompt.likes + (wasLiked ? -1 : 1)),
      },
    }));

    void promptsApi
      .toggleLike(promptId, activeUser.uid)
      .then((result) => {
        setLikedPrompts((prev) => {
          const newSet = new Set(prev);
          if (result.liked) {
            newSet.add(promptId);
          } else {
            newSet.delete(promptId);
          }
          return newSet;
        });

        setPromptOverrides((prev) => ({
          ...prev,
          [promptId]: {
            ...(prev[promptId] ?? targetPrompt),
            likes: result.likes,
          },
        }));
      })
      .catch(() => {
        setLikedPrompts((prev) => {
          const newSet = new Set(prev);
          if (wasLiked) {
            newSet.add(promptId);
          } else {
            newSet.delete(promptId);
          }
          return newSet;
        });

        setPromptOverrides((prev) => ({
          ...prev,
          [promptId]: targetPrompt,
        }));
      });
  };

  const handleSave = (promptId: string) => {
    setSavedPrompts((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(promptId)) {
        newSet.delete(promptId);
      } else {
        newSet.add(promptId);
      }
      return newSet;
    });
  };

  const handleFork = (promptId: string) => {
    const prompt = hydratedPrompts.find((entry) => entry.id === promptId);
    if (prompt) {
      setForkModalPrompt(prompt);
    }
  };

  const handleCopy = (promptId: string) => {
    setCopiedPrompts((prev) => {
      const newSet = new Set(prev);
      newSet.add(promptId);
      return newSet;
    });

    setTimeout(() => {
      setCopiedPrompts((prev) => {
        const newSet = new Set(prev);
        newSet.delete(promptId);
        return newSet;
      });
    }, 2000);
  };

  const filteredPrompts = hydratedPrompts.filter((prompt) => {
    if (contentType !== 'all' && prompt.contentType !== contentType) {
      return false;
    }

    if (activeFilter === 'All') {
      return true;
    }

    return prompt.model === activeFilter || prompt.styleTags.includes(activeFilter.toLowerCase());
  });

  return (
    <div className="min-h-screen">
      <div className="sticky top-0 z-40 glass-nav border-b border-[var(--cuerate-text-3)] md:hidden" style={{ paddingTop: 'env(safe-area-inset-top)' }}>
        <div className="flex items-center justify-between px-3 sm:px-4 py-3 sm:py-4">
          <span className="font-primary font-bold text-lg sm:text-xl text-[var(--cuerate-blue)]">Cuerate</span>
          <div className="flex items-center gap-1 sm:gap-2">
            <button
              onClick={() => navigate('/notifications')}
              className="relative p-2 sm:p-2.5 rounded-full hover:bg-[var(--cuerate-surface)] transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center"
            >
              <Bell className="w-4 h-4 sm:w-5 sm:h-5 text-[var(--cuerate-text-1)]" />
              {hasUnreadNotifications && (
                <div className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-[var(--cuerate-blue)] blue-glow" />
              )}
            </button>
            <button className="p-2 sm:p-2.5 rounded-full hover:bg-[var(--cuerate-surface)] transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center">
              <Settings className="w-4 h-4 sm:w-5 sm:h-5 text-[var(--cuerate-text-1)]" />
            </button>
          </div>
        </div>

        <div className="overflow-x-auto scrollbar-hide px-3 sm:px-4 pb-3 sm:pb-4">
          <div className="flex gap-2">
            {filters.map((filter) => (
              <button
                key={filter}
                onClick={() => setActiveFilter(filter)}
                className={`px-3 sm:px-4 py-2 rounded-[var(--cuerate-r-pill)] font-accent text-xs sm:text-sm whitespace-nowrap transition-all ${
                  activeFilter === filter
                    ? 'bg-[var(--cuerate-indigo)] text-white indigo-glow'
                    : 'glass-surface text-[var(--cuerate-text-2)] hover:text-[var(--cuerate-text-1)]'
                }`}
              >
                {filter}
              </button>
            ))}
          </div>
        </div>

        <div className="flex gap-1.5 sm:gap-2 px-3 sm:px-4 pb-3 border-b border-[var(--cuerate-text-3)]">
          <button
            onClick={() => setContentType('all')}
            className={`flex-1 flex items-center justify-center gap-2 py-2 sm:py-2.5 rounded-[var(--cuerate-r-pill)] font-accent text-xs sm:text-sm font-medium transition-all ${
              contentType === 'all'
                ? 'bg-[var(--cuerate-blue)] text-white blue-glow'
                : 'glass-surface text-[var(--cuerate-text-2)]'
            }`}
          >
            All
          </button>
          <button
            onClick={() => setContentType('video')}
            className={`flex-1 flex items-center justify-center gap-1.5 sm:gap-2 py-2 sm:py-2.5 rounded-[var(--cuerate-r-pill)] font-accent text-xs sm:text-sm font-medium transition-all ${
              contentType === 'video'
                ? 'bg-[var(--cuerate-blue)] text-white blue-glow'
                : 'glass-surface text-[var(--cuerate-text-2)]'
            }`}
          >
            <Video className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
            <span className="hidden xs:inline">Videos</span>
          </button>
          <button
            onClick={() => setContentType('image')}
            className={`flex-1 flex items-center justify-center gap-1.5 sm:gap-2 py-2 sm:py-2.5 rounded-[var(--cuerate-r-pill)] font-accent text-xs sm:text-sm font-medium transition-all ${
              contentType === 'image'
                ? 'bg-[var(--cuerate-blue)] text-white blue-glow'
                : 'glass-surface text-[var(--cuerate-text-2)]'
            }`}
          >
            <Image className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
            <span className="hidden xs:inline">Images</span>
          </button>
        </div>
      </div>

      <div className="hidden md:block sticky top-0 z-40 glass-nav border-b border-[var(--cuerate-text-3)]">
        <div className="px-8 py-3">
          <div className="flex items-center justify-between gap-4">
            <div className="relative">
              <button
                onClick={() => setShowFilters(!showFilters)}
                className="flex items-center gap-2 px-5 py-2 rounded-[var(--cuerate-r-pill)] glass-surface text-[var(--cuerate-text-1)] hover:text-white transition-all"
              >
                <Filter className="w-4 h-4" />
                <span className="font-accent text-sm font-medium">{activeFilter}</span>
                <ChevronDown className={`w-4 h-4 transition-transform ${showFilters ? 'rotate-180' : ''}`} />
              </button>

              {showFilters && (
                <div className="absolute top-full left-0 mt-2 w-48 bg-[var(--cuerate-bg)] rounded-[var(--cuerate-r-lg)] border border-[var(--cuerate-text-3)] shadow-xl z-50">
                  {filters.map((filter) => (
                    <button
                      key={filter}
                      onClick={() => {
                        setActiveFilter(filter);
                        setShowFilters(false);
                      }}
                      className={`w-full text-left px-4 py-2.5 font-accent text-sm transition-all first:rounded-t-[var(--cuerate-r-lg)] last:rounded-b-[var(--cuerate-r-lg)] ${
                        activeFilter === filter
                          ? 'bg-[var(--cuerate-indigo)] text-white'
                          : 'text-[var(--cuerate-text-2)] hover:text-white hover:bg-[var(--cuerate-surface)]'
                      }`}
                    >
                      {filter}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="flex gap-2">
              <button
                onClick={() => setContentType('all')}
                className={`px-5 py-2 rounded-[var(--cuerate-r-pill)] font-accent text-sm font-medium transition-all ${
                  contentType === 'all'
                    ? 'bg-[var(--cuerate-blue)] text-white blue-glow'
                    : 'glass-surface text-[var(--cuerate-text-2)] hover:text-[var(--cuerate-text-1)]'
                }`}
              >
                All
              </button>
              <button
                onClick={() => setContentType('video')}
                className={`group relative p-2 rounded-[var(--cuerate-r-pill)] font-accent text-sm font-medium transition-all ${
                  contentType === 'video'
                    ? 'bg-[var(--cuerate-blue)] text-white blue-glow'
                    : 'glass-surface text-[var(--cuerate-text-2)] hover:text-[var(--cuerate-text-1)]'
                }`}
              >
                <Video className="w-4 h-4" />
                <span className="absolute left-1/2 -translate-x-1/2 -bottom-8 px-2 py-1 rounded-md bg-[var(--cuerate-bg)] border border-[var(--cuerate-text-3)] text-xs whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                  Videos
                </span>
              </button>
              <button
                onClick={() => setContentType('image')}
                className={`group relative p-2 rounded-[var(--cuerate-r-pill)] font-accent text-sm font-medium transition-all ${
                  contentType === 'image'
                    ? 'bg-[var(--cuerate-blue)] text-white blue-glow'
                    : 'glass-surface text-[var(--cuerate-text-2)] hover:text-[var(--cuerate-text-1)]'
                }`}
              >
                <Image className="w-4 h-4" />
                <span className="absolute left-1/2 -translate-x-1/2 -bottom-8 px-2 py-1 rounded-md bg-[var(--cuerate-bg)] border border-[var(--cuerate-text-3)] text-xs whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                  Images
                </span>
              </button>
            </div>

            <button
              onClick={() => navigate(user ? '/profile' : '/auth')}
              className="px-6 py-2 rounded-[var(--cuerate-r-pill)] bg-[var(--cuerate-indigo)] text-white font-accent text-sm font-medium indigo-glow hover:opacity-90 transition-all"
            >
              {user ? `@${user.handle}` : 'Login'}
            </button>
          </div>
        </div>
      </div>

      <div className="px-3 sm:px-4 md:px-8 py-3 sm:py-4 md:py-6">
        <div className="prompt-grid">
          {filteredPrompts.map((prompt) => (
            <PromptCard
              key={prompt.id}
              prompt={prompt}
              onFollow={handleFollow}
              isFollowing={followedUsers.has(prompt.authorHandle)}
              onLike={handleLike}
              isLiked={likedPrompts.has(prompt.id)}
              onSave={handleSave}
              isSaved={savedPrompts.has(prompt.id)}
              onFork={handleFork}
              isForked={false}
              onCopy={handleCopy}
              isCopied={copiedPrompts.has(prompt.id)}
            />
          ))}
        </div>
      </div>

      {forkModalPrompt && (
        <ForkPromptModal
          prompt={forkModalPrompt}
          onClose={() => setForkModalPrompt(null)}
          onSave={(forkedPrompt) => {
            if (!activeUser) {
              return;
            }

            void promptsApi.forkPrompt({
              sourcePromptId: forkModalPrompt.id,
              authorUid: activeUser.uid,
              promptText: forkedPrompt.promptText ?? forkModalPrompt.promptText,
              model: forkedPrompt.model ?? forkModalPrompt.model,
              styleTags: forkedPrompt.styleTags ?? forkModalPrompt.styleTags,
              moodLabel: forkedPrompt.moodLabel ?? forkModalPrompt.moodLabel,
            });
          }}
        />
      )}
    </div>
  );
}
