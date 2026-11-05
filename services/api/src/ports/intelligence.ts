import type { Incident } from '../domain/incidents/index.js';
import type { SlaRiskEstimate } from '../domain/intelligence/index.js';
import type { IncidentId, Instant, ItServiceId } from '../domain/shared/index.js';

/** Whether the rule-based fallback or the ML model produced a result. */
export type InsightSource = 'rules' | 'model';
export interface Sourced<T> {
  readonly result: T;
  readonly source: InsightSource;
}
/** The text being compared: an existing incident or a report still being written. */
export interface IncidentText {
  readonly title: string;
  readonly description: string;
  readonly serviceId?: ItServiceId | undefined;
  /** Leave this incident out of the matches (the incident itself). */
  readonly excludeId?: IncidentId | undefined;
}
export interface IncidentMatch {
  readonly incident: Incident;
  readonly score: number;
  readonly reasons: readonly string[];
}
export interface IncidentCluster {
  /** The anchor first, then the related open incidents. */
  readonly incidents: readonly Incident[];
  readonly windowMinutes: number;
}
/** Names the ML model was trained on, plus the time the risk is judged at. */
export interface SlaRiskContext {
  readonly serviceName: string;
  readonly categoryName: string | null;
  readonly now: Instant;
}
/** Only candidates the caller may see are considered; the application decides visibility. */
export type CandidateFilter = (incident: Incident) => boolean;

/**
 * Port for incident intelligence (IF-A duplicates, IF-B correlation, IF-G suggested resolutions,
 * IF-E SLA breach risk).
 * Advisory only: implementations never change an incident.
 */
export interface IntelligencePort {
  similar(
    text: IncidentText,
    visible: CandidateFilter,
    limit: number,
  ): Promise<Sourced<IncidentMatch[]>>;
  cluster(anchor: Incident, visible: CandidateFilter): Promise<Sourced<IncidentCluster | null>>;
  suggestResolutions(
    text: IncidentText,
    visible: CandidateFilter,
    limit: number,
  ): Promise<Sourced<IncidentMatch[]>>;
  /** Null when there is nothing to predict: no SLA, or the incident is already resolved. */
  slaRisk(incident: Incident, context: SlaRiskContext): Promise<Sourced<SlaRiskEstimate | null>>;
}
export const INTELLIGENCE_PORT = Symbol('INTELLIGENCE_PORT');
