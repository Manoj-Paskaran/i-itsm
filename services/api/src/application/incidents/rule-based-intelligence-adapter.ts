import type { Incident } from '../../domain/incidents/index.js';
import {
  CorrelationPolicy,
  TextSimilarity,
  type CorrelationSubject,
} from '../../domain/intelligence/index.js';
import type {
  CandidateFilter,
  IncidentRepository,
  IncidentText,
  IntelligencePort,
} from '../../ports/index.js';

/** How many recent resolutions are searched for a suggestion. */
const RESOLVED_CANDIDATES = 200;

function subject(incident: Incident): CorrelationSubject & { incident: Incident } {
  const s = incident.toSnapshot();
  return {
    incident,
    id: s.id,
    title: s.title,
    description: s.description,
    serviceId: s.serviceId,
    createdAt: new Date(s.createdAt),
  };
}

/**
 * Adapter: answers the IntelligencePort with the pure domain rules (TextSimilarity,
 * CorrelationPolicy) over candidates read through the IncidentRepository. Needs no ML service,
 * so it is both the default and the fallback of the HTTP adapter.
 */
export class RuleBasedIntelligenceAdapter implements IntelligencePort {
  constructor(
    private readonly incidents: IncidentRepository,
    private readonly similarity = new TextSimilarity(),
    private readonly correlation = new CorrelationPolicy(
      CorrelationPolicy.DEFAULT.windowMinutes,
      CorrelationPolicy.DEFAULT.minOthers,
      similarity,
    ),
  ) {}
  async similar(text: IncidentText, visible: CandidateFilter, limit: number) {
    const open = (await this.incidents.listUnresolved()).filter(
      (i) => i.id !== text.excludeId && visible(i),
    );
    return { result: this.rank(text, open, limit), source: 'rules' as const };
  }
  async cluster(anchor: Incident, visible: CandidateFilter) {
    const open = (await this.incidents.listUnresolved()).filter(visible).map(subject);
    const self = open.find((s) => s.id === anchor.id);
    const correlation = self ? this.correlation.correlate(self, open) : null;
    return {
      result: correlation && {
        incidents: correlation.members.map((m) => m.incident),
        windowMinutes: correlation.windowMinutes,
      },
      source: 'rules' as const,
    };
  }
  async suggestResolutions(text: IncidentText, visible: CandidateFilter, limit: number) {
    const resolved = (await this.incidents.listResolved(RESOLVED_CANDIDATES)).filter(
      (i) => i.id !== text.excludeId && visible(i),
    );
    return { result: this.rank(text, resolved, limit), source: 'rules' as const };
  }
  private rank(text: IncidentText, candidates: readonly Incident[], limit: number) {
    return this.similarity
      .rank(text, candidates.map(subject), limit)
      .map(({ subject: s, score, reasons }) => ({ incident: s.incident, score, reasons }));
  }
}
