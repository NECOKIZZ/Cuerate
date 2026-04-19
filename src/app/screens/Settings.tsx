import { useNavigate } from 'react-router';
import { ArrowLeft, Cog } from 'lucide-react';

export function Settings() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen pb-8">
      <div className="sticky top-0 z-40 glass-nav border-b border-[var(--cuerate-text-3)]">
        <div className="flex items-center gap-3 px-4 py-4 md:px-8 md:py-6">
          <button
            onClick={() => navigate(-1)}
            className="p-2 rounded-full hover:bg-[var(--cuerate-surface)] transition-colors"
            aria-label="Go back"
          >
            <ArrowLeft className="w-5 h-5 text-[var(--cuerate-text-1)]" />
          </button>
          <h1 className="font-primary font-semibold text-lg md:text-2xl text-[var(--cuerate-text-1)]">
            Settings
          </h1>
        </div>
      </div>

      <div className="px-4 md:px-8 py-6">
        <div className="max-w-2xl md:mx-auto rounded-[var(--cuerate-r-xl)] glass-surface border border-[var(--cuerate-text-3)] p-8 text-center">
          <div className="inline-flex h-14 w-14 items-center justify-center rounded-full bg-[var(--cuerate-indigo)]/15 mb-4">
            <Cog className="h-7 w-7 text-[var(--cuerate-indigo)]" />
          </div>
          <p className="font-primary text-xl text-[var(--cuerate-text-1)] mb-2">Settings Are Coming Soon</p>
          <p className="font-accent text-sm text-[var(--cuerate-text-2)]">
            Core account controls are available in your profile for now.
          </p>
        </div>
      </div>
    </div>
  );
}
