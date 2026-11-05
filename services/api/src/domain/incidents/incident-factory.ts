import type { ItService } from '../catalog/index.js';
import { DuplicateIncidentException, ServiceNotFoundException } from '../exceptions/index.js';
import type { IncidentId, IncidentNumber, Instant, ItServiceId } from '../shared/index.js';
import { Incident, type ReportIncidentProps } from './incident.js';

export type IncidentDraft = Omit<ReportIncidentProps, 'id' | 'number' | 'at'>;
export interface ReportContext {
  readonly id: IncidentId;
  readonly number: IncidentNumber;
  readonly at: Instant;
  readonly service: ItService | undefined;
  /** Already scoped to the reporter and to open incidents by the application layer. */
  readonly openIncidentsOfReporter: ReadonlyArray<{
    id: IncidentId;
    /** Human-readable number, so the reporter is told which incident they already opened. */
    number?: string;
    serviceId: ItServiceId;
    title: string;
  }>;
}
const normaliseTitle = (title: string): string => title.trim().replace(/\s+/gu, ' ').toLowerCase();

export class IncidentFactory {
  static report(draft: IncidentDraft, ctx: ReportContext): Incident {
    if (!ctx.service?.isActive() || ctx.service.id() !== draft.serviceId)
      throw new ServiceNotFoundException(draft.serviceId);
    const duplicate = ctx.openIncidentsOfReporter.find(
      (existing) =>
        existing.serviceId === draft.serviceId &&
        normaliseTitle(existing.title) === normaliseTitle(draft.title),
    );
    if (duplicate) throw new DuplicateIncidentException(duplicate.id, duplicate.number);
    return Incident.report({ ...draft, id: ctx.id, number: ctx.number, at: ctx.at });
  }
}
