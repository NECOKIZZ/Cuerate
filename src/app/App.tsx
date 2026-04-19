import { RouterProvider } from 'react-router';
import { router } from './routes';
import { AuthProvider } from '../lib/auth-context';
import { firebaseEnabled } from '../lib/firebase';

function App() {
  if (import.meta.env.PROD && !firebaseEnabled) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4">
        <div className="max-w-lg w-full glass-surface rounded-[var(--cuerate-r-xl)] border border-red-500/30 p-8 text-center">
          <h1 className="font-primary font-bold text-2xl text-[var(--cuerate-text-1)] mb-3">
            Backend Configuration Required
          </h1>
          <p className="font-accent text-sm text-[var(--cuerate-text-2)]">
            Firebase is not configured for this production build. Configure Firebase env vars before going live.
          </p>
        </div>
      </div>
    );
  }

  return (
    <AuthProvider>
      <RouterProvider router={router} />
    </AuthProvider>
  );
}

export default App;
