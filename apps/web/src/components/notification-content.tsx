import type { Notification } from '@itsm/contracts';
import {
  AlarmClock,
  AlarmClockOff,
  ArrowUpRight,
  Bell,
  CheckCheck,
  MessageSquare,
  UserRoundCheck,
} from 'lucide-react';
import { notificationKind, notificationText } from '@/lib/notification-presentation';
const TYPES = {
  breach: {
    icon: AlarmClockOff,
    label: 'SLA breached',
    tone: 'bg-critical-subtle text-critical-foreground',
  },
  warning: {
    icon: AlarmClock,
    label: 'SLA at risk',
    tone: 'bg-warning-subtle text-warning-foreground',
  },
  assignment: {
    icon: UserRoundCheck,
    label: 'Assignment',
    tone: 'bg-primary-subtle text-primary-subtle-foreground',
  },
  escalation: {
    icon: ArrowUpRight,
    label: 'Escalation',
    tone: 'bg-high-subtle text-high-foreground',
  },
  request: { icon: MessageSquare, label: 'Information request', tone: 'bg-muted text-foreground' },
  resolved: { icon: CheckCheck, label: 'Resolution', tone: 'bg-muted text-foreground' },
  update: { icon: Bell, label: 'Update', tone: 'bg-muted text-muted-foreground' },
};
/** Shared anatomy for the bell and inbox; only the preview body is truncated. */
export function NotificationContent({
  item,
  timeLabel,
  compact = false,
}: {
  item: Notification;
  timeLabel: string;
  compact?: boolean;
}) {
  const style = TYPES[notificationKind(item.eventType)];
  const Icon = style.icon;
  return (
    <>
      <span
        aria-hidden
        className={`grid size-8 shrink-0 place-items-center rounded-md ${style.tone}`}
      >
        <Icon size={17} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="mb-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-2xs text-muted-foreground">
          <span
            className={style.tone
              .split(' ')
              .filter((c) => c.startsWith('text-'))
              .join(' ')}
          >
            {style.label}
          </span>
          {!item.readAt && (
            <span className="rounded bg-primary-subtle px-1.5 font-semibold text-primary-subtle-foreground">
              Unread
            </span>
          )}
        </span>
        <span
          className={`block text-sm break-words ${item.readAt ? 'font-normal text-muted-foreground' : 'font-semibold text-foreground'}`}
        >
          {notificationText(item.title)}
        </span>
        <span
          className={`mt-1 block text-xs text-muted-foreground break-words ${compact ? 'line-clamp-2' : ''}`}
        >
          {notificationText(item.body)}
        </span>
        <span className="mt-2 flex flex-wrap gap-x-2 text-2xs text-muted-foreground tabular">
          {item.incident && !item.title.includes(item.incident.number) && (
            <span>{item.incident.number}</span>
          )}
          <time dateTime={item.createdAt} title={new Date(item.createdAt).toLocaleString()}>
            {timeLabel}
          </time>
        </span>
      </span>
    </>
  );
}
