import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell, Check, CheckCheck, Inbox, Layers, Trash2, X } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import {
  deleteNotification,
  fetchNotifications,
  fetchUnreadNotificationCount,
  markAllNotificationsRead,
  markNotificationRead,
  Notification,
} from '../lib/notificationService';

interface GroupedNotification {
  key: string;
  representative: Notification;
  ids: string[];
  count: number;
  hasUnread: boolean;
}

function groupNotifications(items: Notification[]): GroupedNotification[] {
  const groups: Map<string, GroupedNotification> = new Map();
  for (const n of items) {
    const key = `${n.type}::${n.title}::${n.message}::${n.link ?? ''}`;
    const existing = groups.get(key);
    if (existing) {
      existing.ids.push(n.id);
      existing.count++;
      if (!n.is_read) existing.hasUnread = true;
      if (new Date(n.created_at) > new Date(existing.representative.created_at)) {
        existing.representative = n;
      }
    } else {
      groups.set(key, {
        key,
        representative: n,
        ids: [n.id],
        count: 1,
        hasUnread: !n.is_read,
      });
    }
  }
  return Array.from(groups.values());
}

function formatRelativeTime(iso: string): string {
  const date = new Date(iso);
  const diff = Date.now() - date.getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "a l'instant";
  if (minutes < 60) return `il y a ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `il y a ${hours} h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `il y a ${days} j`;
  return date.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
}

export function NotificationCenter() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  const load = useCallback(
    async (includeList: boolean) => {
      if (!user) return;
      if (includeList) setLoading(true);
      try {
        const tasks: Promise<unknown>[] = [fetchUnreadNotificationCount(user.id).then(setUnreadCount)];
        if (includeList) tasks.push(fetchNotifications(user.id).then(setNotifications));
        await Promise.all(tasks);
      } finally {
        if (includeList) setLoading(false);
      }
    },
    [user]
  );

  /**
   * Le sondage du badge : cinq minutes, et seulement onglet visible.
   *
   * ⚠️ CE SONDAGE ETAIT 96 % DU TRAFIC DE L'APPLICATION. Mesure du 2026-08-07 sur
   * les journaux du serveur : 318 requêtes sur 332, toutes des
   * `HEAD /rest/v1/notifications`, à 92 ms de moyenne — pour un compteur qui vaut
   * presque toujours zéro. Tout le reste de l'usage réel du CRM tenait dans les
   * 14 requêtes restantes.
   *
   * Trois changements, du plus rentable au moins visible :
   *
   *   · SOIXANTE SECONDES → CINQ MINUTES. Une notification qui arrive avec quatre
   *     minutes de retard sur un badge ne change rien au travail d'un cabinet ;
   *     douze requêtes par heure au lieu de soixante, si.
   *   · RIEN QUAND L'ONGLET EST CACHE. C'est le gain le plus important en
   *     pratique : un onglet du CRM laissé ouvert toute la journée derrière
   *     d'autres fenêtres interrogeait le serveur sans que personne ne regarde.
   *   · RAFRAICHISSEMENT AU RETOUR. Compense la fenêtre plus longue là où elle se
   *     verrait : en revenant sur l'onglet, le compte est à jour immédiatement.
   *
   * Le temps réel n'est pas une option : `supabase.channel()` est un leurre depuis
   * la refonte (voir src/lib/supabase.ts) — plus de websocket, la méthode ne fait
   * rien. Le sondage est donc le seul mécanisme, ce qui rend sa cadence d'autant
   * plus importante.
   */
  useEffect(() => {
    if (!user) return;

    const visible = () => document.visibilityState === 'visible';
    if (visible()) load(false);

    const interval = setInterval(() => {
      if (visible()) load(false);
    }, 5 * 60_000);

    const auRetour = () => {
      if (visible()) load(false);
    };
    document.addEventListener('visibilitychange', auRetour);

    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', auRetour);
    };
  }, [user, load]);

  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel(`notifications:${user.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${user.id}`,
        },
        () => {
          load(open);
        }
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, open, load]);

  useEffect(() => {
    if (open) load(true);
  }, [open, load]);

  useEffect(() => {
    if (!open) return;
    const handleClick = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        panelRef.current &&
        !panelRef.current.contains(target) &&
        buttonRef.current &&
        !buttonRef.current.contains(target)
      ) {
        setOpen(false);
      }
    };
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', handleClick);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handleClick);
      document.removeEventListener('keydown', handleKey);
    };
  }, [open]);

  const handleClick = async (g: GroupedNotification) => {
    if (g.hasUnread) {
      const unreadIds = new Set(
        notifications.filter((n) => g.ids.includes(n.id) && !n.is_read).map((n) => n.id)
      );
      setNotifications((prev) => prev.map((x) => (unreadIds.has(x.id) ? { ...x, is_read: true } : x)));
      setUnreadCount((c) => Math.max(0, c - unreadIds.size));
      await Promise.all(Array.from(unreadIds).map(markNotificationRead));
    }
    if (g.representative.link) {
      navigate(g.representative.link);
      setOpen(false);
    }
  };

  const handleMarkAll = async () => {
    if (!user || unreadCount === 0) return;
    setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
    setUnreadCount(0);
    await markAllNotificationsRead(user.id);
  };

  const handleDelete = async (e: React.MouseEvent, g: GroupedNotification) => {
    e.stopPropagation();
    const idsSet = new Set(g.ids);
    const unreadInGroup = notifications.filter((n) => idsSet.has(n.id) && !n.is_read).length;
    setNotifications((prev) => prev.filter((x) => !idsSet.has(x.id)));
    if (unreadInGroup > 0) setUnreadCount((c) => Math.max(0, c - unreadInGroup));
    await Promise.all(g.ids.map(deleteNotification));
  };

  const grouped = useMemo(() => {
    const today: Notification[] = [];
    const earlier: Notification[] = [];
    const now = new Date();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    for (const n of notifications) {
      if (new Date(n.created_at).getTime() >= startOfDay) today.push(n);
      else earlier.push(n);
    }
    return {
      today: groupNotifications(today),
      earlier: groupNotifications(earlier),
    };
  }, [notifications]);

  return (
    <div className="relative">
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="relative inline-flex items-center justify-center w-9 h-9 rounded-lg text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
        aria-label="Notifications"
      >
        <Bell className="w-5 h-5" />
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 text-[10px] font-bold text-white bg-red-500 rounded-full ring-2 ring-white dark:ring-gray-900">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div
          ref={panelRef}
          className="absolute right-0 mt-2 w-[22rem] sm:w-96 bg-white dark:bg-gray-900 rounded-xl shadow-2xl border border-gray-200 dark:border-gray-800 overflow-hidden z-50 flex flex-col max-h-[80vh]"
        >
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-800">
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                Notifications
              </h3>
              {unreadCount > 0 && (
                <span className="inline-flex items-center justify-center px-1.5 h-5 text-[11px] font-semibold text-teal-700 bg-teal-100 dark:text-teal-300 dark:bg-teal-950/60 rounded-full">
                  {unreadCount}
                </span>
              )}
            </div>
            <div className="flex items-center gap-1">
              {unreadCount > 0 && (
                <button
                  type="button"
                  onClick={handleMarkAll}
                  className="inline-flex items-center gap-1 px-2 py-1 text-[12px] font-medium text-teal-700 dark:text-teal-400 hover:bg-teal-50 dark:hover:bg-teal-950/40 rounded-md transition-colors"
                >
                  <CheckCheck className="w-3.5 h-3.5" />
                  Tout lire
                </button>
              )}
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="inline-flex items-center justify-center w-7 h-7 text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-md transition-colors"
                aria-label="Fermer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto">
            {loading ? (
              <div className="py-10 px-4 text-center text-sm text-gray-500 dark:text-gray-400">
                Chargement...
              </div>
            ) : notifications.length === 0 ? (
              <div className="py-12 px-4 text-center">
                <Inbox className="w-10 h-10 mx-auto text-gray-300 dark:text-gray-600 mb-3" />
                <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  Aucune notification
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  Vous serez prevenu des nouveautes ici.
                </p>
              </div>
            ) : (
              <>
                {grouped.today.length > 0 && (
                  <NotificationSection
                    title="Aujourd'hui"
                    items={grouped.today}
                    onClick={handleClick}
                    onDelete={handleDelete}
                  />
                )}
                {grouped.earlier.length > 0 && (
                  <NotificationSection
                    title="Plus tot"
                    items={grouped.earlier}
                    onClick={handleClick}
                    onDelete={handleDelete}
                  />
                )}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function NotificationSection({
  title,
  items,
  onClick,
  onDelete,
}: {
  title: string;
  items: GroupedNotification[];
  onClick: (g: GroupedNotification) => void;
  onDelete: (e: React.MouseEvent, g: GroupedNotification) => void;
}) {
  return (
    <div>
      <div className="px-4 pt-3 pb-1 text-[11px] uppercase tracking-wider font-semibold text-gray-400 dark:text-gray-500">
        {title}
      </div>
      <ul>
        {items.map((g) => {
          const n = g.representative;
          const isRead = !g.hasUnread;
          return (
            <li key={g.key}>
              <button
                type="button"
                onClick={() => onClick(g)}
                className={`group w-full flex gap-3 px-4 py-3 text-left border-l-2 transition-colors ${
                  isRead
                    ? 'border-transparent hover:bg-gray-50 dark:hover:bg-gray-800/60'
                    : 'border-teal-500 bg-teal-50/40 dark:bg-teal-950/20 hover:bg-teal-50 dark:hover:bg-teal-950/30'
                }`}
              >
                <div
                  className={`mt-1 flex-shrink-0 w-2 h-2 rounded-full ${
                    isRead ? 'bg-gray-300 dark:bg-gray-700' : 'bg-teal-500'
                  }`}
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-start gap-2">
                    <p className={`flex-1 text-sm ${isRead ? 'font-medium text-gray-700 dark:text-gray-300' : 'font-semibold text-gray-900 dark:text-gray-100'}`}>
                      {n.title}
                    </p>
                    <span className="text-[11px] text-gray-400 dark:text-gray-500 whitespace-nowrap">
                      {formatRelativeTime(n.created_at)}
                    </span>
                  </div>
                  <p className="text-xs text-gray-600 dark:text-gray-400 mt-0.5 line-clamp-2">
                    {n.message}
                  </p>
                  {g.count > 1 && (
                    <span className="inline-flex items-center gap-1 mt-1.5 px-1.5 py-0.5 text-[11px] font-medium text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-gray-800 rounded">
                      <Layers className="w-3 h-3" />
                      {g.count} fois
                    </span>
                  )}
                </div>
                <span
                  role="button"
                  tabIndex={0}
                  aria-label="Supprimer la notification"
                  onClick={(e) => onDelete(e, g)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') onDelete(e as unknown as React.MouseEvent, g);
                  }}
                  className="opacity-0 group-hover:opacity-100 flex-shrink-0 inline-flex items-center justify-center w-6 h-6 text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/40 rounded transition-all cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </span>
                {!isRead && (
                  <Check className="hidden w-3.5 h-3.5 text-teal-600" aria-hidden />
                )}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
