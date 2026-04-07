import { useState } from 'react';
import { Search } from 'lucide-react';
import { useNavigate } from 'react-router';
import { metaApi, usersApi } from '../../lib/backend';
import { useBackendQuery } from '../../lib/useBackendQuery';

export function Explore() {
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState('');
  const { data: users } = useBackendQuery(() => usersApi.getAllUsers(), [], []);
  const { data: availableStyleTags } = useBackendQuery(() => metaApi.getAvailableStyleTags(), [], []);

  const trendingTags = availableStyleTags
    .map((tag) => ({
      tag,
      count: Math.floor(Math.random() * 3000) + 500,
    }))
    .sort((a, b) => b.count - a.count);

  const topCreators = users.map((user, index) => ({
    ...user,
    rank: index + 1,
  }));

  return (
    <div className="min-h-screen pb-8">
      <div className="sticky top-0 z-40 glass-nav border-b border-[var(--cuerate-text-3)]">
        <div className="px-4 md:px-8 py-4 md:py-6">
          <h1 className="font-primary font-semibold text-lg md:text-2xl text-[var(--cuerate-text-1)] mb-4">
            Explore
          </h1>

          <div className="relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-[var(--cuerate-text-2)]" />
            <input
              type="text"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="Search prompts, creators, models..."
              className="w-full pl-12 pr-4 py-3 rounded-[var(--cuerate-r-pill)] glass-surface border border-[var(--cuerate-text-3)] focus:border-[var(--cuerate-indigo)] focus:indigo-glow outline-none font-accent text-sm text-[var(--cuerate-text-1)] placeholder:text-[var(--cuerate-text-2)] transition-all"
            />
          </div>
        </div>
      </div>

      <div className="px-4 md:px-8 py-6 space-y-8">
        <div>
          <h2 className="font-primary font-semibold text-base md:text-xl text-[var(--cuerate-text-1)] mb-4">
            Trending Tags
          </h2>
          <div className="overflow-x-auto scrollbar-hide -mx-4 px-4 md:mx-0 md:px-0">
            <div className="flex gap-3">
              {trendingTags.map(({ tag, count }) => (
                <button
                  key={tag}
                  className="flex flex-col items-center gap-1 px-6 py-3 rounded-[var(--cuerate-r-pill)] glass-surface hover:bg-[var(--cuerate-indigo)]/10 transition-colors whitespace-nowrap"
                >
                  <span className="font-accent font-medium text-sm text-[var(--cuerate-indigo)]">
                    #{tag}
                  </span>
                  <span className="font-accent text-xs text-[var(--cuerate-text-2)]">
                    {(count / 1000).toFixed(1)}k
                  </span>
                </button>
              ))}
            </div>
          </div>
        </div>

        <div>
          <h2 className="font-primary font-semibold text-base md:text-xl text-[var(--cuerate-text-1)] mb-4">
            Top Creators
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {topCreators.map((creator) => (
              <div
                key={creator.uid}
                onClick={() => navigate(`/user/${creator.handle}`)}
                className="flex items-center gap-4 p-4 rounded-[var(--cuerate-r-lg)] glass-surface card-top-edge hover:bg-[var(--cuerate-surface)] transition-colors cursor-pointer"
              >
                <div className="w-8 h-8 flex items-center justify-center rounded-full bg-[var(--cuerate-indigo)]/20 font-accent font-semibold text-sm text-[var(--cuerate-indigo)]">
                  #{creator.rank}
                </div>
                <img
                  src={creator.avatarUrl}
                  alt={creator.handle}
                  className="w-12 h-12 rounded-full border-2 border-[var(--cuerate-indigo)]"
                />
                <div className="flex-1 min-w-0">
                  <p className="font-primary font-medium text-[var(--cuerate-text-1)] truncate">
                    {creator.displayName}
                  </p>
                  <p className="font-accent text-sm text-[var(--cuerate-text-2)]">
                    @{creator.handle}
                  </p>
                  <p className="font-accent text-xs text-[var(--cuerate-indigo)] mt-1">
                    {creator.totalCopies.toLocaleString()} prompts copied
                  </p>
                </div>
                <button className="px-4 py-2 rounded-[var(--cuerate-r-pill)] bg-[var(--cuerate-indigo)] text-white font-accent text-sm font-medium indigo-glow hover:opacity-90 transition-opacity">
                  Follow
                </button>
              </div>
            ))}
          </div>
        </div>

        <div>
          <h2 className="font-primary font-semibold text-base md:text-xl text-[var(--cuerate-text-1)] mb-4">
            Trending Prompts
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {[1, 2, 3, 4, 5].map((index) => (
              <div
                key={index}
                className="p-4 rounded-[var(--cuerate-r-lg)] glass-surface card-top-edge hover:bg-[var(--cuerate-surface)] transition-colors cursor-pointer"
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="px-3 py-1 rounded-[var(--cuerate-r-pill)] bg-[var(--cuerate-blue)]/10 font-accent text-xs text-[var(--cuerate-blue)]">
                    Sora
                  </span>
                  <span className="font-accent text-xs text-[var(--cuerate-indigo)]">
                    {Math.floor(Math.random() * 500) + 200} copies
                  </span>
                </div>
                <p className="font-accent text-sm text-[var(--cuerate-text-2)] line-clamp-2">
                  A sweeping aerial view of a misty mountain valley at golden hour...
                </p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
