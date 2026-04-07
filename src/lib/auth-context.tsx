import { createContext, ReactNode, useContext, useEffect, useState } from 'react';
import { authApi } from './backend';
import { User } from './types';

interface AuthContextValue {
  user: User | null;
  isLoading: boolean;
  sendEmailLink: typeof authApi.sendEmailLink;
  completeEmailLinkSignIn: typeof authApi.completeEmailLinkSignIn;
  signInWithGoogle: typeof authApi.signInWithGoogle;
  signOut: typeof authApi.signOut;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    authApi.getCurrentUser().then((currentUser) => {
      if (mounted) {
        setUser(currentUser);
        setIsLoading(false);
      }
    });

    const unsubscribe = authApi.subscribe((currentUser) => {
      if (mounted) {
        setUser(currentUser);
        setIsLoading(false);
      }
    });

    return () => {
      mounted = false;
      unsubscribe();
    };
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user,
        isLoading,
        sendEmailLink: authApi.sendEmailLink,
        completeEmailLinkSignIn: authApi.completeEmailLinkSignIn,
        signInWithGoogle: authApi.signInWithGoogle,
        signOut: authApi.signOut,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider.');
  }

  return context;
}
