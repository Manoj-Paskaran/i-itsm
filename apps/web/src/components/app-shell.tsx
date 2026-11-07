import * as Popover from '@radix-ui/react-popover';
import { Link, useNavigate, useRouterState } from '@tanstack/react-router';
import {
  AlarmClock,
  Bell,
  ChartColumn,
  CirclePlus,
  History,
  Inbox,
  LifeBuoy,
  LogOut,
  Moon,
  Settings,
  Sun,
} from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
import { ROLES } from '@/lib/admin-forms';
import { useAuth } from '@/lib/auth';
import { navItems } from '@/lib/staff';
import { useMarkAllRead, useMarkRead, useNotifications } from '@/lib/notifications';
import { useRealtime } from '@/lib/realtime';
import { useTheme } from '@/lib/theme';
import { notificationRuns } from '@/lib/notification-presentation';
import { NotificationContent } from './notification-content';

export function initials(name: string) {
  return name
    .split(' ')
    .map((part) => part[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
}
const NAV_ICONS = {
  '/': Inbox,
  '/report': CirclePlus,
  '/monitor': AlarmClock,
  '/reports': ChartColumn,
  '/audit': History,
  '/admin': Settings,
};
export function relativeAgo(value: string) {
  const minutes = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 60000));
  return minutes < 1
    ? 'just now'
    : minutes < 60
      ? `${minutes}m ago`
      : minutes < 1440
        ? `${Math.floor(minutes / 60)}h ago`
        : `${Math.floor(minutes / 1440)}d ago`;
}
export function AppShell({ children }: { children: ReactNode }) {
  const auth = useAuth();
  const { connected } = useRealtime();
  const { theme, setTheme } = useTheme();
  const href = useRouterState({ select: (s) => s.location.href });
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [isDesktop, setIsDesktop] = useState(
    () => window.matchMedia('(min-width: 1024px)').matches,
  );
  const notifications = useNotifications();
  const markRead = useMarkRead();
  const markAll = useMarkAllRead();
  useEffect(() => {
    const media = window.matchMedia('(min-width: 1024px)');
    const update = () => setIsDesktop(media.matches);
    update();
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);
  useEffect(() => {
    if (auth.status === 'anonymous')
      void navigate({ to: '/login', search: { redirect: href }, replace: true });
    // Redirect once per sign-out, not on every router state change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auth.status]);
  if (auth.status !== 'authenticated')
    return (
      <div className="grid min-h-screen place-items-center text-sm text-muted-foreground">
        Loading…
      </div>
    );
  return (
    <div className="grid h-screen grid-cols-[232px_minmax(0,1fr)] max-lg:grid-cols-[minmax(0,1fr)] max-lg:grid-rows-[auto_1fr]">
      <aside className="flex min-w-0 flex-col border-r border-border bg-sidebar p-3 max-lg:h-12 max-lg:flex-row max-lg:items-center max-lg:gap-3 max-lg:border-r-0 max-lg:border-b max-lg:py-1 max-sm:gap-1 max-sm:px-2">
        <div className="flex shrink-0 items-center gap-2">
          <span className="grid size-5 place-items-center rounded-md bg-foreground text-background">
            <LifeBuoy size={12} aria-hidden />
          </span>
          <span className="text-sm font-semibold whitespace-nowrap max-sm:sr-only">I-ITSM</span>
          <span
            title={connected ? 'Connected to realtime updates' : 'Realtime updates offline'}
            className="ml-auto flex items-center gap-1 text-2xs text-muted-foreground max-lg:hidden"
          >
            <span
              className={`size-1.5 rounded-full ${connected ? 'bg-success' : 'bg-neutral-dot'}`}
            />
            {connected ? 'Live' : 'Offline'}
          </span>
        </div>
        <nav
          aria-label="Primary"
          className="mt-4 flex flex-col gap-0.5 max-lg:mt-0 max-lg:min-w-0 max-lg:flex-1 max-lg:flex-row max-lg:overflow-x-auto max-sm:gap-0"
        >
          {navItems(auth.user).map((item) => {
            const Icon = NAV_ICONS[item.to];
            return (
              <Link
                key={item.to}
                to={item.to}
                activeOptions={{ exact: item.to === '/' }}
                className="flex h-8 shrink-0 items-center gap-2 rounded-md px-2 text-sm text-sidebar-foreground hover:bg-hover max-lg:h-10 max-lg:min-w-10 max-lg:px-2.5 max-lg:focus-visible:-outline-offset-2"
                activeProps={{ className: 'bg-hover text-foreground font-medium' }}
              >
                <Icon size={16} strokeWidth={1.75} aria-hidden />
                <span className="whitespace-nowrap max-sm:sr-only">{item.label}</span>
              </Link>
            );
          })}
          <Popover.Root open={open} onOpenChange={setOpen}>
            <Popover.Trigger asChild>
              <button className="flex h-8 shrink-0 items-center gap-2 rounded-md px-2 text-sm text-sidebar-foreground hover:bg-hover max-lg:h-10 max-lg:min-w-10 max-lg:px-2.5 max-lg:focus-visible:-outline-offset-2 max-sm:relative">
                <Bell size={16} strokeWidth={1.75} aria-hidden />
                <span className="whitespace-nowrap max-sm:sr-only">Notifications</span>
                {(notifications.data?.unread ?? 0) > 0 && (
                  <span className="ml-auto grid h-5 min-w-5 place-items-center rounded-full bg-foreground px-1.5 text-2xs text-background tabular max-sm:absolute max-sm:top-0.5 max-sm:right-0.5 max-sm:ml-0 max-sm:h-4 max-sm:min-w-4 max-sm:px-1">
                    {notifications.data?.unread}
                  </span>
                )}
              </button>
            </Popover.Trigger>
            <Popover.Portal>
              <Popover.Content
                side={isDesktop ? 'right' : 'bottom'}
                align="start"
                sideOffset={8}
                collisionPadding={8}
                className="z-50 max-h-[440px] w-[360px] max-w-[calc(100vw_-_1rem)] overflow-auto rounded-lg border border-border bg-card shadow-pop"
              >
                <div className="flex items-center justify-between border-b border-border p-3">
                  <span className="text-sm font-semibold">Notifications</span>
                  {!!notifications.data?.unread && (
                    <button
                      className="text-xs text-primary max-sm:inline-flex max-sm:min-h-10 max-sm:items-center max-sm:px-2"
                      onClick={() => markAll.mutate()}
                    >
                      Mark all read
                    </button>
                  )}
                </div>
                {notifications.isLoading ? (
                  <div className="space-y-3 p-4">
                    {[1, 2, 3].map((i) => (
                      <div key={i} className="h-10 animate-pulse rounded bg-muted" />
                    ))}
                  </div>
                ) : notifications.data?.items.length ? (
                  notificationRuns(notifications.data.items).map((run) => (
                    <div key={run[0]!.id}>
                      {run.length > 1 && (
                        <p className="border-b border-border bg-panel px-3 py-2 text-2xs font-medium text-muted-foreground tabular">
                          {run[0]!.incident?.number} · {run.length} related updates
                        </p>
                      )}
                      {run.map((item) => (
                        <button
                          key={item.id}
                          className={`flex w-full gap-3 border-b border-border p-3 text-left hover:bg-hover focus-visible:-outline-offset-2 ${item.readAt ? '' : 'bg-primary-subtle/30'}`}
                          onClick={() => {
                            if (!item.readAt) markRead.mutate(item.id);
                            if (item.incident) {
                              void navigate({
                                to: '/incidents/$incidentId',
                                params: { incidentId: item.incident.id },
                              });
                              setOpen(false);
                            }
                          }}
                        >
                          <NotificationContent
                            item={item}
                            compact
                            timeLabel={relativeAgo(item.createdAt)}
                          />
                        </button>
                      ))}
                    </div>
                  ))
                ) : (
                  <p className="p-4 text-xs text-muted-foreground">
                    No notifications yet. You will hear about assignments, information requests and
                    SLA warnings here.
                  </p>
                )}
                <Link
                  to="/notifications"
                  onClick={() => setOpen(false)}
                  className="block p-3 text-center text-xs font-medium text-primary hover:bg-hover"
                >
                  View all notifications
                </Link>
              </Popover.Content>
            </Popover.Portal>
          </Popover.Root>
        </nav>
        <div className="mt-auto shrink-0 max-lg:mt-0 max-lg:ml-auto">
          <div
            role="radiogroup"
            aria-label="Theme"
            className="flex h-7 rounded-md bg-muted p-0.5 max-lg:hidden"
          >
            {(['light', 'dark'] as const).map((option) => {
              const Icon = option === 'light' ? Sun : Moon;
              return (
                <button
                  key={option}
                  role="radio"
                  aria-checked={theme === option}
                  onClick={() => setTheme(option)}
                  className={`flex flex-1 items-center justify-center gap-1 rounded px-2 text-xs ${theme === option ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground'}`}
                >
                  <Icon size={14} aria-hidden />
                  {option === 'light' ? 'Light' : 'Dark'}
                </button>
              );
            })}
          </div>
          <button
            className="hidden rounded-md hover:bg-hover max-lg:grid max-lg:size-10 max-lg:place-items-center"
            aria-label="Toggle theme"
            onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')}
          >
            {theme === 'light' ? <Moon size={16} /> : <Sun size={16} />}
          </button>
        </div>
        <div className="mt-3 flex shrink-0 items-center gap-2 max-lg:mt-0">
          <span className="grid size-7 shrink-0 place-items-center rounded-full bg-muted text-2xs font-semibold text-foreground max-sm:hidden">
            {initials(auth.user!.name)}
          </span>
          <div className="min-w-0 flex-1 max-lg:hidden">
            <div className="truncate text-sm font-medium">{auth.user!.name}</div>
            <div className="text-2xs text-muted-foreground">
              {ROLES.find((role) => role.value === auth.user!.role)?.label}
            </div>
          </div>
          <button
            aria-label="Sign out"
            className="rounded-md p-1.5 hover:bg-hover max-lg:grid max-lg:size-10 max-lg:place-items-center"
            onClick={() => void auth.logout()}
          >
            <LogOut size={16} strokeWidth={1.75} aria-hidden />
          </button>
        </div>
      </aside>
      <main className="min-w-0 overflow-y-auto">{children}</main>
    </div>
  );
}
