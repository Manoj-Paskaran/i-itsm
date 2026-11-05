import type { IncidentDetail, SlaRisk } from '@itsm/contracts';
import {
  AlarmClock,
  AlarmClockOff,
  Archive,
  BadgeCheck,
  CircleCheck,
  CircleDot,
  Eye,
  Gauge,
  Loader,
  MessageCircleQuestion,
  Pause,
  RotateCcw,
  SignalHigh,
  SignalLow,
  SignalMedium,
  TriangleAlert,
  UserCheck,
} from 'lucide-react';
import { PRIORITY_LABEL, STATUS_LABEL, statusGroup } from '@/lib/incidents';
import { riskExplanation, riskLabel } from '@/lib/insights';

/** Quiet outline chip for facts that are not state (service, category). */
export const chip =
  'inline-flex h-6 items-center gap-1.5 rounded-md border border-border bg-background px-2 text-xs font-medium';
const pill =
  'inline-flex h-6 items-center gap-1.5 rounded-full px-2.5 text-xs font-semibold text-fill-foreground';

const PRIORITY_STYLE = {
  P1: ['bg-fill-critical text-fill-foreground border-transparent', TriangleAlert],
  P2: ['bg-high-subtle text-high-foreground border-transparent', SignalHigh],
  P3: ['bg-warning-subtle text-warning-foreground border-transparent', SignalMedium],
  P4: ['bg-low-subtle text-low-foreground border-transparent', SignalLow],
} as const;

/** Every priority has colour; only P1 is a solid fill. */
export function PriorityChip({ priority }: { priority: IncidentDetail['priority'] }) {
  if (!priority) return <span className={`${chip} text-muted-foreground`}>Not prioritised</span>;
  const [style, Icon] = PRIORITY_STYLE[priority];
  return (
    <span
      className={`${chip} ${style} ${priority === 'P1' ? 'font-semibold tracking-[0.02em]' : ''}`}
    >
      <Icon size={14} strokeWidth={2} aria-hidden />
      {priority === 'P1' ? 'P1 · CRITICAL' : `${priority} · ${PRIORITY_LABEL[priority]}`}
    </span>
  );
}

export const STATUS_ICON = {
  NEW: CircleDot,
  CLASSIFIED: CircleDot,
  ASSIGNED: UserCheck,
  ACKNOWLEDGED: Eye,
  IN_PROGRESS: Loader,
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
export const STATUS_TEXT = {
  active: 'text-primary',
  waiting: 'text-warning-foreground',
  done: 'text-muted-foreground',
};

/** GitHub-shaped filled pill: cobalt while active, amber while waiting, slate when done. */
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
  return (
    <span
      className={`${pill} ${STATUS_FILL[statusGroup(status)]} ${small ? 'h-5 px-2 text-2xs' : ''}`}
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
    <span className={`${pill} ${fill}`}>
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
