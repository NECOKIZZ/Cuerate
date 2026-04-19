import { Navigate, Outlet, useLocation, useNavigate } from 'react-router';
import { Home, Compass, User, Bell, Settings, Plus } from 'lucide-react';
import { useAuth } from '../../lib/auth-context';
import { truncateText } from '../../lib/text';
import { notificationsApi } from '../../lib/backend';
import { useBackendQuery } from '../../lib/useBackendQuery';

export function Layout() {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, isLoading, signOut } = useAuth();
  const { data: notifications } = useBackendQuery(
    () => (user ? notificationsApi.getNotificationsForUser(user.uid) : Promise.resolve([])),
    [],
    [user?.uid],
  );
  const hasUnreadNotifications = notifications.some((entry) => !entry.read);
  const displayHandle = user ? truncateText(user.handle, 16) : null;
  const isPromptDetailRoute = location.pathname.startsWith('/prompt/');

  const navItems = [
    { path: '/', icon: Home, label: 'Feed' },
    { path: '/explore', icon: Compass, label: 'Explore' },
    { path: '/notifications', icon: Bell, label: 'Alerts' },
    { path: '/profile', icon: User, label: 'Profile' },
    { path: '/settings', icon: Settings, label: 'Settings' },
  ].filter((entry) => !(isPromptDetailRoute && entry.path === '/post'));

  const desktopNavItems = [
    { path: '/', icon: Home, label: 'Feed' },
    { path: '/explore', icon: Compass, label: 'Explore' },
    { path: '/profile', icon: User, label: 'Profile' },
  ];

  const isActive = (path: string) => {
    if (path === '/') {
      return location.pathname === '/';
    }
    return location.pathname.startsWith(path);
  };

  const navigateWithAuth = (path: string) => {
    const requiresAuth = ['/post', '/profile', '/notifications', '/settings'];
    if (!user && requiresAuth.includes(path)) {
      navigate('/auth');
      return;
    }

    navigate(path);
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4">
        <div className="max-w-md w-full glass-surface rounded-[var(--cuerate-r-xl)] border border-[var(--cuerate-text-3)] p-8 text-center">
          <span className="font-accent text-sm text-[var(--cuerate-text-2)]">Checking your account...</span>
        </div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/auth" replace />;
  }

  return (
    <div className="cuerate-container min-h-screen flex relative">
      {/* Ambient glow */}
      <div className="ambient-glow" />

      {/* Desktop Sidebar */}
      <aside className="desktop-sidebar fixed left-0 top-0 h-screen w-64 flex-col justify-between glass-nav border-r border-[var(--cuerate-text-3)] z-50">
        <div className="flex flex-col h-full">
          {/* Logo */}
          <div className="p-6 border-b border-[var(--cuerate-text-3)]">
            <div className="flex items-center gap-2">
              <div className="flex items-center">
                <span className="font-primary font-bold text-2xl text-white">Cue</span>
                <span className="font-primary font-bold text-2xl text-[var(--cuerate-indigo)]">rate</span>
              </div>
            </div>
          </div>

          {/* Navigation */}
          <nav className="flex-1 p-4">
            <div className="space-y-2">
              {desktopNavItems.map(({ path, icon: Icon, label }) => {
                const active = isActive(path);
                return (
                  <button
                    key={path}
                    onClick={() => navigateWithAuth(path)}
                    className={`w-full flex items-center gap-4 px-4 py-3 rounded-[var(--cuerate-r-md)] font-accent transition-all ${
                      active
                        ? 'bg-[var(--cuerate-indigo)] text-white indigo-glow'
                        : 'text-[var(--cuerate-text-2)] hover:text-[var(--cuerate-text-1)] hover:bg-[var(--cuerate-surface)]'
                    }`}
                  >
                    <Icon className="w-6 h-6" />
                    <span className={`text-base ${active ? 'font-medium' : 'font-normal'}`}>
                      {label}
                    </span>
                  </button>
                );
              })}
            </div>
          </nav>

          {/* Bottom Actions */}
          <div className="p-4 border-t border-[var(--cuerate-text-3)] space-y-2">
            <button
              onClick={() => navigate(user ? '/profile' : '/auth')}
              className="w-full flex items-center gap-4 px-4 py-3 rounded-[var(--cuerate-r-md)] text-[var(--cuerate-text-2)] hover:text-[var(--cuerate-text-1)] hover:bg-[var(--cuerate-surface)] transition-all"
            >
              <User className="w-6 h-6" />
              <span className="max-w-[160px] truncate text-base font-accent" title={user ? `@${user.handle}` : 'Log In / Sign Up'}>
                {displayHandle ? `@${displayHandle}` : 'Log In / Sign Up'}
              </span>
            </button>
            <button
              onClick={() => navigate('/notifications')}
              className="w-full flex items-center gap-4 px-4 py-3 rounded-[var(--cuerate-r-md)] text-[var(--cuerate-text-2)] hover:text-[var(--cuerate-text-1)] hover:bg-[var(--cuerate-surface)] transition-all relative"
            >
              <Bell className="w-6 h-6" />
              <span className="text-base font-accent">Notifications</span>
              {hasUnreadNotifications && (
                <div className="absolute left-8 top-2 w-2 h-2 rounded-full bg-[var(--cuerate-blue)] blue-glow" />
              )}
            </button>
            <button
              onClick={() => navigate('/settings')}
              className="w-full flex items-center gap-4 px-4 py-3 rounded-[var(--cuerate-r-md)] text-[var(--cuerate-text-2)] hover:text-[var(--cuerate-text-1)] hover:bg-[var(--cuerate-surface)] transition-all"
            >
              <Settings className="w-6 h-6" />
              <span className="text-base font-accent">Settings</span>
            </button>
            {user && (
              <button
                onClick={() => void signOut().then(() => navigate('/auth'))}
                className="w-full flex items-center justify-center px-4 py-3 rounded-[var(--cuerate-r-md)] bg-[var(--cuerate-indigo)]/10 text-[var(--cuerate-indigo)] hover:bg-[var(--cuerate-indigo)]/20 transition-all font-accent"
              >
                Log Out
              </button>
            )}
          </div>
        </div>
      </aside>

      {/* Floating Action Button */}
      {!isPromptDetailRoute && (
        <button
          onClick={() => navigateWithAuth('/post')}
          className="fixed bottom-24 md:bottom-8 right-5 md:right-8 w-14 h-14 md:w-16 md:h-16 flex items-center justify-center rounded-full bg-[var(--cuerate-blue)] text-white shadow-lg blue-glow hover:scale-110 hover:shadow-[0_0_32px_var(--cuerate-blue-glow)] transition-all duration-300 z-50"
        >
          <Plus className="w-7 h-7 md:w-8 md:h-8" />
        </button>
      )}

      {/* Main content - with responsive padding */}
      <main className="flex-1 relative z-10 pb-20 md:pb-0 md:ml-64 w-full">
        <Outlet />
      </main>

      {/* Mobile Bottom Navigation */}
      <nav
        className="mobile-nav fixed bottom-4 left-1/2 z-50 w-[calc(100%-1.5rem)] max-w-md -translate-x-1/2 rounded-[var(--cuerate-r-xl)] border border-[var(--cuerate-text-3)] bg-[var(--cuerate-surface)]/96 backdrop-blur-xl shadow-[0_8px_30px_rgba(0,0,0,0.28)] md:hidden"
        style={{ marginBottom: 'env(safe-area-inset-bottom)' }}
      >
        <div className="px-2">
          <div className="grid h-16 grid-cols-5 items-center">
            {navItems.map(({ path, icon: Icon, label }) => {
              const active = isActive(path);
              return (
                <button
                  key={path}
                  onClick={() => navigateWithAuth(path)}
                  className={`flex w-full flex-col items-center justify-center gap-1 transition-all min-h-[48px] px-1 py-1 rounded-[var(--cuerate-r-md)] ${
                    active
                      ? 'text-[var(--cuerate-indigo)] bg-[var(--cuerate-indigo)]/10'
                      : 'text-[var(--cuerate-text-2)] hover:text-[var(--cuerate-text-1)]'
                  }`}
                >
                  <Icon className={`w-5 h-5 ${active ? 'indigo-glow' : ''}`} />
                  <span
                    className={`font-accent text-[10px] ${active ? 'font-medium' : 'font-normal'}`}
                  >
                    {label}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </nav>
    </div>
  );
}
