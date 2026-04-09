import { FormEvent, useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router';
import { Loader2, MailCheck } from 'lucide-react';
import { useAuth } from '../../lib/auth-context';

type AuthMode = 'login' | 'signup';

export function Auth() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, sendEmailLink, completeEmailLinkSignIn, signInWithGoogle } = useAuth();
  const [mode, setMode] = useState<AuthMode>('login');
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [isEmailSubmitting, setIsEmailSubmitting] = useState(false);
  const [isGoogleSubmitting, setIsGoogleSubmitting] = useState(false);
  const [isCompletingEmailLink, setIsCompletingEmailLink] = useState(false);
  const [awaitingEmailLink, setAwaitingEmailLink] = useState(false);

  const title = useMemo(
    () => (mode === 'login' ? 'Log in to Cuerate' : 'Create your Cuerate account'),
    [mode],
  );

  useEffect(() => {
    if (user) {
      navigate('/');
    }
  }, [navigate, user]);

  useEffect(() => {
    if (!location.search.includes('oobCode=')) {
      return;
    }

    setIsCompletingEmailLink(true);
    setError(null);
    setStatusMessage('Finishing your email link sign-in...');

    void completeEmailLinkSignIn(window.location.href)
      .then((signedInUser) => {
        if (!signedInUser) {
          setError('This sign-in link is invalid or expired. Try sending a new one.');
          return;
        }
        navigate('/');
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : 'Could not complete email link sign-in.');
      })
      .finally(() => {
        setIsCompletingEmailLink(false);
      });
  }, [completeEmailLinkSignIn, location.search, navigate]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setStatusMessage(null);
    setIsEmailSubmitting(true);

    try {
      await sendEmailLink({
        mode,
        email,
        handle: username,
      });

      setAwaitingEmailLink(true);
      setStatusMessage(
        mode === 'login'
          ? 'Check your inbox and open the sign-in link on this device.'
          : 'Check your inbox to finish creating your account.',
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not send your sign-in link.');
    } finally {
      setIsEmailSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-12 relative overflow-hidden">
      <div className="ambient-glow" />
      <div className="w-full max-w-md relative z-10">
        <div className="glass-surface border border-[var(--cuerate-text-3)] rounded-[var(--cuerate-r-xl)] p-8 card-top-edge">
          <div className="mb-8 text-center">
            <p className="font-primary font-bold text-3xl text-white">
              Cue<span className="text-[var(--cuerate-blue)]">rate</span>
            </p>
            <h1 className="mt-5 font-primary font-bold text-2xl text-[var(--cuerate-text-1)]">
              {title}
            </h1>
            <p className="mt-2 font-accent text-sm text-[var(--cuerate-text-2)]">
            {mode === 'login'
                ? 'Log in with Google or a secure email link.'
                : 'Create your account with a username, Google, or a secure email link.'}
            </p>
          </div>

          {awaitingEmailLink && (
            <div className="mb-6 rounded-[var(--cuerate-r-lg)] border border-[var(--cuerate-blue)]/30 bg-[var(--cuerate-blue)]/10 p-4">
              <div className="flex items-start gap-3">
                <MailCheck className="mt-0.5 h-5 w-5 text-[var(--cuerate-blue)]" />
                <div className="flex-1">
                  <p className="font-accent text-sm text-[var(--cuerate-text-1)]">
                    Check your inbox
                  </p>
                  <p className="mt-1 font-accent text-xs text-[var(--cuerate-text-2)]">
                    We sent a secure sign-in link to {email}. Open it on this same device to continue.
                  </p>
                </div>
              </div>
            </div>
          )}

          <div className="mb-6 flex gap-2 rounded-[var(--cuerate-r-pill)] p-1 glass-nav border border-[var(--cuerate-text-3)]">
            {(['login', 'signup'] as const).map((entry) => (
              <button
                key={entry}
                onClick={() => {
                  setMode(entry);
                  setError(null);
                  setStatusMessage(null);
                  setAwaitingEmailLink(false);
                }}
                className={`flex-1 rounded-[var(--cuerate-r-pill)] px-4 py-2.5 font-accent text-sm transition-all ${
                  mode === entry
                    ? 'bg-[var(--cuerate-indigo)] text-white indigo-glow'
                    : 'text-[var(--cuerate-text-2)] hover:text-[var(--cuerate-text-1)]'
                }`}
              >
                {entry === 'login' ? 'Log In' : 'Sign Up'}
              </button>
            ))}
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {mode === 'signup' && (
                <div>
                  <label className="mb-2 block font-accent text-sm text-[var(--cuerate-text-2)]">
                    Username
                  </label>
                  <input
                    value={username}
                    onChange={(event) => setUsername(event.target.value)}
                    placeholder="alexchen"
                    className="w-full rounded-[var(--cuerate-r-md)] border border-[var(--cuerate-text-3)] bg-[var(--cuerate-surface)] px-4 py-3 font-accent text-sm text-[var(--cuerate-text-1)] outline-none focus:border-[var(--cuerate-indigo)]"
                    required
                  />
                </div>
            )}

            <div>
              <label className="mb-2 block font-accent text-sm text-[var(--cuerate-text-2)]">
                Email
              </label>
              <input
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="you@example.com"
                className="w-full rounded-[var(--cuerate-r-md)] border border-[var(--cuerate-text-3)] bg-[var(--cuerate-surface)] px-4 py-3 font-accent text-sm text-[var(--cuerate-text-1)] outline-none focus:border-[var(--cuerate-indigo)]"
                required
              />
            </div>

            {error && (
              <div className="rounded-[var(--cuerate-r-md)] border border-red-500/30 bg-red-500/10 px-4 py-3 font-accent text-sm text-red-200">
                {error}
              </div>
            )}

            {statusMessage && (
              <div className="rounded-[var(--cuerate-r-md)] border border-[var(--cuerate-blue)]/30 bg-[var(--cuerate-blue)]/10 px-4 py-3 font-accent text-sm text-[var(--cuerate-text-1)]">
                {statusMessage}
              </div>
            )}

            <button
              type="submit"
              disabled={isEmailSubmitting || isCompletingEmailLink}
              className="w-full rounded-[var(--cuerate-r-pill)] bg-gradient-to-r from-[var(--cuerate-indigo)] to-[var(--cuerate-blue)] px-4 py-3 font-accent text-sm font-medium text-white indigo-glow hover:opacity-90 transition-opacity disabled:opacity-60"
            >
              {isEmailSubmitting || isCompletingEmailLink ? (
                <span className="inline-flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Sending link...
                </span>
              ) : mode === 'login' ? (
                'Email Me a Sign-In Link'
              ) : (
                'Email Me a Sign-Up Link'
              )}
            </button>
          </form>

          <div className="my-5 flex items-center gap-3">
            <div className="h-px flex-1 bg-[var(--cuerate-text-3)]" />
            <span className="font-accent text-xs uppercase tracking-[0.2em] text-[var(--cuerate-text-2)]">or</span>
            <div className="h-px flex-1 bg-[var(--cuerate-text-3)]" />
          </div>

          <button
            onClick={() => {
              setError(null);
              setStatusMessage(null);
              setIsGoogleSubmitting(true);
              void signInWithGoogle()
                .then(() => navigate('/'))
                .catch((err) => setError(err instanceof Error ? err.message : 'Google sign-in failed.'))
                .finally(() => setIsGoogleSubmitting(false));
            }}
            disabled={isGoogleSubmitting || isCompletingEmailLink}
            className="w-full rounded-[var(--cuerate-r-pill)] border border-[var(--cuerate-text-3)] bg-white px-4 py-3 font-accent text-sm font-medium text-[#202124] hover:bg-[#f6f7f8] disabled:opacity-60"
          >
            {isGoogleSubmitting ? (
              <span className="inline-flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                Continuing with Google...
              </span>
            ) : (
              'Continue with Google'
            )}
          </button>

          <p className="mt-6 text-center font-accent text-sm text-[var(--cuerate-text-2)]">
            Back to <Link to="/" className="text-[var(--cuerate-blue)] hover:underline">feed</Link>
          </p>
        </div>
      </div>
    </div>
  );
}
