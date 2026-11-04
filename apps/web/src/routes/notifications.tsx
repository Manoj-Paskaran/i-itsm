import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { Bell, CheckCheck } from 'lucide-react';
import { useState } from 'react';
import { AppShell, relativeAgo } from '@/components/app-shell';
import { useMarkAllRead, useMarkRead, useNotifications } from '@/lib/notifications';

export const Route = createFileRoute('/notifications')({ component: Inbox });

function Inbox() {
  const notifications = useNotifications();
  const markRead = useMarkRead();
  const markAll = useMarkAllRead();
  const navigate = useNavigate();
  const [unreadOnly, setUnreadOnly] = useState(false);
  const items = (notifications.data?.items ?? []).filter((n) => !unreadOnly || !n.readAt);
  const unread = notifications.data?.unread ?? 0;
  return (
    <AppShell>
      <header className="flex flex-wrap items-end justify-between gap-3 border-b border-border px-8 pt-5 pb-4 max-sm:px-4">
        <div>
          <h1 className="text-xl font-semibold">Notifications</h1>
          <p className="text-sm text-muted-foreground tabular">
            {unread ? `${unread} unread` : 'You are all caught up.'} Showing the latest 50.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div
            role="group"
            aria-label="Show"
            className="flex rounded-md border border-border p-0.5"
          >
            {[false, true].map((value) => (
              <button
                key={String(value)}
                aria-pressed={unreadOnly === value}
                onClick={() => setUnreadOnly(value)}
                className={`h-7 rounded px-2.5 text-xs ${unreadOnly === value ? 'bg-muted font-medium' : 'text-muted-foreground hover:text-foreground'}`}
              >
                {value ? 'Unread' : 'All'}
              </button>
            ))}
          </div>
          <button
            disabled={!unread || markAll.isPending}
            onClick={() => markAll.mutate()}
            className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border px-3 text-sm hover:bg-hover disabled:opacity-50"
          >
            <CheckCheck size={14} aria-hidden />
            Mark all read
          </button>
        </div>
      </header>
      <div className="mx-auto max-w-[860px] px-8 py-5 max-sm:px-4">
        {notifications.isLoading ? (
          <div className="space-y-2">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-14 animate-pulse rounded-lg bg-muted" />
            ))}
          </div>
        ) : notifications.isError ? (
          <p className="text-critical-foreground">Notifications could not load.</p>
        ) : items.length ? (
          <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border">
            {items.map((item) => (
              <li key={item.id}>
                <button
                  className={`flex w-full gap-3 px-4 py-3 text-left hover:bg-hover ${item.readAt ? '' : 'bg-primary-subtle/40'}`}
                  onClick={() => {
                    if (!item.readAt) markRead.mutate(item.id);
                    if (item.incident)
                      void navigate({
                        to: '/incidents/$incidentId',
                        params: { incidentId: item.incident.id },
                      });
                  }}
                >
                  <span
                    aria-label={item.readAt ? undefined : 'Unread'}
                    className={`mt-1.5 size-2 shrink-0 rounded-full ${item.readAt ? '' : 'bg-primary'}`}
                  />
                  <span className="min-w-0 flex-1">
                    <span className={`block text-sm ${item.readAt ? '' : 'font-semibold'}`}>
                      {item.title}
                    </span>
                    <span className="block text-sm text-muted-foreground">{item.body}</span>
                  </span>
                  <span className="shrink-0 text-xs text-muted-foreground tabular">
                    {item.incident && <span className="mr-2">{item.incident.number}</span>}
                    {relativeAgo(item.createdAt)}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <div className="grid place-items-center gap-2 py-16 text-center">
            <Bell size={20} className="text-muted-foreground" aria-hidden />
            <p className="font-medium">
              {unreadOnly ? 'No unread notifications' : 'No notifications yet'}
            </p>
            <p className="text-xs text-muted-foreground">
              You will hear about assignments, information requests and SLA warnings here.
            </p>
          </div>
        )}
      </div>
    </AppShell>
  );
}
