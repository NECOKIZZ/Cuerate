import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router';
import { ArrowLeft, Twitter, Instagram, Youtube, Globe } from 'lucide-react';
import { authApi, followsApi, promptsApi, usersApi } from '../../lib/backend';
import { useAuth } from '../../lib/auth-context';
import { useBackendQuery } from '../../lib/useBackendQuery';
import { truncateText } from '../../lib/text';

function buildExternalUrl(rawUrl?: string) {
  const value = rawUrl?.trim();
  if (!value) {
    return '#';
  }

  if (/^https?:\/\//i.test(value)) {
    return value;
  }

  return `https://${value}`;
}

export function UserProfile() {
  const { handle } = useParams<{ handle: string }>();
  const navigate = useNavigate();
  const { user: authUser } = useAuth();
  const [activeTab, setActiveTab] = useState<'prompts' | 'forks'>('prompts');
  const [isFollowing, setIsFollowing] = useState(false);
  const [followerCount, setFollowerCount] = useState(0);
  const { data: currentUser } = useBackendQuery(() => authApi.getCurrentUser(), null, []);
  const activeUser = authUser ?? currentUser;
  const { data: users } = useBackendQuery(() => usersApi.getAllUsers(), [], []);
  const { data: prompts } = useBackendQuery(() => promptsApi.getFeedPrompts(), [], []);

  const profileUser = users.find((entry) => entry.handle === handle);

  const { data: fetchedFollowerCount } = useBackendQuery(
    () => (profileUser ? followsApi.getFollowerCount(profileUser.uid) : Promise.resolve(0)),
    0,
    [profileUser?.uid],
  );
  const { data: fetchedIsFollowing } = useBackendQuery(
    () =>
      profileUser && activeUser
        ? followsApi.isFollowing(activeUser.uid, profileUser.uid)
        : Promise.resolve(false),
    false,
    [activeUser?.uid, profileUser?.uid],
  );

  useEffect(() => {
    setFollowerCount(fetchedFollowerCount);
  }, [fetchedFollowerCount]);

  useEffect(() => {
    setIsFollowing(fetchedIsFollowing);
  }, [fetchedIsFollowing]);

  if (!profileUser) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="font-accent text-[var(--cuerate-text-2)]">User not found</p>
      </div>
    );
  }

  const userPrompts = prompts.filter((prompt) => prompt.authorUid === profileUser.uid);
  const userForks = prompts.filter((prompt) => prompt.isForked && prompt.authorUid === profileUser.uid);
  const displayName = truncateText(profileUser.displayName, 28);
  const displayHandle = truncateText(profileUser.handle, 20);

  const tabContent = activeTab === 'prompts' ? userPrompts : userForks;

  const handleToggleFollow = () => {
    if (!activeUser) {
      navigate('/auth');
      return;
    }

    const wasFollowing = isFollowing;
    setIsFollowing(!wasFollowing);
    setFollowerCount((count) => Math.max(0, count + (wasFollowing ? -1 : 1)));

    void followsApi
      .toggleFollow(activeUser.uid, profileUser.uid)
      .then((result) => {
        setIsFollowing(result.following);
        return followsApi.getFollowerCount(profileUser.uid);
      })
      .then((count) => {
        setFollowerCount(count);
      })
      .catch((error) => {
        setIsFollowing(wasFollowing);
        setFollowerCount((count) => Math.max(0, count + (wasFollowing ? 1 : -1)));
        window.alert(error instanceof Error ? error.message : 'Could not update follow status.');
      });
  };

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
          <h1 className="max-w-[220px] truncate font-primary font-semibold text-lg text-[var(--cuerate-text-1)]" title={`@${profileUser.handle}`}>
            @{displayHandle}
          </h1>
        </div>
      </div>

      <div className="px-4 py-6 space-y-3">
        <div className="flex flex-col items-center text-center">
          <div className="relative mb-3">
            <img
              src={profileUser.avatarUrl}
              alt={profileUser.handle}
              className="w-32 h-32 rounded-full border-4 border-[var(--cuerate-indigo)] indigo-glow"
            />
          </div>
          <h2 className="max-w-[280px] truncate font-primary font-bold text-xl text-[var(--cuerate-text-1)] mb-0.5" title={profileUser.displayName}>
            {displayName}
          </h2>
          <p className="max-w-[280px] truncate font-accent text-sm text-[var(--cuerate-text-2)] mb-2" title={`@${profileUser.handle}`}>
            @{displayHandle}
          </p>
          <p className="font-accent text-sm text-[var(--cuerate-text-1)] mb-2 max-w-xs">
            {profileUser.bio}
          </p>

          {(profileUser.links.x || profileUser.links.instagram || profileUser.links.youtube || profileUser.links.website) && (
            <div className="flex gap-3 mb-2">
              {profileUser.links.x && (
                <a
                  href={buildExternalUrl(profileUser.links.x)}
                  target="_blank"
                  rel="noreferrer"
                  className="p-2 rounded-[var(--cuerate-r-pill)] glass-surface hover:bg-[var(--cuerate-indigo)]/10 transition-colors"
                  aria-label="Open X profile"
                >
                  <Twitter className="w-4 h-4 text-[var(--cuerate-text-1)]" />
                </a>
              )}
              {profileUser.links.instagram && (
                <a
                  href={buildExternalUrl(profileUser.links.instagram)}
                  target="_blank"
                  rel="noreferrer"
                  className="p-2 rounded-[var(--cuerate-r-pill)] glass-surface hover:bg-[var(--cuerate-indigo)]/10 transition-colors"
                  aria-label="Open Instagram profile"
                >
                  <Instagram className="w-4 h-4 text-[var(--cuerate-text-1)]" />
                </a>
              )}
              {profileUser.links.youtube && (
                <a
                  href={buildExternalUrl(profileUser.links.youtube)}
                  target="_blank"
                  rel="noreferrer"
                  className="p-2 rounded-[var(--cuerate-r-pill)] glass-surface hover:bg-[var(--cuerate-indigo)]/10 transition-colors"
                  aria-label="Open YouTube profile"
                >
                  <Youtube className="w-4 h-4 text-[var(--cuerate-text-1)]" />
                </a>
              )}
              {profileUser.links.website && (
                <a
                  href={buildExternalUrl(profileUser.links.website)}
                  target="_blank"
                  rel="noreferrer"
                  className="p-2 rounded-[var(--cuerate-r-pill)] glass-surface hover:bg-[var(--cuerate-indigo)]/10 transition-colors"
                  aria-label="Open website"
                >
                  <Globe className="w-4 h-4 text-[var(--cuerate-text-1)]" />
                </a>
              )}
            </div>
          )}
        </div>

        {activeUser?.uid !== profileUser.uid && (
          <div className="flex justify-center">
            <button
              onClick={handleToggleFollow}
              className={`px-12 py-2.5 rounded-[var(--cuerate-r-pill)] font-accent font-medium transition-all ${
                isFollowing
                  ? 'glass-surface border border-[var(--cuerate-indigo)] text-[var(--cuerate-indigo)] hover:bg-[var(--cuerate-indigo)]/10'
                  : 'bg-[var(--cuerate-indigo)] text-white indigo-glow hover:opacity-90'
              }`}
            >
              {isFollowing ? 'Following' : 'Follow'}
            </button>
          </div>
        )}

        <div className="grid grid-cols-3 gap-3 p-4 rounded-[var(--cuerate-r-pill)] glass-surface">
          <div className="text-center">
            <p className="font-primary font-bold text-lg text-[var(--cuerate-text-1)]">
              {userPrompts.length}
            </p>
            <p className="font-accent text-xs text-[var(--cuerate-text-2)]">Prompts</p>
          </div>
          <div className="text-center">
            <p className="font-primary font-bold text-lg text-[var(--cuerate-text-1)]">
              {followerCount.toLocaleString()}
            </p>
            <p className="font-accent text-xs text-[var(--cuerate-text-2)]">Followers</p>
          </div>
          <div className="text-center">
            <p className="font-primary font-bold text-lg text-[var(--cuerate-text-1)]">
              {profileUser.totalCopies}
            </p>
            <p className="font-accent text-xs text-[var(--cuerate-text-2)]">Copies</p>
          </div>
        </div>

        <div className="border-b border-[var(--cuerate-text-3)]">
          <div className="flex w-full items-center justify-around">
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
