import type { Incident } from '../../domain/incidents/index.js';
import { SlaRiskPolicy, type SlaRiskEstimate } from '../../domain/intelligence/index.js';
import type {
  CandidateFilter,
  IncidentMatch,
  IncidentRepository,
  IncidentText,
  IntelligencePort,
  SlaRiskContext,
  Sourced,
} from '../../ports/index.js';

/** Cosine similarity of sentence embeddings above which two incidents read as the same problem. */
export const MODEL_SIMILARITY_THRESHOLD = 0.6;
const TIMEOUT_MS = 3000;

export function cosine(a: readonly number[], b: readonly number[]): number {
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let k = 0; k < a.length; k++) {
    dot += a[k]! * (b[k] ?? 0);
    na += a[k]! ** 2;
    nb += (b[k] ?? 0) ** 2;
  }
  return na && nb ? dot / Math.sqrt(na * nb) : 0;
}

/**
 * Adapter: duplicate detection by the ML service's sentence embeddings (`POST /v1/embed`).
 * On any failure (service down, 501 not implemented, bad payload) it falls back to the
 * rule-based adapter, so the feature never depends on the ML service. Correlation and
 * suggestions are delegated to the fallback until the ML side serves them.
 */
export class HttpIntelligenceAdapter implements IntelligencePort {
  constructor(
    private readonly baseUrl: string,
    private readonly incidents: IncidentRepository,
    private readonly fallback: IntelligencePort,
    private readonly fetchFn: typeof fetch = fetch,
  ) {}
  async similar(
    text: IncidentText,
    visible: CandidateFilter,
    limit: number,
  ): Promise<Sourced<IncidentMatch[]>> {
    try {
      const open = (await this.incidents.listUnresolved()).filter(
        (i) => i.id !== text.excludeId && visible(i),
      );
      const [query, ...vectors] = await this.embed([text, ...open.map(textOf)]);
      const result = open
        .map((incident, k) => ({ incident, score: clamp(cosine(query!, vectors[k]!)) }))
        .filter((m) => m.score >= MODEL_SIMILARITY_THRESHOLD)
        .sort((a, b) => b.score - a.score)
        .slice(0, limit)
        .map((m) => ({
          ...m,
          reasons: [
            ...(text.serviceId && m.incident.toSnapshot().serviceId === text.serviceId
              ? ['same service']
              : []),
            'similar meaning (embedding model)',
          ],
        }));
      return { result, source: 'model' };
    } catch {
      return this.fallback.similar(text, visible, limit);
    }
  }
  cluster(anchor: Incident, visible: CandidateFilter) {
    return this.fallback.cluster(anchor, visible);
  }
  suggestResolutions(text: IncidentText, visible: CandidateFilter, limit: number) {
    return this.fallback.suggestResolutions(text, visible, limit);
  }
  /**
   * IF-E: the ML service's breach-risk model (`POST /v1/sla-risk`). The rule-based reasons are
   * kept so the badge stays explainable; any failure falls back to the rule-based estimate.
   */
  async slaRisk(
    incident: Incident,
    context: SlaRiskContext,
  ): Promise<Sourced<SlaRiskEstimate | null>> {
    const s = incident.toSnapshot();
    const factors = SlaRiskPolicy.factors(s, context.now);
    // Past the deadline the answer is certain; only ask the model while there is time left.
    if (!factors || !s.priority || factors.elapsedFraction >= 1)
      return this.fallback.slaRisk(incident, context);
    try {
      const response = await this.fetchFn(new URL('/v1/sla-risk', this.baseUrl), {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          priority: s.priority,
          impact: s.impact,
          urgency: s.urgency,
          category: context.categoryName ?? 'Uncategorised',
          service: context.serviceName,
          // Reassignments are not tracked separately; reopenings are the closest signal.
          reassignmentCount: s.reopenCount,
          minutesOpen: Math.round(factors.minutesOpen),
          minutesToDeadline: Math.round(factors.minutesToDeadline),
        }),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      if (!response.ok) throw new Error(`ML sla-risk failed with ${response.status}`);
      const { probability } = (await response.json()) as { probability?: unknown };
      if (typeof probability !== 'number' || !(probability >= 0 && probability <= 1))
        throw new Error('ML sla-risk returned no probability');
      const p = Math.round(probability * 100) / 100;
      return {
        result: {
          probability: p,
          level: SlaRiskPolicy.levelOf(p),
          reasons: SlaRiskPolicy.reasons(factors),
        },
        source: 'model',
      };
    } catch {
      return this.fallback.slaRisk(incident, context);
    }
  }
  private async embed(texts: readonly IncidentText[]): Promise<number[][]> {
    const response = await this.fetchFn(new URL('/v1/embed', this.baseUrl), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ texts: texts.map((t) => `${t.title}\n${t.description}`) }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!response.ok) throw new Error(`ML embed failed with ${response.status}`);
    const { vectors } = (await response.json()) as { vectors?: unknown };
    if (!Array.isArray(vectors) || vectors.length !== texts.length)
      throw new Error('ML embed returned the wrong number of vectors');
    return vectors as number[][];
  }
}

const textOf = (i: Incident): IncidentText => {
  const s = i.toSnapshot();
  return { title: s.title, description: s.description };
};
const clamp = (x: number) => Math.round(Math.min(1, Math.max(0, x)) * 100) / 100;
