import { useState, useEffect, useCallback, useRef } from 'react';
import { apiClient, type AppNotification } from '@/services/apiClient';
import { useAuth } from '@/contexts/AuthContext';

const POLL_INTERVAL = 30_000; // 30 seconds

export function useNotifications() {
  const { currentUser } = useAuth();
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetch = useCallback(async () => {
    if (!currentUser) return;
    try {
      const data = await apiClient.notifications.getAll({ limit: 30 });
      setNotifications(data.notifications);
      setUnreadCount(data.unreadCount);
    } catch {
      // silent — notifications are best-effort
    }
  }, [currentUser]);

  useEffect(() => {
    if (!currentUser) {
      setNotifications([]);
      setUnreadCount(0);
      return;
    }
    setLoading(true);
    fetch().finally(() => setLoading(false));

    intervalRef.current = setInterval(fetch, POLL_INTERVAL);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [currentUser, fetch]);

  const markRead = useCallback(async (ids: string[]) => {
    if (ids.length === 0) return;
    try {
      const res = await apiClient.notifications.markRead(ids);
      setUnreadCount(res.unreadCount);
      setNotifications(prev =>
        prev.map(n => (ids.includes(n.id) ? { ...n, isRead: true } : n))
      );
    } catch {
      // silent
    }
  }, []);

  const markAllRead = useCallback(async () => {
    try {
      const res = await apiClient.notifications.markAllRead();
      setUnreadCount(res.unreadCount);
      setNotifications(prev => prev.map(n => ({ ...n, isRead: true })));
    } catch {
      // silent
    }
  }, []);

  const remove = useCallback(async (id: string) => {
    try {
      await apiClient.notifications.delete(id);
      setNotifications(prev => prev.filter(n => n.id !== id));
      setUnreadCount(prev => {
        const wasUnread = notifications.find(n => n.id === id)?.isRead === false;
        return wasUnread ? Math.max(0, prev - 1) : prev;
      });
    } catch {
      // silent
    }
  }, [notifications]);

  return { notifications, unreadCount, loading, markRead, markAllRead, remove, refresh: fetch };
}
