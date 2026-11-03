import { Category, ItService } from '../catalog/index.js';
import {
  asCategoryId,
  asIncidentId,
  asItServiceId,
  asUserId,
  Impact,
  Duration,
  IncidentNumber,
  Instant,
  Urgency,
} from '../shared/index.js';
import { SlaClock, SlaTarget } from '../sla/index.js';
import { Availability, Employee, Role, Technician } from '../users/index.js';
import { Actor } from './actor.js';
import { Incident, type ReportIncidentProps } from './incident.js';
import type { IncidentSnapshot } from './snapshot.js';
import type { IncidentStatus } from './state/index.js';

export const at = Instant.fromIso('2026-11-03T09:00:00.000Z');
export const sla = {
  target: SlaTarget.of(Duration.ofMinutes(15), Duration.ofHours(2)),
  warningRatio: 0.75,
};
export const later = Instant.fromIso('2026-11-03T10:00:00.000Z');
export const reporterId = asUserId('employee-E');
export const technicianId = asUserId('technician-T');
const user = { name: 'Test user', email: 'test@example.com', passwordHash: 'hash', active: true };
export const employee = Employee.rehydrate({
  ...user,
  id: reporterId,
  role: Role.EMPLOYEE,
  department: 'IT',
});
export const technician = Technician.rehydrate({
  ...user,
  id: technicianId,
  role: Role.TECHNICIAN,
  skills: ['network'],
  maxActiveIncidents: 2,
  availability: Availability.AVAILABLE,
  experienceYears: 2,
  serviceHistory: [],
});
export const otherTechnician = Technician.rehydrate({
  ...technician.toSnapshot(),
  id: asUserId('other-T'),
} as Parameters<typeof Technician.rehydrate>[0]);
export const reporter = Actor.user(employee);
export const assignee = Actor.user(technician);
export const other = Actor.of(asUserId('other'), Role.EMPLOYEE);
export const system = Actor.system();
export const category = Category.create({
  id: asCategoryId('network'),
  code: 'NETWORK',
  name: 'Network',
  requiredSkill: 'network',
  active: true,
});
export const service = ItService.create({
  id: asItServiceId('wifi'),
  name: 'WiFi',
  criticality: 3,
  active: true,
});
export const duplicateId = asIncidentId('existing-incident');
export const reportProps: ReportIncidentProps = {
  id: asIncidentId('incident-7'),
  number: IncidentNumber.of('INC0007'),
  title: 'WiFi is unavailable',
  description: 'Unable to connect to WiFi in the office.',
  reporterId,
  serviceId: service.id(),
  impact: Impact.of(2),
  urgency: Urgency.of(3),
  affectedUsers: 4,
  at,
};

/** Valid lifecycle snapshots; ownership always starts with employee E / technician T. */
export function snapshot(status: IncidentStatus): IncidentSnapshot {
  const classified = status !== 'NEW';
  const assigned = !['NEW', 'CLASSIFIED'].includes(status);
  const resolved = ['RESOLVED', 'VERIFIED', 'CLOSED', 'REOPENED'].includes(status);
  const clock = new SlaClock(at, sla.target, sla.warningRatio);
  if (!['NEW', 'CLASSIFIED', 'ASSIGNED'].includes(status)) clock.recordResponse(at);
  if (status === 'PENDING_INFO') clock.pause(at);
  if (['RESOLVED', 'VERIFIED', 'CLOSED'].includes(status)) clock.recordResolution(at);
  const infoRequest = { question: 'Which office?', askedBy: technicianId, askedAt: at.toIso() };
  return {
    ...Incident.report(reportProps).toSnapshot(),
    status,
    slaClock: classified ? clock.toSnapshot() : null,
    categoryId: classified ? category.id() : null,
    priority: classified ? 'P2' : null,
    assigneeId: assigned ? technicianId : null,
    assignedAt: assigned ? at.toIso() : null,
    notes: assigned
      ? [{ authorId: technicianId, text: 'Investigated connectivity', at: at.toIso() }]
      : [],
    infoRequests:
      status === 'PENDING_INFO'
        ? [infoRequest]
        : resolved
          ? [{ ...infoRequest, answer: 'Office A', answeredAt: later.toIso() }]
          : [],
    resolution: resolved
      ? {
          summary: 'Restarted the router',
          rootCause: 'Router fault',
          resolvedBy: technicianId,
          at: at.toIso(),
        }
      : null,
    closure:
      status === 'CLOSED' ? { reason: 'RESOLVED', closedBy: reporterId, at: later.toIso() } : null,
    reopenCount: status === 'REOPENED' ? 1 : 0,
  };
}
export function inState(status: IncidentStatus): Incident {
  return Incident.rehydrate(snapshot(status));
}
