import type {
  IncidentInsights,
  SimilarIncident,
  SimilarityRequest,
  SlaRisk,
  SlaRiskEntry,
  SuggestedResolution,
} from '@itsm/contracts';
import { IncidentNotFoundException } from '../../domain/exceptions/index.js';
import type { Incident } from '../../domain/incidents/index.js';
import { CorrelationPolicy } from '../../domain/intelligence/index.js';
import { asIncidentId, asItServiceId, SystemClock, type Clock } from '../../domain/shared/index.js';
import { Permission as P, type User } from '../../domain/users/index.js';
import type {
  IncidentMatch,
  IncidentRepository,
  IncidentText,
  IntelligencePort,
  Sourced,
} from '../../ports/index.js';
import type { IncidentViewMapper } from './incident-view-mapper.js';
import { IncidentVisibility } from './incident-visibility.js';

const SIMILAR_LIMIT = 5;
const SUGGESTION_LIMIT = 3;
const CAN_CHECK_SIMILAR = [
  P.INCIDENT_REPORT,
  P.INCIDENT_VIEW_OWN,
  P.INCIDENT_VIEW_ASSIGNED,
  P.INCIDENT_VIEW_ALL,
] as const;

/**
 * Application service for IF-A/IF-B/IF-G: asks the IntelligencePort for advisory insights,
 * restricted to incidents the caller may see, and maps them to the API contract.
 * It never links, closes or changes an incident.
 */
export class IncidentInsightsService {
  constructor(
    private readonly incidents: IncidentRepository,
    private readonly intelligence: IntelligencePort,
    private readonly mapper: IncidentViewMapper,
    private readonly clock: Clock = new SystemClock(),
  ) {}
  async insights(user: User, id: string): Promise<IncidentInsights> {
    const incident = await this.incidents.findById(asIncidentId(id));
    if (!incident || !IncidentVisibility.canView(user, incident))
      throw new IncidentNotFoundException(id);
    const visible = (i: Incident) => IncidentVisibility.canView(user, i);
    const s = incident.toSnapshot();
    const text: IncidentText = {
      title: s.title,
      description: s.description,
      serviceId: s.serviceId,
      excludeId: incident.id,
    };
    const [similar, cluster, suggestions, slaRisk] = await Promise.all([
      this.intelligence.similar(text, visible, SIMILAR_LIMIT),
      this.intelligence.cluster(incident, visible),
      // Over-fetch: recurring incidents often share one fix, and each fix is suggested once.
      this.intelligence.suggestResolutions(text, visible, SUGGESTION_LIMIT * 5),
      this.risk(incident),
    ]);
    const members = cluster.result
      ? await Promise.all(cluster.result.incidents.map((i) => this.mapper.summary(i)))
      : [];
    return {
      similar: await this.toSimilar(similar),
      cluster:
        cluster.result && members[0]
          ? {
              service: members[0].service,
              windowMinutes: cluster.result.windowMinutes,
              incidents: members,
              reason: CorrelationPolicy.describe(
                members.length,
                cluster.result.windowMinutes,
                members[0].service.name,
              ),
            }
          : null,
      suggestedResolutions: distinctFixes(suggestions.result.map(toSuggestion)).slice(
        0,
        SUGGESTION_LIMIT,
      ),
      source: [similar, cluster, suggestions].some((r) => r.source === 'model') ? 'model' : 'rules',
      slaRisk,
    };
  }
  /** IF-E: breach risk of every open incident the caller may see, for the SLA monitor. */
  async slaRisks(user: User): Promise<SlaRiskEntry[]> {
    const open = (await this.incidents.listUnresolved()).filter((i) =>
      IncidentVisibility.canView(user, i),
    );
    const rows = await Promise.all(
      open.map(async (i): Promise<SlaRiskEntry | null> => {
        const risk = await this.risk(i);
        return risk && { incidentId: i.id, risk };
      }),
    );
    return rows.filter((r) => r !== null);
  }
  private async risk(incident: Incident): Promise<SlaRisk | null> {
    const summary = await this.mapper.summary(incident);
    const { result, source } = await this.intelligence.slaRisk(incident, {
      serviceName: summary.service.name,
      categoryName: summary.category?.name ?? null,
      now: this.clock.now(),
    });
    return result && { ...result, reasons: [...result.reasons], source };
  }
  /** Pre-submit "is this already reported?" check on the report form. */
  async similar(user: User, request: SimilarityRequest): Promise<SimilarIncident[]> {
    if (!CAN_CHECK_SIMILAR.some((p) => user.can(p))) user.require(P.INCIDENT_REPORT);
    const matches = await this.intelligence.similar(
      {
        title: request.title,
        description: request.description,
        serviceId: request.serviceId ? asItServiceId(request.serviceId) : undefined,
      },
      (i) => IncidentVisibility.canView(user, i),
      SIMILAR_LIMIT,
    );
    return this.toSimilar(matches);
  }
  private toSimilar({ result, source }: Sourced<IncidentMatch[]>) {
    return Promise.all(
      result.map(async (m) => ({
        incident: await this.mapper.summary(m.incident),
        score: m.score,
        reasons: [...m.reasons],
        source,
      })),
    );
  }
}

function toSuggestion(m: IncidentMatch): SuggestedResolution {
  const s = m.incident.toSnapshot();
  return {
    incident: { id: s.id, number: s.number, title: s.title },
    summary: s.resolution!.summary,
    rootCause: s.resolution!.rootCause ?? null,
    score: m.score,
  };
}

/** Keeps the best-scoring incident for each distinct resolution summary. */
function distinctFixes(suggestions: SuggestedResolution[]): SuggestedResolution[] {
  const seen = new Set<string>();
  return suggestions.filter((s) => {
    const key = s.summary.trim().toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
