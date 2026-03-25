import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Bell, X } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { ar as arLocale } from 'date-fns/locale';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useNotifications } from '@/hooks/use-notifications';
import { useLanguage } from '@/contexts/LanguageContext';
import type { AppNotification } from '@/services/apiClient';

export function NotificationBell() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { language } = useLanguage();
  const [open, setOpen] = useState(false);
  const { notifications, unreadCount, markRead, markAllRead, remove } = useNotifications();

  const handleClick = (n: AppNotification) => {
    if (!n.isRead) markRead([n.id]);
    setOpen(false);
    if (n.data?.projectId) {
      const url = n.data.dataPointId
        ? `/project/${n.data.projectId}?dp=${n.data.dataPointId}`
        : `/project/${n.data.projectId}`;
      navigate(url);
    }
  };

  const handleMarkAllRead = (e: React.MouseEvent) => {
    e.stopPropagation();
    markAllRead();
  };

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="relative" aria-label={t('notifications.title')}>
          <Bell className="h-4 w-4" />
          {unreadCount > 0 && (
            <span className="absolute -top-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-destructive text-[10px] font-bold text-destructive-foreground">
              {unreadCount > 9 ? '9+' : unreadCount}
            </span>
          )}
        </Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="w-80 p-0" onCloseAutoFocus={(e) => e.preventDefault()}>
        {/* Header */}
        <div className="flex items-center justify-between px-3 py-2 border-b">
          <span className="text-sm font-semibold">{t('notifications.title')}</span>
          {unreadCount > 0 && (
            <button
              className="text-xs text-muted-foreground hover:text-foreground transition-colors"
              onClick={handleMarkAllRead}
            >
              {t('notifications.markAllRead')}
            </button>
          )}
        </div>

        {/* Scrollable list */}
        <div className="overflow-y-auto max-h-[320px]">
          {notifications.length === 0 ? (
            <p className="px-3 py-8 text-center text-sm text-muted-foreground">
              {t('notifications.noNotifications')}
            </p>
          ) : (
            notifications.map((n, i) => (
              <NotificationRow
                key={n.id}
                notification={n}
                isLast={i === notifications.length - 1}
                language={language}
                onClick={() => handleClick(n)}
                onRemove={(e) => { e.stopPropagation(); remove(n.id); }}
              />
            ))
          )}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

interface RowProps {
  notification: AppNotification;
  isLast: boolean;
  language: string;
  onClick: () => void;
  onRemove: (e: React.MouseEvent) => void;
}

function NotificationRow({ notification: n, isLast, language, onClick, onRemove }: RowProps) {
  const { t } = useTranslation();
  return (
    <div className={!isLast ? 'border-b border-border/50' : ''}>
      <div
        role="button"
        tabIndex={0}
        onClick={onClick}
        onKeyDown={(e) => e.key === 'Enter' && onClick()}
        className={`group flex flex-col gap-0.5 px-3 py-2.5 cursor-pointer select-none hover:bg-accent transition-colors ${
          !n.isRead ? 'bg-muted/40' : ''
        }`}
      >
        <div className="flex w-full items-start justify-between gap-2">
          <span
            className={`text-xs font-medium leading-tight ${
              !n.isRead ? 'text-foreground' : 'text-muted-foreground'
            }`}
          >
            {!n.isRead && (
              <span className="inline-block w-1.5 h-1.5 rounded-full bg-primary mr-1.5 mb-0.5 align-middle" />
            )}
            {n.title}
          </span>
          <button
            aria-label={t('notifications.dismiss')}
            onClick={onRemove}
            className="shrink-0 opacity-0 group-hover:opacity-60 hover:!opacity-100 transition-opacity text-muted-foreground hover:text-foreground"
          >
            <X className="h-3 w-3" />
          </button>
        </div>
        <span className="text-xs text-muted-foreground leading-snug">{n.body}</span>
        <span className="text-[10px] text-muted-foreground/70 mt-0.5">
          {formatDistanceToNow(new Date(n.createdAt), {
            addSuffix: true,
            locale: language === 'ar' ? arLocale : undefined,
          })}
        </span>
      </div>
    </div>
  );
}
