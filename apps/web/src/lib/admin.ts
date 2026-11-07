import {
  AdminCategorySchema,
  AdminServiceSchema,
  AdminUserSchema,
  AuditLogEntrySchema,
  SlaPolicyViewSchema,
  StrategySettingsSchema,
} from '@itsm/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from './api';

export const useAudit = (search: string) =>
  useQuery({
    queryKey: ['audit', search],
    queryFn: () => apiFetch(`/api/audit?${search}`, AuditLogEntrySchema.array()),
    placeholderData: (previous) => previous,
  });
const configQuery = <T>(kind: string, schema: { parse: (v: unknown) => T }) => ({
  queryKey: ['admin', kind],
  queryFn: () => apiFetch(`/api/admin/${kind}`, schema),
});
export const useAdminUsers = () => useQuery(configQuery('users', AdminUserSchema.array()));
export const useAdminServices = () => useQuery(configQuery('services', AdminServiceSchema.array()));
export const useAdminCategories = () =>
  useQuery(configQuery('categories', AdminCategorySchema.array()));
export const useSlaPolicies = () =>
  useQuery(configQuery('sla-policies', SlaPolicyViewSchema.array()));
export const useStrategies = () =>
  useQuery({
    queryKey: ['admin', 'strategies'],
    queryFn: () => apiFetch('/api/admin/strategies', StrategySettingsSchema),
  });
export function useAdminWrite() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({
      path,
      method,
      body,
    }: {
      path: string;
      method: 'POST' | 'PUT' | 'PATCH';
      body: object;
    }) => apiFetch(path, { parse: (v: unknown) => v }, { method, body: JSON.stringify(body) }),
    // Strategy, capacity and availability changes also change who gets suggested;
    // new services and technicians must show in the report form and assignee filter.
    onSuccess: () =>
      Promise.all(
        ['admin', 'recommendations', 'technicians', 'services'].map((key) =>
          client.invalidateQueries({ queryKey: [key] }),
        ),
      ),
  });
}

/** Strategy ids read as words: "impact-urgency-matrix" → "Impact urgency matrix". */
export function strategyLabel(id: string) {
  const words = id.replace(/-/g, ' ');
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/** Audit event names use sentence case while keeping SLA uppercase. */
export function auditActionLabel(action: string) {
  const words = action
    .replace(/([A-Z])([A-Z][a-z])/g, '$1 $2')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .toLowerCase()
    .replace(/\bsla\b/g, 'SLA');
  return words.charAt(0).toUpperCase() + words.slice(1);
}

export function auditSearch(filters: {
  action?: string;
  from?: string;
  to?: string;
  incidentId?: string;
  actorId?: string;
}) {
  const params = new URLSearchParams({ limit: '200' });
  if (filters.action) params.set('action', filters.action);
  if (filters.incidentId) params.set('incidentId', filters.incidentId);
  if (filters.actorId) params.set('actorId', filters.actorId);
  // The picker gives local calendar days; send the local day's start and end so the table's
  // local times line up with the filter.
  const day = /^\d{4}-\d{2}-\d{2}$/;
  if (filters.from)
    params.set(
      'from',
      day.test(filters.from) ? new Date(`${filters.from}T00:00:00`).toISOString() : filters.from,
    );
  if (filters.to)
    params.set(
      'to',
      day.test(filters.to) ? new Date(`${filters.to}T23:59:59.999`).toISOString() : filters.to,
    );
  return params.toString();
}

const UUID = /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi;
/** The global audit search returns raw ids in descriptions; show the names we know instead. */
export const labelIds = (text: string, labels: ReadonlyMap<string, string>) =>
  text.replace(UUID, (id) => labels.get(id.toLowerCase()) ?? id);
