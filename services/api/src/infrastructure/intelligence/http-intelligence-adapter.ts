import type { Incident } from '../../domain/incidents/index.js';
import type {
  CandidateFilter,
  IncidentMatch,
  IncidentRepository,
  IncidentText,
  IntelligencePort,
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
