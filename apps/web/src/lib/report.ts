import type { AuthUser } from '@itsm/contracts';

/** Impact and urgency asked as plain questions; values are the API's 1–4 levels. */
export const IMPACT_OPTIONS = [
  { value: 1, label: 'A small annoyance', hint: 'I can still work normally' },
  { value: 2, label: 'Some work is slowed down', hint: 'There is a workaround' },
  { value: 3, label: 'Important work is blocked', hint: 'No workaround for me or my team' },
  { value: 4, label: 'The business has stopped', hint: 'e.g. customers cannot pay' },
] as const;
export const URGENCY_OPTIONS = [
  { value: 1, label: 'Whenever someone is free' },
  { value: 2, label: 'Today' },
  { value: 3, label: 'Within the next few hours' },
  { value: 4, label: 'Right now' },
] as const;

export interface ReportForm {
  title: string;
  description: string;
  serviceId: string;
  impact: number | null;
  urgency: number | null;
  affectedUsers: string;
}

/** Mirrors CreateIncidentRequestSchema so the reporter sees the problem before submitting. */
export function reportErrors(form: ReportForm) {
  const errors: Partial<Record<keyof ReportForm, string>> = {};
  if (form.title.trim().length < 3) errors.title = 'Give the problem a short title.';
  if (form.description.trim().length < 10)
    errors.description = 'Describe what happens in a sentence or two.';
  if (!form.serviceId) errors.serviceId = 'Choose the affected service.';
  if (!form.impact) errors.impact = 'Choose how badly work is affected.';
  if (!form.urgency) errors.urgency = 'Choose how soon it needs fixing.';
  const users = Number(form.affectedUsers);
  if (!Number.isInteger(users) || users < 1 || users > 1_000_000)
    errors.affectedUsers = 'Enter a whole number of people, at least 1.';
  return errors;
}

/** The home list is the same queue, named for what each role sees in it. */
export function homeLabel(user: Pick<AuthUser, 'role' | 'permissions'> | null) {
  if (user?.role === 'EMPLOYEE') return 'My incidents';
  if (user?.permissions.includes('INCIDENT_VIEW_ALL')) return 'All incidents';
  return 'My work';
}
