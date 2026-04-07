import { useEffect, useState } from 'react';
import { Plus, Folder } from 'lucide-react';
import { Link } from 'react-router';
import { collectionsApi, promptsApi } from '../../lib/backend';
import { useAuth } from '../../lib/auth-context';
import { useBackendQuery } from '../../lib/useBackendQuery';
import { Collection } from '../../lib/types';

export function Saves() {
  const { user } = useAuth();
  const { data: promptFeed } = useBackendQuery(() => promptsApi.getFeedPrompts(), [], []);
  const { data: savedCollections } = useBackendQuery(
    () => (user ? collectionsApi.getCollectionsForUser(user.uid) : Promise.resolve([])),
    [],
    [user?.uid],
  );
  const [collections, setCollections] = useState<Collection[]>([]);
  const [isCreatingCollection, setIsCreatingCollection] = useState(false);
  const [newCollectionName, setNewCollectionName] = useState('');
  const [newCollectionDescription, setNewCollectionDescription] = useState('');

  useEffect(() => {
    setCollections(savedCollections);
  }, [savedCollections]);

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4">
        <div className="max-w-md w-full glass-surface rounded-[var(--cuerate-r-xl)] border border-[var(--cuerate-text-3)] p-8 text-center">
          <h1 className="font-primary font-bold text-2xl text-[var(--cuerate-text-1)] mb-3">Log in to save prompts</h1>
          <p className="font-accent text-sm text-[var(--cuerate-text-2)] mb-6">
            Collections are now wired through the backend layer, so they follow the signed-in account.
          </p>
          <Link
            to="/auth"
            className="inline-flex items-center justify-center w-full rounded-[var(--cuerate-r-pill)] bg-[var(--cuerate-indigo)] px-4 py-3 font-accent text-sm font-medium text-white indigo-glow"
          >
            Go to Login
          </Link>
        </div>
      </div>
    );
  }

  const recentlySaved = promptFeed.slice(0, 3);

  return (
    <div className="min-h-screen pb-8">
      <div className="sticky top-0 z-40 glass-nav border-b border-[var(--cuerate-text-3)]">
        <div className="flex items-center justify-between px-4 md:px-8 py-4 md:py-6">
          <h1 className="font-primary font-semibold text-lg md:text-2xl text-[var(--cuerate-text-1)]">
            Saves
          </h1>
          <button className="px-4 py-2 rounded-[var(--cuerate-r-pill)] glass-surface font-accent text-sm text-[var(--cuerate-text-1)] hover:bg-[var(--cuerate-indigo)]/10 transition-colors">
            Edit
          </button>
        </div>
      </div>

      <div className="px-4 md:px-8 py-6 space-y-8">
        <div>
          <h2 className="font-primary font-semibold text-base md:text-xl text-[var(--cuerate-text-1)] mb-4">
            Collections
          </h2>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {collections.map((collection) => (
              <div
                key={collection.id}
                className="p-4 rounded-[var(--cuerate-r-xl)] glass-surface card-top-edge hover:border hover:border-[var(--cuerate-indigo)] transition-all cursor-pointer"
              >
                <div className="grid grid-cols-2 gap-1 mb-3 rounded-[var(--cuerate-r-md)] overflow-hidden aspect-square">
                  {collection.thumbnails.map((thumb, index) => (
                    <img
                      key={index}
                      src={thumb}
                      alt=""
                      className="w-full h-full object-cover"
                    />
                  ))}
                </div>
                <div className="flex items-center gap-2 mb-1">
                  <Folder className="w-4 h-4 text-[var(--cuerate-indigo)]" />
                  <h3 className="font-primary font-medium text-sm text-[var(--cuerate-text-1)]">
                    {collection.name}
                  </h3>
                </div>
                <p className="font-accent text-xs text-[var(--cuerate-text-2)]">
                  {collection.count} prompts
                </p>
              </div>
            ))}

            <button
              onClick={() => setIsCreatingCollection(true)}
              className="p-4 rounded-[var(--cuerate-r-xl)] border-2 border-dashed border-[var(--cuerate-indigo)]/30 hover:border-[var(--cuerate-indigo)]/50 glass-surface transition-colors aspect-square flex flex-col items-center justify-center gap-2"
            >
              <Plus className="w-8 h-8 text-[var(--cuerate-indigo)]" />
              <span className="font-accent text-sm text-[var(--cuerate-text-1)]">
                New Collection
              </span>
            </button>
          </div>
        </div>

        <div>
          <h2 className="font-primary font-semibold text-base md:text-xl text-[var(--cuerate-text-1)] mb-4">
            Recently Saved
          </h2>
          <div className="overflow-x-auto scrollbar-hide -mx-4 px-4 md:mx-0 md:px-0">
            <div className="flex md:grid md:grid-cols-3 lg:grid-cols-4 gap-3">
              {recentlySaved.map((prompt) => (
                <div
                  key={prompt.id}
                  className="flex-shrink-0 w-64 md:w-auto p-3 rounded-[var(--cuerate-r-lg)] glass-surface card-top-edge cursor-pointer"
                >
                  <div className="relative aspect-video mb-2 rounded-[var(--cuerate-r-sm)] overflow-hidden">
                    <img
                      src={prompt.thumbnailUrl}
                      alt=""
                      className="w-full h-full object-cover"
                    />
                    <div className="absolute bottom-2 left-2 px-2 py-1 rounded-[var(--cuerate-r-pill)] glass-surface font-accent text-xs text-[var(--cuerate-text-1)]">
                      {prompt.model}
                    </div>
                  </div>
                  <p className="font-accent text-xs text-[var(--cuerate-text-2)] line-clamp-2">
                    {prompt.promptText}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {isCreatingCollection && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
          onClick={() => {
            setIsCreatingCollection(false);
            setNewCollectionName('');
            setNewCollectionDescription('');
          }}
        >
          <div
            className="w-full max-w-md glass-surface rounded-[var(--cuerate-r-xl)] p-6 border border-[var(--cuerate-indigo)]/30"
            onClick={(event) => event.stopPropagation()}
          >
            <h3 className="font-primary font-semibold text-lg text-[var(--cuerate-text-1)] mb-4">
              Create New Collection
            </h3>

            <div className="mb-4">
              <label className="block font-accent text-sm text-[var(--cuerate-text-2)] mb-2">
                Collection Name
              </label>
              <input
                type="text"
                value={newCollectionName}
                onChange={(event) => setNewCollectionName(event.target.value)}
                placeholder="e.g., Sci-Fi Scenes"
                className="w-full px-4 py-3 rounded-[var(--cuerate-r-md)] bg-[var(--cuerate-indigo)]/5 border border-[var(--cuerate-indigo)]/20 font-accent text-sm text-[var(--cuerate-text-1)] placeholder:text-[var(--cuerate-text-3)] focus:outline-none focus:border-[var(--cuerate-indigo)] transition-colors"
                autoFocus
              />
            </div>

            <div className="mb-6">
              <label className="block font-accent text-sm text-[var(--cuerate-text-2)] mb-2">
                Description (Optional)
              </label>
              <textarea
                value={newCollectionDescription}
                onChange={(event) => setNewCollectionDescription(event.target.value)}
                placeholder="Add a description for this collection..."
                rows={3}
                className="w-full px-4 py-3 rounded-[var(--cuerate-r-md)] bg-[var(--cuerate-indigo)]/5 border border-[var(--cuerate-indigo)]/20 font-accent text-sm text-[var(--cuerate-text-1)] placeholder:text-[var(--cuerate-text-3)] focus:outline-none focus:border-[var(--cuerate-indigo)] transition-colors resize-none"
              />
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => {
                  setIsCreatingCollection(false);
                  setNewCollectionName('');
                  setNewCollectionDescription('');
                }}
                className="flex-1 px-4 py-2.5 rounded-[var(--cuerate-r-pill)] glass-surface font-accent text-sm text-[var(--cuerate-text-1)] hover:bg-[var(--cuerate-indigo)]/10 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  void collectionsApi
                    .createCollection({
                      userId: user.uid,
                      name: newCollectionName,
                      description: newCollectionDescription,
                    })
                    .then((created) => {
                      setCollections((previous) => [created, ...previous]);
                    });

                  setIsCreatingCollection(false);
                  setNewCollectionName('');
                  setNewCollectionDescription('');
                }}
                disabled={!newCollectionName.trim()}
                className="flex-1 px-4 py-2.5 rounded-[var(--cuerate-r-pill)] bg-[var(--cuerate-indigo)] text-white font-accent text-sm font-medium indigo-glow hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Create
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
