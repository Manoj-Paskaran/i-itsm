import type { AuthUser } from '@itsm/contracts';
import { ApiError } from './api';

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
  if (form.title.trim().length < 3) errors.title = 'Use at least 3 characters for the title.';
  else if (form.title.trim().length > 200)
    errors.title = 'Keep the title to 200 characters or fewer.';
  if (form.description.trim().length < 10)
    errors.description = 'Describe what happens in at least 10 characters.';
  else if (form.description.trim().length > 5000)
    errors.description = 'Keep the description to 5,000 characters or fewer.';
  if (!form.serviceId) errors.serviceId = 'Choose the affected service.';
  if (!form.impact) errors.impact = 'Choose how badly work is affected.';
  if (!form.urgency) errors.urgency = 'Choose how soon it needs fixing.';
  const users = Number(form.affectedUsers);
  if (!Number.isInteger(users) || users < 1 || users > 1_000_000)
    errors.affectedUsers = 'Enter a whole number from 1 to 1,000,000.';
  return errors;
}

/** The home list is the same queue, named for what each role sees in it. */
export function homeLabel(user: Pick<AuthUser, 'role' | 'permissions'> | null) {
  if (user?.role === 'EMPLOYEE') return 'My incidents';
  if (user?.permissions.includes('INCIDENT_VIEW_ALL')) return 'All incidents';
  return 'My work';
}

/** The reporter's own open incident behind a DUPLICATE_INCIDENT rejection, to link to it. */
export function duplicateOf(error: unknown): { id: string; number: string | null } | null {
  if (!(error instanceof ApiError) || error.code !== 'DUPLICATE_INCIDENT') return null;
  const { existingIncidentId: id, existingNumber: number } = error.details;
  if (typeof id !== 'string') return null;
  return { id, number: typeof number === 'string' ? number : null };
}
