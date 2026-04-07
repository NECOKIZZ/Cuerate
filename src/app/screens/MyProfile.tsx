import { useState } from 'react';
import { Twitter, Instagram, Youtube, Globe, LogOut } from 'lucide-react';
import { Link } from 'react-router';
import { authApi, promptsApi } from '../../lib/backend';
import { useBackendQuery } from '../../lib/useBackendQuery';
import { useAuth } from '../../lib/auth-context';

export function MyProfile() {
  const [activeTab, setActiveTab] = useState<'prompts' | 'forks' | 'liked'>('prompts');
  const { signOut } = useAuth();
  const { data: currentUser } = useBackendQuery(() => authApi.getCurrentUser(), null, []);
  const { data: prompts } = useBackendQuery(() => promptsApi.getFeedPrompts(), [], []);

  if (!currentUser) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4">
        <div className="max-w-md w-full glass-surface rounded-[var(--cuerate-r-xl)] border border-[var(--cuerate-text-3)] p-8 text-center">
          <h1 className="font-primary font-bold text-2xl text-[var(--cuerate-text-1)] mb-3">You are not logged in</h1>
          <p className="font-accent text-sm text-[var(--cuerate-text-2)] mb-6">
            Sign in to view your profile, saved prompts, and publishing stats.
          </p>
          <Link
            to="/auth"
            className="inline-flex items-center justify-center w-full rounded-[var(--cuerate-r-pill)] bg-[var(--cuerate-indigo)] px-4 py-3 font-accent text-sm font-medium text-white indigo-glow"
          >
            Log In / Sign Up
          </Link>
        </div>
      </div>
    );
  }

  const userPrompts = prompts.filter((prompt) => prompt.authorUid === currentUser.uid);
  const userForks = prompts.filter((prompt) => prompt.isForked && prompt.authorUid === currentUser.uid);
  const likedPrompts = prompts.slice(0, 3);

  const getTabContent = () => {
    switch (activeTab) {
      case 'prompts':
        return userPrompts.length > 0 ? userPrompts : prompts.slice(0, 3);
      case 'forks':
        return userForks.length > 0 ? userForks : [];
      case 'liked':
        return likedPrompts;
      default:
        return [];
    }
  };

  const tabContent = getTabContent();

  return (
    <div className="min-h-screen pb-8">
      <div className="sticky top-0 z-40 glass-nav border-b border-[var(--cuerate-text-3)]">
        <div className="px-4 md:px-8 py-4 md:py-6">
          <h1 className="font-primary font-semibold text-lg md:text-2xl text-[var(--cuerate-text-1)]">
            Profile
          </h1>
        </div>
      </div>

      <div className="px-4 md:px-8 py-6 max-w-4xl md:mx-auto">
        <div className="space-y-6">
          <div className="flex flex-col items-center text-center">
            <div className="relative mb-4">
              <img
                src={currentUser.avatarUrl}
                alt={currentUser.handle}
                className="w-32 h-32 rounded-full border-4 border-[var(--cuerate-indigo)] indigo-glow"
              />
            </div>
            <h2 className="font-primary font-bold text-xl text-[var(--cuerate-text-1)] mb-1">
              {currentUser.displayName}
            </h2>
            <p className="font-accent text-sm text-[var(--cuerate-text-2)] mb-3">
              @{currentUser.handle}
            </p>
            <p className="font-accent text-sm text-[var(--cuerate-text-1)] mb-3 max-w-xs">
              {currentUser.bio}
            </p>

            {(currentUser.links.x || currentUser.links.instagram || currentUser.links.youtube || currentUser.links.website) && (
              <div className="flex gap-3 mb-3">
                {currentUser.links.x && (
                  <button className="p-2 rounded-[var(--cuerate-r-pill)] glass-surface hover:bg-[var(--cuerate-indigo)]/10 transition-colors">
                    <Twitter className="w-4 h-4 text-[var(--cuerate-text-1)]" />
                  </button>
                )}
                {currentUser.links.instagram && (
                  <button className="p-2 rounded-[var(--cuerate-r-pill)] glass-surface hover:bg-[var(--cuerate-indigo)]/10 transition-colors">
                    <Instagram className="w-4 h-4 text-[var(--cuerate-text-1)]" />
                  </button>
                )}
                {currentUser.links.youtube && (
                  <button className="p-2 rounded-[var(--cuerate-r-pill)] glass-surface hover:bg-[var(--cuerate-indigo)]/10 transition-colors">
                    <Youtube className="w-4 h-4 text-[var(--cuerate-text-1)]" />
                  </button>
                )}
                {currentUser.links.website && (
                  <button className="p-2 rounded-[var(--cuerate-r-pill)] glass-surface hover:bg-[var(--cuerate-indigo)]/10 transition-colors">
                    <Globe className="w-4 h-4 text-[var(--cuerate-text-1)]" />
                  </button>
                )}
              </div>
            )}
          </div>

          <div className="grid grid-cols-4 gap-3 p-4 rounded-[var(--cuerate-r-pill)] glass-surface">
            <div className="text-center">
              <p className="font-primary font-bold text-lg text-[var(--cuerate-text-1)]">
                {currentUser.totalPrompts}
              </p>
              <p className="font-accent text-xs text-[var(--cuerate-text-2)]">Prompts</p>
            </div>
            <div className="text-center">
              <p className="font-primary font-bold text-lg text-[var(--cuerate-text-1)]">
                {currentUser.followers.toLocaleString()}
              </p>
              <p className="font-accent text-xs text-[var(--cuerate-text-2)]">Followers</p>
            </div>
            <div className="text-center">
              <p className="font-primary font-bold text-lg text-[var(--cuerate-text-1)]">
                {currentUser.following}
              </p>
              <p className="font-accent text-xs text-[var(--cuerate-text-2)]">Following</p>
            </div>
            <div className="text-center">
              <p className="font-primary font-bold text-lg text-[var(--cuerate-text-1)]">
                {currentUser.totalCopies}
              </p>
              <p className="font-accent text-xs text-[var(--cuerate-text-2)]">Copies</p>
            </div>
          </div>

          <button className="w-full py-3 rounded-[var(--cuerate-r-pill)] glass-surface border border-[var(--cuerate-indigo)] font-accent font-medium text-[var(--cuerate-indigo)] hover:bg-[var(--cuerate-indigo)]/10 transition-colors">
            Edit Profile
          </button>

          <button
            onClick={() => void signOut()}
            className="w-full inline-flex items-center justify-center gap-2 py-3 rounded-[var(--cuerate-r-pill)] bg-[var(--cuerate-indigo)]/10 border border-[var(--cuerate-indigo)]/40 font-accent font-medium text-[var(--cuerate-indigo)] hover:bg-[var(--cuerate-indigo)]/20 transition-colors"
          >
            <LogOut className="h-4 w-4" />
            Log Out
          </button>

          <div className="border-b border-[var(--cuerate-text-3)]">
            <div className="flex gap-8">
              {(['prompts', 'forks', 'liked'] as const).map((tab) => (
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

          <div className="grid grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2">
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
              <div className="col-span-3 md:col-span-4 lg:col-span-5 py-12 text-center">
                <p className="font-accent text-sm text-[var(--cuerate-text-2)]">
                  No {activeTab} yet
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
