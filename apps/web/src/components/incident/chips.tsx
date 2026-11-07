import type { IncidentDetail, SlaRisk } from '@itsm/contracts';
import {
  AlarmClock,
  AlarmClockOff,
  Archive,
  BadgeCheck,
  CircleCheck,
  CircleDot,
  CirclePlay,
  Eye,
  Gauge,
  MessageCircleQuestion,
  Pause,
  RotateCcw,
  TriangleAlert,
  UserCheck,
} from 'lucide-react';
import { PRIORITY_LABEL, STATUS_LABEL, statusGroup } from '@/lib/incidents';
import { riskExplanation, riskLabel } from '@/lib/insights';

/** Quiet outline chip for facts that are not state (service, category). */
export const chip =
  'inline-flex h-6 items-center gap-1.5 rounded-md border border-border bg-background px-2 text-xs font-medium';
const pill = 'inline-flex items-center gap-1.5 rounded-full font-semibold';

const PRIORITY_STYLE = {
  P1: 'bg-fill-critical text-fill-foreground border-transparent',
  P2: 'bg-high-subtle text-high-foreground border-transparent',
  P3: 'bg-warning-subtle text-warning-foreground border-transparent',
  P4: 'bg-low-subtle text-low-foreground border-transparent',
} as const;
const PRIORITY_LEVEL = { P2: 3, P3: 2, P4: 1 } as const;

function PriorityBars({ level }: { level: 1 | 2 | 3 }) {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden className="shrink-0">
      {[0, 1, 2].map((i) => (
        <rect
          key={i}
          x={1 + i * 4}
          y={8 - i * 3}
          width="2.5"
          height={3 + i * 3}
          rx="0.75"
          fill="currentColor"
          opacity={i < level ? 1 : 0.3}
        />
      ))}
    </svg>
  );
}

/** Every priority has colour; only P1 is a solid fill. */
export function PriorityChip({ priority }: { priority: IncidentDetail['priority'] }) {
  if (!priority) return <span className={`${chip} text-muted-foreground`}>Not prioritised</span>;
  return (
    <span
      className={`${chip} ${PRIORITY_STYLE[priority]} ${priority === 'P1' ? 'font-semibold tracking-[0.02em]' : ''}`}
    >
      {priority === 'P1' ? (
        <TriangleAlert size={14} strokeWidth={2} aria-hidden />
      ) : (
        <PriorityBars level={PRIORITY_LEVEL[priority]} />
      )}
      {priority === 'P1' ? 'P1 · CRITICAL' : `${priority} · ${PRIORITY_LABEL[priority]}`}
    </span>
  );
}

export const STATUS_ICON = {
  NEW: CircleDot,
  CLASSIFIED: CircleDot,
  ASSIGNED: UserCheck,
  ACKNOWLEDGED: Eye,
  IN_PROGRESS: CirclePlay,
  PENDING_INFO: MessageCircleQuestion,
  RESOLVED: CircleCheck,
  VERIFIED: BadgeCheck,
  CLOSED: Archive,
  REOPENED: RotateCcw,
};
export const STATUS_FILL = {
  active: 'bg-fill-active',
  waiting: 'bg-fill-waiting',
  done: 'bg-fill-done',
};
const SMALL_FILL = {
  active: 'bg-primary-subtle text-primary-subtle-foreground',
  waiting: 'bg-warning-subtle text-warning-foreground',
  done: 'bg-muted text-muted-foreground',
};
export const STATUS_TEXT = {
  active: 'text-primary',
  waiting: 'text-warning-foreground',
  done: 'text-muted-foreground',
};

/** Filled in the header; tinted in the activity and audit history. */
export function StatusPill({
  status,
  duplicate = false,
  small = false,
}: {
  status: IncidentDetail['status'];
  duplicate?: boolean;
  small?: boolean;
}) {
  const Icon = STATUS_ICON[status];
  const group = statusGroup(status);
  return (
    <span
      className={`${pill} ${small ? `h-5 px-2 text-2xs ${SMALL_FILL[group]}` : `h-6 px-2.5 text-xs ${STATUS_FILL[group]} text-fill-foreground`}`}
    >
      <Icon size={small ? 12 : 14} strokeWidth={2} aria-hidden />
      {duplicate && status === 'CLOSED' ? 'Closed as duplicate' : STATUS_LABEL[status]}
    </span>
  );
}

const SLA_STYLE = {
  ON_TRACK: ['SLA on track', CircleCheck, 'bg-fill-success'],
  AT_RISK: ['SLA at risk', AlarmClock, 'bg-fill-waiting'],
  BREACHED: ['SLA breached', AlarmClockOff, 'bg-fill-critical'],
  MET: ['SLA met', CircleCheck, 'bg-fill-success'],
  PAUSED: ['SLA paused', Pause, 'bg-fill-done'],
} as const;

export function SlaPill({ status }: { status: NonNullable<IncidentDetail['slaStatus']> }) {
  const [label, Icon, fill] = SLA_STYLE[status];
  return (
    <span className={`${pill} h-6 px-2.5 text-xs ${fill} text-fill-foreground`}>
      <Icon size={14} strokeWidth={2} aria-hidden />
      {label}
    </span>
  );
}

const RISK_TONE = {
  HIGH: 'border-transparent bg-critical-subtle text-critical-foreground',
  MEDIUM: 'border-transparent bg-warning-subtle text-warning-foreground',
  LOW: 'text-muted-foreground',
} as const;
/** IF-E advisory badge: outlined like a chip, not filled like the SLA pill, because it is a guess. */
export function RiskBadge({ risk }: { risk: SlaRisk }) {
  return (
    <span className={`${chip} ${RISK_TONE[risk.level]}`} title={riskExplanation(risk)}>
      <Gauge size={14} strokeWidth={2} aria-hidden />
      {riskLabel(risk)}
    </span>
  );
}
