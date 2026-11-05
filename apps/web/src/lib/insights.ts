import {
  IncidentInsightsSchema,
  SimilarIncidentSchema,
  type CorrelationCluster,
  type IncidentDetail,
  type SimilarityRequest,
  type SlaRisk,
  SlaRiskEntrySchema,
} from '@itsm/contracts';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { apiFetch } from './api';
import { useAuth } from './auth';
import type { ReportForm } from './report';

const CLOSED_STATES: readonly IncidentDetail['status'][] = ['RESOLVED', 'VERIFIED', 'CLOSED'];

/** Insights help someone still working the incident; once it is resolved they are noise. */
export function showsInsights(status: IncidentDetail['status']) {
  return !CLOSED_STATES.includes(status);
}

/** The banner states the evidence (count, service, window) and then the advisory conclusion. */
export function clusterHeadline(cluster: CorrelationCluster) {
  return `${cluster.reason.replace(' with similar text', '')} — likely common cause`;
}

/** "Is this already reported?" only asks once there is enough to compare: a title and a service. */
export function similarityQuery(
  form: Pick<ReportForm, 'title' | 'description' | 'serviceId'>,
): SimilarityRequest | null {
  const title = form.title.trim();
  if (title.length < 3 || !form.serviceId) return null;
  return { title, description: form.description.trim(), serviceId: form.serviceId };
}

/** Returns `value` only after it has stopped changing for `ms`, so typing sends one request. */
export function useDebounced<T>(value: T, ms = 500) {
  const [settled, setSettled] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setSettled(value), ms);
    return () => clearTimeout(timer);
  }, [value, ms]);
  return settled;
}

export function useIncidentInsights(id: string, enabled: boolean) {
  return useQuery({
    enabled,
    queryKey: ['incident-insights', id],
    queryFn: () => apiFetch(`/api/incidents/${id}/insights`, IncidentInsightsSchema),
    staleTime: 30000,
  });
}

export function useSimilarCheck(request: SimilarityRequest | null) {
  return useQuery({
    enabled: !!request,
    queryKey: ['similar-check', request],
    queryFn: () =>
      apiFetch('/api/incidents/similar', SimilarIncidentSchema.array(), {
        method: 'POST',
        body: JSON.stringify(request),
      }),
    placeholderData: (previous) => previous,
    staleTime: 30000,
  });
}

/** Staff working an open incident get insights; the reporter's view stays simple. */
export function useWorkspaceInsights(detail: IncidentDetail) {
  const { user } = useAuth();
  const staff = !!user?.permissions.some(
    (p) => p === 'INCIDENT_VIEW_ALL' || p === 'INCIDENT_VIEW_ASSIGNED',
  );
  const enabled = staff && showsInsights(detail.status);
  const query = useIncidentInsights(detail.id, enabled);
  // A disabled query still returns cached data; hide it once the incident is resolved or closed.
  return enabled ? query.data : undefined;
}

const RISK_LEVEL = { LOW: 'Low', MEDIUM: 'Medium', HIGH: 'High' } as const;
/** "Resolution risk 82% · High": the number first, then the level it maps to. */
export function riskLabel(risk: Pick<SlaRisk, 'probability' | 'level'>) {
  return `Resolution risk ${Math.round(risk.probability * 100)}% · ${RISK_LEVEL[risk.level]}`;
}
/** Tooltip: the reasons behind the estimate and who produced it. */
export function riskExplanation(risk: SlaRisk) {
  const by = risk.source === 'model' ? 'ML model' : 'rules';
  return `Suggestion · advisory (${by}): ${risk.reasons.join(', ')}`;
}

/** Risk for every open incident the viewer may see, keyed by incident id (SLA monitor). */
export function useSlaRisks() {
  return useQuery({
    queryKey: ['sla-risk'],
    queryFn: async () =>
      new Map(
        (await apiFetch('/api/incidents/sla-risk', SlaRiskEntrySchema.array())).map((r) => [
          r.incidentId,
          r.risk,
        ]),
      ),
    refetchInterval: 30000,
  });
}
