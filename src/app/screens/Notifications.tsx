import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { useNavigate } from 'react-router';
import { ArrowLeft, Heart, GitFork, Loader2, UserPlus } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { useAuth } from '../../lib/auth-context';
import { notificationsApi } from '../../lib/backend';
import { useBackendQuery } from '../../lib/useBackendQuery';
import { Notification } from '../../lib/types';

export function Notifications() {
  const navigate = useNavigate();
  const { user, isLoading: authIsLoading } = useAuth();
  const { data } = useBackendQuery(
    () => (user ? notificationsApi.getNotificationsForUser(user.uid) : Promise.resolve([])),
    [],
    [user?.uid],
  );
  const [notifications, setNotifications] = useState<Notification[]>([]);

  useEffect(() => {
    setNotifications(data);
  }, [data]);

  const handleNotificationClick = (notification: Notification) => {
    if (user && !notification.read) {
      setNotifications((previous) =>
        previous.map((entry) =>
          entry.id === notification.id ? { ...entry, read: true } : entry,
        ),
      );
      void notificationsApi.markRead(notification.id, user.uid);
    }

    if (notification.promptId) {
      navigate(`/prompt/${notification.promptId}`);
      return;
    }

    if (notification.workflowId) {
      navigate(`/workflow/${notification.workflowId}`);
      return;
    }

    if (notification.fromHandle) {
      navigate(`/user/${notification.fromHandle}`);
    }
  };

  const markAllRead = () => {
    setNotifications((previous) => previous.map((notification) => ({ ...notification, read: true })));
    if (user) {
      void notificationsApi.markAllRead(user.uid);
    }
  };

  if (authIsLoading && !user) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4">
        <div className="max-w-md w-full glass-surface rounded-[var(--cuerate-r-xl)] border border-[var(--cuerate-text-3)] p-8 text-center">
          <span className="inline-flex items-center gap-2 font-accent text-sm text-[var(--cuerate-text-2)]">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading notifications...
          </span>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4">
        <div className="max-w-md w-full glass-surface rounded-[var(--cuerate-r-xl)] border border-[var(--cuerate-text-3)] p-8 text-center">
          <h1 className="font-primary font-bold text-2xl text-[var(--cuerate-text-1)] mb-3">No notifications yet</h1>
          <p className="font-accent text-sm text-[var(--cuerate-text-2)] mb-6">
            Sign in to sync follows, likes, and fork activity with your account.
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

  const getNotificationIcon = (type: string) => {
    switch (type) {
      case 'fork':
        return <GitFork className="w-4 h-4 text-[#4cce8a]" />;
      case 'like':
        return <Heart className="w-4 h-4 text-[var(--cuerate-blue)] fill-[var(--cuerate-blue)]" />;
      case 'follow':
        return <UserPlus className="w-4 h-4 text-[var(--cuerate-indigo)]" />;
      default:
        return null;
    }
  };

  return (
    <div className="min-h-screen pb-8">
      <div className="sticky top-0 z-40 glass-nav border-b border-[var(--cuerate-text-3)]">
        <div className="flex items-center justify-between px-4 md:px-8 py-4 md:py-6">
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate('/')}
              className="p-2 rounded-full hover:bg-[var(--cuerate-surface)] transition-colors md:hidden"
            >
              <ArrowLeft className="w-5 h-5 text-[var(--cuerate-text-1)]" />
            </button>
            <h1 className="font-primary font-semibold text-lg md:text-2xl text-[var(--cuerate-text-1)]">
              Notifications
            </h1>
          </div>
          <button
            onClick={markAllRead}
            className="px-4 py-2 rounded-[var(--cuerate-r-pill)] glass-surface font-accent text-xs text-[var(--cuerate-text-2)] hover:text-[var(--cuerate-text-1)] transition-colors"
          >
            Mark all read
          </button>
        </div>
      </div>

      <div className="px-4 md:px-8 py-4 max-w-3xl md:mx-auto space-y-2">
        {notifications.length > 0 ? (
          notifications.map((notification) => (
            <div
              key={notification.id}
              onClick={() => handleNotificationClick(notification)}
              className={`p-4 rounded-[var(--cuerate-r-lg)] transition-colors cursor-pointer ${
                notification.read
                  ? 'glass-surface hover:bg-[var(--cuerate-surface)]'
                  : 'bg-[var(--cuerate-indigo)]/6 hover:bg-[var(--cuerate-indigo)]/10'
              }`}
            >
              <div className="flex gap-3">
                {notification.fromAvatar && (
                  <img
                    src={notification.fromAvatar}
                    alt={notification.fromHandle}
                    className="w-10 h-10 rounded-full border-2 border-[var(--cuerate-indigo)]/30 object-cover object-center"
                  />
                )}

                <div className="flex-1 min-w-0">
                  <div className="flex items-start gap-2 mb-1">
                    {getNotificationIcon(notification.type)}
                    <p className="flex-1 font-accent text-sm text-[var(--cuerate-text-1)]">
                      {notification.message}
                    </p>
                  </div>
                  <p className="font-accent text-xs text-[var(--cuerate-text-2)]">
                    {formatDistanceToNow(notification.createdAt, { addSuffix: true })}
                  </p>
                </div>

                {!notification.read && (
                  <div className="w-2 h-2 rounded-full bg-[var(--cuerate-blue)] blue-glow flex-shrink-0 mt-2" />
                )}
              </div>
            </div>
          ))
        ) : (
          <div className="py-16 text-center">
            <p className="font-accent text-sm text-[var(--cuerate-text-2)]">
              No notifications yet.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
