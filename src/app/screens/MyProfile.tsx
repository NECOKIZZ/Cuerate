import { ChangeEvent, useEffect, useState } from 'react';
import { Camera, Globe, Instagram, Loader2, LogOut, Trash2, Twitter, X, Youtube } from 'lucide-react';
import { Link, useNavigate } from 'react-router';
import { authApi, followsApi, promptsApi, uploadsApi, workflowsApi } from '../../lib/backend';
import { useBackendQuery } from '../../lib/useBackendQuery';
import { useAuth } from '../../lib/auth-context';
import { truncateText } from '../../lib/text';
import { Prompt, User, Workflow } from '../../lib/types';

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

export function MyProfile() {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<'prompts' | 'forks' | 'saves' | 'workflows'>('prompts');
  const [deletingPromptId, setDeletingPromptId] = useState<string | null>(null);
  const [promptPendingDelete, setPromptPendingDelete] = useState<Prompt | null>(null);
  const [removedPromptIds, setRemovedPromptIds] = useState<Set<string>>(new Set());
  const [deletingWorkflowId, setDeletingWorkflowId] = useState<string | null>(null);
  const [workflowPendingDelete, setWorkflowPendingDelete] = useState<Workflow | null>(null);
  const [removedWorkflowIds, setRemovedWorkflowIds] = useState<Set<string>>(new Set());
  const [profile, setProfile] = useState<User | null>(null);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarPreviewUrl, setAvatarPreviewUrl] = useState<string | null>(null);
  const [draftHandle, setDraftHandle] = useState('');
  const [draftBio, setDraftBio] = useState('');
  const [draftX, setDraftX] = useState('');
  const [draftInstagram, setDraftInstagram] = useState('');
  const [draftYoutube, setDraftYoutube] = useState('');
  const [draftWebsite, setDraftWebsite] = useState('');
  const { user: authUser, isLoading: authIsLoading, signOut } = useAuth();
  const { data: prompts } = useBackendQuery(() => promptsApi.getFeedPrompts(), [], []);
  const { data: workflows } = useBackendQuery(() => workflowsApi.getFeedWorkflows(), [], []);
  const { data: savedPromptIds } = useBackendQuery(
    () => (profile?.uid ? promptsApi.getSavedPromptIds(profile.uid) : Promise.resolve([])),
    [],
    [profile?.uid],
  );
  const { data: followerCount } = useBackendQuery(
    () => (profile?.uid ? followsApi.getFollowerCount(profile.uid) : Promise.resolve(0)),
    0,
    [profile?.uid],
  );
  const { data: followingCount } = useBackendQuery(
    () => (profile?.uid ? followsApi.getFollowingCount(profile.uid) : Promise.resolve(0)),
    0,
    [profile?.uid],
  );

  useEffect(() => {
    setProfile(authUser);
  }, [authUser]);

  useEffect(() => {
    return () => {
      if (avatarPreviewUrl) {
        URL.revokeObjectURL(avatarPreviewUrl);
      }
    };
  }, [avatarPreviewUrl]);

  if (authIsLoading && !profile) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4">
        <div className="max-w-md w-full glass-surface rounded-[var(--cuerate-r-xl)] border border-[var(--cuerate-text-3)] p-8 text-center">
          <span className="inline-flex items-center gap-2 font-accent text-sm text-[var(--cuerate-text-2)]">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading your profile...
          </span>
        </div>
      </div>
    );
  }

  if (!profile) {
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

  const visiblePrompts = prompts.filter((prompt) => !removedPromptIds.has(prompt.id));
  const userPrompts = visiblePrompts.filter((prompt) => prompt.authorUid === profile.uid);
  const userForks = userPrompts.filter((prompt) => prompt.isForked);
  const savedPrompts = visiblePrompts.filter((prompt) => savedPromptIds.includes(prompt.id));
  const visibleWorkflows = workflows.filter((workflow) => !removedWorkflowIds.has(workflow.id));
  const userWorkflows = visibleWorkflows.filter((workflow) => workflow.authorUid === profile.uid);
  const displayHandle = truncateText(profile.handle, 20);

  const promptTabContent: Prompt[] = (() => {
    switch (activeTab) {
      case 'prompts':
        return userPrompts;
      case 'forks':
        return userForks;
      case 'saves':
        return savedPrompts;
      default:
        return [];
    }
  })();

  const openEditModal = () => {
    setDraftHandle(profile.handle);
    setDraftBio(profile.bio);
    setDraftX(profile.links.x ?? '');
    setDraftInstagram(profile.links.instagram ?? '');
    setDraftYoutube(profile.links.youtube ?? '');
    setDraftWebsite(profile.links.website ?? '');
    setAvatarFile(null);
    if (avatarPreviewUrl) {
      URL.revokeObjectURL(avatarPreviewUrl);
    }
    setAvatarPreviewUrl(null);
    setProfileError(null);
    setIsEditModalOpen(true);
  };

  const handleAvatarChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    if (!file.type.startsWith('image/')) {
      setProfileError('Please choose an image file for your profile picture.');
      return;
    }

    if (avatarPreviewUrl) {
      URL.revokeObjectURL(avatarPreviewUrl);
    }

    const previewUrl = URL.createObjectURL(file);
    setAvatarFile(file);
    setAvatarPreviewUrl(previewUrl);
    setProfileError(null);
  };

  const handleSaveProfile = async () => {
    setIsSavingProfile(true);
    setProfileError(null);
    const previousAvatarUrl = profile.avatarUrl;

    try {
      let nextAvatarUrl = profile.avatarUrl;
      if (avatarFile) {
        const uploadedAvatar = await uploadsApi.uploadProfileAvatar(avatarFile, profile.uid);
        nextAvatarUrl = uploadedAvatar.downloadUrl;
      }

      const updatedProfile = await authApi.updateProfile({
        uid: profile.uid,
        handle: draftHandle,
        bio: draftBio,
        avatarUrl: nextAvatarUrl,
        links: {
          x: draftX.trim() || undefined,
          instagram: draftInstagram.trim() || undefined,
          youtube: draftYoutube.trim() || undefined,
          website: draftWebsite.trim() || undefined,
        },
      });

      setProfile(updatedProfile);
      setIsEditModalOpen(false);

      if (avatarPreviewUrl) {
        URL.revokeObjectURL(avatarPreviewUrl);
      }
      setAvatarPreviewUrl(null);
      setAvatarFile(null);

      if (avatarFile && previousAvatarUrl && previousAvatarUrl !== nextAvatarUrl) {
        void uploadsApi.deletePublicMediaUrls([previousAvatarUrl]).catch((error) => {
          console.error('Could not delete old profile avatar:', error);
        });
      }
    } catch (error) {
      setProfileError(error instanceof Error ? error.message : 'Could not save your profile.');
    } finally {
      setIsSavingProfile(false);
    }
  };

  const handleDeletePrompt = async (promptId: string) => {
    setDeletingPromptId(promptId);

    try {
      await promptsApi.deletePrompt(promptId, profile.uid);
      setRemovedPromptIds((prev) => {
        const next = new Set(prev);
        next.add(promptId);
        return next;
      });
      setPromptPendingDelete(null);
    } catch (error) {
      window.alert(error instanceof Error ? error.message : 'Could not delete this post.');
    } finally {
      setDeletingPromptId(null);
    }
  };

  const handleDeleteWorkflow = async (workflowId: string) => {
    setDeletingWorkflowId(workflowId);

    try {
      await workflowsApi.deleteWorkflow(workflowId, profile.uid);
      setRemovedWorkflowIds((prev) => {
        const next = new Set(prev);
        next.add(workflowId);
        return next;
      });
      setWorkflowPendingDelete(null);
    } catch (error) {
      window.alert(error instanceof Error ? error.message : 'Could not delete this workflow.');
    } finally {
      setDeletingWorkflowId(null);
    }
  };

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
                src={avatarPreviewUrl ?? profile.avatarUrl}
                alt={profile.handle}
                className="w-32 h-32 rounded-full border-4 border-[var(--cuerate-indigo)] indigo-glow object-cover object-center"
              />
            </div>
            <h2 className="max-w-[280px] truncate font-primary font-bold text-xl text-[var(--cuerate-text-1)] mb-1" title={`@${profile.handle}`}>
              @{displayHandle}
            </h2>
            <p className="font-accent text-sm text-[var(--cuerate-text-1)] mb-3 max-w-xs">
              {profile.bio || 'No profile bio yet.'}
            </p>

            {(profile.links.x || profile.links.instagram || profile.links.youtube || profile.links.website) && (
              <div className="flex gap-3 mb-3">
                {profile.links.x && (
                  <a
                    href={buildExternalUrl(profile.links.x)}
                    target="_blank"
                    rel="noreferrer"
                    className="p-2 rounded-[var(--cuerate-r-pill)] glass-surface hover:bg-[var(--cuerate-indigo)]/10 transition-colors"
                    aria-label="Open X profile"
                  >
                    <Twitter className="w-4 h-4 text-[var(--cuerate-text-1)]" />
                  </a>
                )}
                {profile.links.instagram && (
                  <a
                    href={buildExternalUrl(profile.links.instagram)}
                    target="_blank"
                    rel="noreferrer"
                    className="p-2 rounded-[var(--cuerate-r-pill)] glass-surface hover:bg-[var(--cuerate-indigo)]/10 transition-colors"
                    aria-label="Open Instagram profile"
                  >
                    <Instagram className="w-4 h-4 text-[var(--cuerate-text-1)]" />
                  </a>
                )}
                {profile.links.youtube && (
                  <a
                    href={buildExternalUrl(profile.links.youtube)}
                    target="_blank"
                    rel="noreferrer"
                    className="p-2 rounded-[var(--cuerate-r-pill)] glass-surface hover:bg-[var(--cuerate-indigo)]/10 transition-colors"
                    aria-label="Open YouTube profile"
                  >
                    <Youtube className="w-4 h-4 text-[var(--cuerate-text-1)]" />
                  </a>
                )}
                {profile.links.website && (
                  <a
                    href={buildExternalUrl(profile.links.website)}
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
                {followingCount}
              </p>
              <p className="font-accent text-xs text-[var(--cuerate-text-2)]">Following</p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={openEditModal}
              className="w-full py-3 rounded-[var(--cuerate-r-pill)] glass-surface border border-[var(--cuerate-indigo)] font-accent font-medium text-[var(--cuerate-indigo)] hover:bg-[var(--cuerate-indigo)]/10 hover:shadow-[0_0_22px_rgba(85,0,204,0.28)] hover:-translate-y-0.5 transition-all"
            >
              Edit Profile
            </button>

            <button
              onClick={() => void signOut()}
              className="w-full inline-flex items-center justify-center gap-2 py-3 rounded-[var(--cuerate-r-pill)] bg-[var(--cuerate-indigo)]/10 border border-[var(--cuerate-indigo)]/40 font-accent font-medium text-[var(--cuerate-indigo)] hover:bg-[var(--cuerate-indigo)]/20 transition-colors"
            >
              <LogOut className="h-4 w-4" />
              Log Out
            </button>
          </div>

          <div className="border-b border-[var(--cuerate-text-3)]">
            <div className="flex w-full items-center justify-around">
              {(['prompts', 'forks', 'saves', 'workflows'] as const).map((tab) => (
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

          {activeTab === 'workflows' ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {userWorkflows.length > 0 ? (
                userWorkflows.map((workflow: Workflow) => (
                  <div
                    key={workflow.id}
                    className="relative aspect-video rounded-[var(--cuerate-r-lg)] overflow-hidden cursor-pointer hover:opacity-85 transition-opacity"
                    role="button"
                    tabIndex={0}
                    onClick={() => navigate(`/workflow/${workflow.id}`)}
                    onKeyDown={(event) => {
                      if (event.key !== 'Enter' && event.key !== ' ') {
                        return;
                      }
                      event.preventDefault();
                      navigate(`/workflow/${workflow.id}`);
                    }}
                    aria-label={`Open workflow ${workflow.title}`}
                  >
                    <img
                      src={workflow.coverThumbnailUrl}
                      alt={workflow.title}
                      className="w-full h-full object-cover"
                    />
                    <button
                      onClick={(event) => {
                        event.stopPropagation();
                        setWorkflowPendingDelete(workflow);
                      }}
                      disabled={deletingWorkflowId === workflow.id}
                      className="absolute top-1 right-1 z-10 p-2 rounded-full bg-black/60 hover:bg-red-500/80 transition-colors disabled:opacity-60"
                      aria-label="Delete workflow"
                    >
                      <Trash2 className="h-4 w-4 text-white" />
                    </button>
                    <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-black/10" />
                    <div className="absolute top-2 left-2 px-2 py-1 rounded-[var(--cuerate-r-pill)] glass-surface font-accent text-[10px] text-[var(--cuerate-text-1)]">
                      {workflow.tool}
                    </div>
                    <div className="absolute bottom-2 left-2 right-2">
                      <p className="font-primary text-sm text-white truncate">{workflow.title}</p>
                    </div>
                  </div>
                ))
              ) : (
                <div className="col-span-1 md:col-span-2 py-12 text-center">
                  <p className="font-accent text-sm text-[var(--cuerate-text-2)]">
                    No workflows yet
                  </p>
                </div>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
              {promptTabContent.length > 0 ? (
                promptTabContent.map((prompt) => (
                  <div
                    key={prompt.id}
                    className="relative aspect-square rounded-[var(--cuerate-r-md)] overflow-hidden cursor-pointer hover:opacity-80 transition-opacity"
                    role="button"
                    tabIndex={0}
                    onClick={() => navigate(`/prompt/${prompt.id}`)}
                    onKeyDown={(event) => {
                      if (event.key !== 'Enter' && event.key !== ' ') {
                        return;
                      }
                      event.preventDefault();
                      navigate(`/prompt/${prompt.id}`);
                    }}
                    aria-label={`Open prompt by ${prompt.authorHandle}`}
                  >
                    <img
                      src={prompt.thumbnailUrl}
                      alt={`Prompt by ${prompt.authorHandle}`}
                      className="w-full h-full object-cover"
                    />
                    {(activeTab === 'prompts' || activeTab === 'forks') && prompt.authorUid === profile.uid && (
                      <button
                        onClick={(event) => {
                          event.stopPropagation();
                          setPromptPendingDelete(prompt);
                        }}
                        disabled={deletingPromptId === prompt.id}
                        className="absolute top-1 right-1 p-2 rounded-full bg-black/60 hover:bg-red-500/80 transition-colors disabled:opacity-60"
                        aria-label="Delete post"
                      >
                        <Trash2 className="h-4 w-4 text-white" />
                      </button>
                    )}
                  </div>
                ))
              ) : (
                <div className="col-span-2 md:col-span-3 lg:col-span-4 py-12 text-center">
                  <p className="font-accent text-sm text-[var(--cuerate-text-2)]">
                    No {activeTab} yet
                  </p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {isEditModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-4 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-[var(--cuerate-r-xl)] border border-[var(--cuerate-text-3)] bg-[var(--cuerate-bg)] p-5">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="font-primary text-xl font-semibold text-[var(--cuerate-text-1)]">Edit profile</h3>
              <button
                onClick={() => setIsEditModalOpen(false)}
                className="rounded-full p-2 hover:bg-[var(--cuerate-surface)]"
                aria-label="Close edit profile dialog"
              >
                <X className="h-4 w-4 text-[var(--cuerate-text-2)]" />
              </button>
            </div>

            <div className="space-y-4">
              <div className="flex items-center gap-4">
                <img
                  src={avatarPreviewUrl ?? profile.avatarUrl}
                  alt={profile.handle}
                  className="h-20 w-20 rounded-full border-2 border-[var(--cuerate-indigo)] object-cover"
                />
                <label className="inline-flex cursor-pointer items-center gap-2 rounded-[var(--cuerate-r-pill)] border border-[var(--cuerate-indigo)]/40 bg-[var(--cuerate-indigo)]/10 px-4 py-2 font-accent text-sm text-[var(--cuerate-indigo)] hover:bg-[var(--cuerate-indigo)]/20">
                  <Camera className="h-4 w-4" />
                  Upload photo
                  <input type="file" accept="image/*" className="hidden" onChange={handleAvatarChange} />
                </label>
              </div>

              <div>
                <label className="mb-2 block font-accent text-sm text-[var(--cuerate-text-2)]">Username</label>
                <input
                  value={draftHandle}
                  onChange={(event) => setDraftHandle(event.target.value)}
                  placeholder="username"
                  className="w-full rounded-[var(--cuerate-r-md)] border border-[var(--cuerate-text-3)] bg-[var(--cuerate-surface)] px-4 py-3 font-accent text-sm text-[var(--cuerate-text-1)] outline-none focus:border-[var(--cuerate-indigo)]"
                />
              </div>

              <div>
                <label className="mb-2 block font-accent text-sm text-[var(--cuerate-text-2)]">Bio</label>
                <textarea
                  value={draftBio}
                  onChange={(event) => setDraftBio(event.target.value)}
                  rows={3}
                  maxLength={160}
                  className="w-full rounded-[var(--cuerate-r-md)] border border-[var(--cuerate-text-3)] bg-[var(--cuerate-surface)] px-4 py-3 font-accent text-sm text-[var(--cuerate-text-1)] outline-none focus:border-[var(--cuerate-indigo)]"
                />
              </div>

              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <input
                  value={draftX}
                  onChange={(event) => setDraftX(event.target.value)}
                  placeholder="X link"
                  className="w-full rounded-[var(--cuerate-r-md)] border border-[var(--cuerate-text-3)] bg-[var(--cuerate-surface)] px-4 py-3 font-accent text-sm text-[var(--cuerate-text-1)] outline-none focus:border-[var(--cuerate-indigo)]"
                />
                <input
                  value={draftInstagram}
                  onChange={(event) => setDraftInstagram(event.target.value)}
                  placeholder="Instagram link"
                  className="w-full rounded-[var(--cuerate-r-md)] border border-[var(--cuerate-text-3)] bg-[var(--cuerate-surface)] px-4 py-3 font-accent text-sm text-[var(--cuerate-text-1)] outline-none focus:border-[var(--cuerate-indigo)]"
                />
                <input
                  value={draftYoutube}
                  onChange={(event) => setDraftYoutube(event.target.value)}
                  placeholder="YouTube link"
                  className="w-full rounded-[var(--cuerate-r-md)] border border-[var(--cuerate-text-3)] bg-[var(--cuerate-surface)] px-4 py-3 font-accent text-sm text-[var(--cuerate-text-1)] outline-none focus:border-[var(--cuerate-indigo)]"
                />
                <input
                  value={draftWebsite}
                  onChange={(event) => setDraftWebsite(event.target.value)}
                  placeholder="Website link"
                  className="w-full rounded-[var(--cuerate-r-md)] border border-[var(--cuerate-text-3)] bg-[var(--cuerate-surface)] px-4 py-3 font-accent text-sm text-[var(--cuerate-text-1)] outline-none focus:border-[var(--cuerate-indigo)]"
                />
              </div>

              {profileError && (
                <div className="rounded-[var(--cuerate-r-md)] border border-red-500/30 bg-red-500/10 px-4 py-3 font-accent text-sm text-red-200">
                  {profileError}
                </div>
              )}

              <div className="flex gap-2 pt-1">
                <button
                  onClick={() => setIsEditModalOpen(false)}
                  className="flex-1 rounded-[var(--cuerate-r-pill)] border border-[var(--cuerate-text-3)] px-4 py-3 font-accent text-sm text-[var(--cuerate-text-2)] hover:bg-[var(--cuerate-surface)]"
                >
                  Cancel
                </button>
                <button
                  onClick={() => void handleSaveProfile()}
                  disabled={isSavingProfile}
                  className="flex-1 rounded-[var(--cuerate-r-pill)] bg-[var(--cuerate-indigo)] px-4 py-3 font-accent text-sm font-medium text-white indigo-glow hover:opacity-90 disabled:opacity-60"
                >
                  {isSavingProfile ? (
                    <span className="inline-flex items-center gap-2">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Saving...
                    </span>
                  ) : (
                    'Save changes'
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {workflowPendingDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-[var(--cuerate-r-xl)] border border-red-500/30 bg-[var(--cuerate-bg)] p-5">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="font-primary text-xl font-semibold text-[var(--cuerate-text-1)]">Delete workflow?</h3>
              <button
                onClick={() => setWorkflowPendingDelete(null)}
                disabled={deletingWorkflowId === workflowPendingDelete.id}
                className="rounded-full p-2 hover:bg-[var(--cuerate-surface)] disabled:opacity-50"
                aria-label="Close delete workflow confirmation dialog"
              >
                <X className="h-4 w-4 text-[var(--cuerate-text-2)]" />
              </button>
            </div>

            <p className="mb-1 font-accent text-sm text-[var(--cuerate-text-1)]">
              This action cannot be undone.
            </p>
            <p className="mb-5 font-accent text-xs text-[var(--cuerate-text-2)]">
              The workflow, its steps, and uploaded media files will be permanently deleted.
            </p>

            <div className="flex gap-2">
              <button
                onClick={() => setWorkflowPendingDelete(null)}
                disabled={deletingWorkflowId === workflowPendingDelete.id}
                className="flex-1 rounded-[var(--cuerate-r-pill)] border border-[var(--cuerate-text-3)] px-4 py-3 font-accent text-sm text-[var(--cuerate-text-2)] hover:bg-[var(--cuerate-surface)] disabled:opacity-60"
              >
                Cancel
              </button>
              <button
                onClick={() => void handleDeleteWorkflow(workflowPendingDelete.id)}
                disabled={deletingWorkflowId === workflowPendingDelete.id}
                className="flex-1 rounded-[var(--cuerate-r-pill)] border border-red-500/40 bg-red-500/20 px-4 py-3 font-accent text-sm font-medium text-red-200 hover:bg-red-500/30 disabled:opacity-60"
              >
                {deletingWorkflowId === workflowPendingDelete.id ? (
                  <span className="inline-flex items-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Deleting...
                  </span>
                ) : (
                  'Delete Workflow'
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {promptPendingDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-[var(--cuerate-r-xl)] border border-red-500/30 bg-[var(--cuerate-bg)] p-5">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="font-primary text-xl font-semibold text-[var(--cuerate-text-1)]">Delete post?</h3>
              <button
                onClick={() => setPromptPendingDelete(null)}
                disabled={deletingPromptId === promptPendingDelete.id}
                className="rounded-full p-2 hover:bg-[var(--cuerate-surface)] disabled:opacity-50"
                aria-label="Close delete confirmation dialog"
              >
                <X className="h-4 w-4 text-[var(--cuerate-text-2)]" />
              </button>
            </div>

            <p className="mb-1 font-accent text-sm text-[var(--cuerate-text-1)]">
              This action cannot be undone.
            </p>
            <p className="mb-5 font-accent text-xs text-[var(--cuerate-text-2)]">
              The post and its uploaded media files will be permanently deleted.
            </p>

            <div className="flex gap-2">
              <button
                onClick={() => setPromptPendingDelete(null)}
                disabled={deletingPromptId === promptPendingDelete.id}
                className="flex-1 rounded-[var(--cuerate-r-pill)] border border-[var(--cuerate-text-3)] px-4 py-3 font-accent text-sm text-[var(--cuerate-text-2)] hover:bg-[var(--cuerate-surface)] disabled:opacity-60"
              >
                Cancel
              </button>
              <button
                onClick={() => void handleDeletePrompt(promptPendingDelete.id)}
                disabled={deletingPromptId === promptPendingDelete.id}
                className="flex-1 rounded-[var(--cuerate-r-pill)] border border-red-500/40 bg-red-500/20 px-4 py-3 font-accent text-sm font-medium text-red-200 hover:bg-red-500/30 disabled:opacity-60"
              >
                {deletingPromptId === promptPendingDelete.id ? (
                  <span className="inline-flex items-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Deleting...
                  </span>
                ) : (
                  'Delete Post'
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
