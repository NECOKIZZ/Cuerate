import { useState } from 'react';
import { useParams, useNavigate } from 'react-router';
import { ArrowLeft, Twitter, Instagram, Youtube, Globe } from 'lucide-react';
import { promptsApi, usersApi } from '../../lib/backend';
import { useBackendQuery } from '../../lib/useBackendQuery';

export function UserProfile() {
  const { handle } = useParams<{ handle: string }>();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<'prompts' | 'forks' | 'liked'>('prompts');
  const [isFollowing, setIsFollowing] = useState(false);
  const { data: users } = useBackendQuery(() => usersApi.getAllUsers(), [], []);
  const { data: prompts } = useBackendQuery(() => promptsApi.getFeedPrompts(), [], []);

  const user = users.find((entry) => entry.handle === handle);

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="font-accent text-[var(--cuerate-text-2)]">User not found</p>
      </div>
    );
  }

  const userPrompts = prompts.filter((prompt) => prompt.authorUid === user.uid);
  const userForks = prompts.filter((prompt) => prompt.isForked && prompt.authorUid === user.uid);

  const getTabContent = () => {
    switch (activeTab) {
      case 'prompts':
        return userPrompts;
      case 'forks':
        return userForks;
      case 'liked':
        return [];
      default:
        return [];
    }
  };

  const tabContent = getTabContent();

  return (
    <div className="min-h-screen pb-8">
      <div className="sticky top-0 z-40 glass-nav border-b border-[var(--cuerate-text-3)]">
        <div className="flex items-center gap-3 px-4 py-4">
          <button
            onClick={() => navigate(-1)}
            className="p-2 rounded-full hover:bg-[var(--cuerate-surface)] transition-colors"
          >
            <ArrowLeft className="w-5 h-5 text-[var(--cuerate-text-1)]" />
          </button>
          <h1 className="font-primary font-semibold text-lg text-[var(--cuerate-text-1)]">
            @{user.handle}
          </h1>
        </div>
      </div>

      <div className="px-4 py-6 space-y-3">
        <div className="flex flex-col items-center text-center">
          <div className="relative mb-3">
            <img
              src={user.avatarUrl}
              alt={user.handle}
              className="w-32 h-32 rounded-full border-4 border-[var(--cuerate-indigo)] indigo-glow"
            />
          </div>
          <h2 className="font-primary font-bold text-xl text-[var(--cuerate-text-1)] mb-0.5">
            {user.displayName}
          </h2>
          <p className="font-accent text-sm text-[var(--cuerate-text-2)] mb-2">
            @{user.handle}
          </p>
          <p className="font-accent text-sm text-[var(--cuerate-text-1)] mb-2 max-w-xs">
            {user.bio}
          </p>

          {(user.links.x || user.links.instagram || user.links.youtube || user.links.website) && (
            <div className="flex gap-3 mb-2">
              {user.links.x && (
                <button className="p-2 rounded-[var(--cuerate-r-pill)] glass-surface hover:bg-[var(--cuerate-indigo)]/10 transition-colors">
                  <Twitter className="w-4 h-4 text-[var(--cuerate-text-1)]" />
                </button>
              )}
              {user.links.instagram && (
                <button className="p-2 rounded-[var(--cuerate-r-pill)] glass-surface hover:bg-[var(--cuerate-indigo)]/10 transition-colors">
                  <Instagram className="w-4 h-4 text-[var(--cuerate-text-1)]" />
                </button>
              )}
              {user.links.youtube && (
                <button className="p-2 rounded-[var(--cuerate-r-pill)] glass-surface hover:bg-[var(--cuerate-indigo)]/10 transition-colors">
                  <Youtube className="w-4 h-4 text-[var(--cuerate-text-1)]" />
                </button>
              )}
              {user.links.website && (
                <button className="p-2 rounded-[var(--cuerate-r-pill)] glass-surface hover:bg-[var(--cuerate-indigo)]/10 transition-colors">
                  <Globe className="w-4 h-4 text-[var(--cuerate-text-1)]" />
                </button>
              )}
            </div>
          )}
        </div>

        <div className="flex justify-center">
          <button
            onClick={() => setIsFollowing(!isFollowing)}
            className={`px-12 py-2.5 rounded-[var(--cuerate-r-pill)] font-accent font-medium transition-all ${
              isFollowing
                ? 'glass-surface border border-[var(--cuerate-indigo)] text-[var(--cuerate-indigo)] hover:bg-[var(--cuerate-indigo)]/10'
                : 'bg-[var(--cuerate-indigo)] text-white indigo-glow hover:opacity-90'
            }`}
          >
            {isFollowing ? 'Following' : 'Follow'}
          </button>
        </div>

        <div className="grid grid-cols-4 gap-3 p-4 rounded-[var(--cuerate-r-pill)] glass-surface">
          <div className="text-center">
            <p className="font-primary font-bold text-lg text-[var(--cuerate-text-1)]">
              {user.totalPrompts}
            </p>
            <p className="font-accent text-xs text-[var(--cuerate-text-2)]">Prompts</p>
          </div>
          <div className="text-center">
            <p className="font-primary font-bold text-lg text-[var(--cuerate-text-1)]">
              {user.followers.toLocaleString()}
            </p>
            <p className="font-accent text-xs text-[var(--cuerate-text-2)]">Followers</p>
          </div>
          <div className="text-center">
            <p className="font-primary font-bold text-lg text-[var(--cuerate-text-1)]">
              {user.following}
            </p>
            <p className="font-accent text-xs text-[var(--cuerate-text-2)]">Following</p>
          </div>
          <div className="text-center">
            <p className="font-primary font-bold text-lg text-[var(--cuerate-text-1)]">
              {user.totalCopies}
            </p>
            <p className="font-accent text-xs text-[var(--cuerate-text-2)]">Copies</p>
          </div>
        </div>

        <p className="font-accent text-xs text-[var(--cuerate-indigo)]/70 text-center">
          Followed by @creator1 and 3 others you follow
        </p>

        <div className="border-b border-[var(--cuerate-text-3)]">
          <div className="flex gap-8">
            {(['prompts', 'forks'] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`pb-3 font-accent text-sm capitalize relative ${
                  activeTab === tab
                    ? 'text-[var(--cuerate-indigo)]'
                    : 'text-[var(--cuerate-text-2)]'
                }`}
              >
                {tab}
                {activeTab === tab && (
                  <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-[var(--cuerate-indigo)] indigo-glow" />
                )}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-3 gap-2">
          {tabContent.length > 0 ? (
            tabContent.map((prompt) => (
              <div
                key={prompt.id}
                className="relative aspect-square rounded-[var(--cuerate-r-md)] overflow-hidden cursor-pointer hover:opacity-80 transition-opacity"
              >
                <img
                  src={prompt.thumbnailUrl}
                  alt=""
                  className="w-full h-full object-cover"
                />
                <div className="absolute bottom-1 left-1 px-2 py-0.5 rounded-[var(--cuerate-r-pill)] glass-surface">
                  <span className="font-accent text-[10px] text-[var(--cuerate-text-1)]">
                    {prompt.copies}
                  </span>
                </div>
              </div>
            ))
          ) : (
            <div className="col-span-3 py-12 text-center">
              <p className="font-accent text-sm text-[var(--cuerate-text-2)]">
                No {activeTab} yet
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
