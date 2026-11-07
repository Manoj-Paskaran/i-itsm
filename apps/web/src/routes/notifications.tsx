import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { Bell, CheckCheck, ChevronRight } from 'lucide-react';
import { useState } from 'react';
import { AppShell, relativeAgo } from '@/components/app-shell';
import { notificationRuns } from '@/lib/notification-presentation';
import { NotificationContent } from '@/components/notification-content';
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
  function openNotification(id: string, read: boolean, incidentId?: string) {
    if (!read) markRead.mutate(id);
    if (incidentId) void navigate({ to: '/incidents/$incidentId', params: { incidentId } });
  }
  return (
    <AppShell>
      <header className="border-b border-border">
        <div className="flex max-w-[860px] flex-wrap items-end justify-between gap-4 px-8 py-5 max-sm:px-4">
          <div>
            <h1 className="text-xl font-semibold">Notifications</h1>
          </div>
          <div className="flex flex-wrap items-stretch gap-2">
            <div
              role="group"
              aria-label="Show notifications"
              className="flex rounded-md border border-border p-0.5"
            >
              {[false, true].map((value) => (
                <button
                  key={String(value)}
                  aria-pressed={unreadOnly === value}
                  onClick={() => setUnreadOnly(value)}
                  className={`h-10 rounded px-3 text-sm ${unreadOnly === value ? 'bg-muted font-medium text-foreground ring-1 ring-inset ring-border-strong' : 'text-muted-foreground hover:bg-hover hover:text-foreground'}`}
                >
                  {value ? 'Unread' : 'All'}
                </button>
              ))}
            </div>
            <button
              disabled={!unread || markAll.isPending}
              onClick={() => markAll.mutate()}
              className="inline-flex min-h-10 items-center gap-2 rounded-md border border-border px-3 text-sm hover:bg-hover disabled:opacity-50"
            >
              <CheckCheck size={15} aria-hidden />
              {markAll.isPending ? 'Marking read…' : 'Mark all read'}
            </button>
          </div>
        </div>
      </header>
      <div className="max-w-[860px] space-y-4 px-8 py-5 max-sm:px-4">
        <p role="status" className="text-xs text-muted-foreground tabular">
          {notifications.isLoading
            ? 'Loading your notifications…'
            : notifications.isError
              ? 'Notifications could not update.'
              : `${unread ? `${unread} unread.` : 'You are all caught up.'} Showing up to the latest 50.`}
        </p>
        {(markAll.isError || markRead.isError) && (
          <p
            role="alert"
            className="rounded-md bg-critical-subtle p-3 text-sm text-critical-foreground"
          >
            Could not mark notifications as read. Try again.
          </p>
        )}
        {notifications.isError && (
          <div
            role="alert"
            className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border p-4"
          >
            <p className="text-sm text-critical-foreground">
              {notifications.data
                ? 'Showing the last loaded notifications. Try again for updates.'
                : 'Notifications could not load. Try again.'}
            </p>
            <button
              disabled={notifications.isFetching}
              onClick={() => void notifications.refetch()}
              className="min-h-10 rounded-md border border-border px-3 text-sm hover:bg-hover disabled:opacity-50"
            >
              {notifications.isFetching ? 'Retrying…' : 'Try again'}
            </button>
          </div>
        )}
        {notifications.isLoading ? (
          <div aria-label="Loading notifications" aria-busy="true" className="space-y-2">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-20 animate-pulse rounded-lg bg-muted" />
            ))}
          </div>
        ) : items.length ? (
          <ul
            className="divide-y divide-border overflow-hidden rounded-lg border border-border"
            aria-busy={notifications.isFetching}
          >
            {notificationRuns(items).map((run) => (
              <li key={run[0]!.id}>
                {run.length > 1 && (
                  <h2 className="border-b border-border bg-panel px-4 py-2 text-xs font-medium text-muted-foreground tabular">
                    {run[0]!.incident?.number} · {run.length} related updates
                  </h2>
                )}
                <ul className="divide-y divide-border">
                  {run.map((item) => (
                    <li key={item.id}>
                      <button
                        className={`flex w-full items-start gap-3 px-4 py-4 text-left hover:bg-hover focus-visible:-outline-offset-2 ${item.readAt ? '' : 'bg-primary-subtle/30'}`}
                        disabled={
                          !item.incident && markRead.isPending && markRead.variables === item.id
                        }
                        onClick={() => openNotification(item.id, !!item.readAt, item.incident?.id)}
                      >
                        <NotificationContent item={item} timeLabel={relativeAgo(item.createdAt)} />
                        {item.incident && (
                          <ChevronRight
                            size={16}
                            className="mt-0.5 shrink-0 text-muted-foreground"
                            aria-hidden
                          />
                        )}
                      </button>
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        ) : (
          !notifications.isError && (
            <div role="status" className="grid place-items-center gap-2 py-16 text-center">
              <Bell size={24} className="text-muted-foreground" aria-hidden />
              <p className="font-semibold">
                {unreadOnly ? 'No unread notifications' : 'No notifications yet'}
              </p>
              <p className="max-w-prose text-sm text-muted-foreground">
                Updates about your incidents appear here, including information requests and
                resolutions.
              </p>
              {unreadOnly && (
                <button
                  onClick={() => setUnreadOnly(false)}
                  className="min-h-10 px-3 text-sm font-medium underline underline-offset-4 hover:text-muted-foreground"
                >
                  View all notifications
                </button>
              )}
            </div>
          )
        )}
      </div>
    </AppShell>
  );
}
