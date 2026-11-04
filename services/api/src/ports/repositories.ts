import type { Incident } from '../domain/incidents/index.js';
import type { User, Technician, Role } from '../domain/users/index.js';
import type { ItService, Category } from '../domain/catalog/index.js';
import type { SlaPolicy } from '../domain/sla/index.js';
import type { AuditRecord } from '../domain/audit/index.js';
import type {
  IncidentId,
  IncidentNumber,
  UserId,
  ItServiceId,
  CategoryId,
  SlaPolicyId,
  Email,
} from '../domain/shared/index.js';
import type { AuditSink } from './audit-sink.js';

export interface Repository<T, Id> {
  findById(id: Id): Promise<T | null>;
  save(entity: T): Promise<void>;
}
export interface IncidentSearchFilter {
  from?: Date;
  to?: Date;
  categoryId?: CategoryId;
  sla?: 'BREACHED' | 'WITHIN_SLA';
  reporterId?: UserId;
  assigneeId?: UserId;
  status?: string;
  priority?: string;
  serviceId?: ItServiceId;
  q?: string;
  limit: number;
}
export interface IncidentRepository extends Repository<Incident, IncidentId> {
  search(filter: IncidentSearchFilter): Promise<Incident[]>;
  nextIdentity(): Promise<{ id: IncidentId; number: IncidentNumber }>;
  findOpenByReporter(
    reporterId: UserId,
  ): Promise<Array<{ id: IncidentId; serviceId: ItServiceId; title: string }>>;
  countOpenByAssignee(): Promise<Map<UserId, number>>;
  listAssignedUnacknowledged(): Promise<Incident[]>;
  listOpenClassified(): Promise<Incident[]>;
  /** Incidents still being worked on: not RESOLVED, VERIFIED or CLOSED. */
  listUnresolved(): Promise<Incident[]>;
  /** Most recently resolved incidents that carry a resolution (duplicates excluded), newest first. */
  listResolved(limit: number): Promise<Incident[]>;
}
export interface UserRepository extends Repository<User, UserId> {
  listAll(): Promise<User[]>;
  findByEmail(email: Email): Promise<User | null>;
  listTechnicians(): Promise<Technician[]>;
  listByRole(role: Role): Promise<User[]>;
}
export interface ItServiceRepository extends Repository<ItService, ItServiceId> {
  listAll(): Promise<ItService[]>;
  listActive(): Promise<ItService[]>;
}
export interface CategoryRepository extends Repository<Category, CategoryId> {
  listAll(): Promise<Category[]>;
  listActive(): Promise<Category[]>;
}
export interface SlaPolicyRepository extends Repository<SlaPolicy, SlaPolicyId> {
  listAll(): Promise<SlaPolicy[]>;
}
export interface AuditSearchFilter {
  incidentId?: IncidentId;
  actorId?: UserId;
  action?: string;
  from?: Date;
  to?: Date;
  limit: number;
}
export interface AuditSearchResult {
  record: AuditRecord;
  incidentNumber: string;
}
export interface AuditRepository extends AuditSink {
  search(filter: AuditSearchFilter): Promise<AuditSearchResult[]>;
  listByIncident(incidentId: IncidentId): Promise<AuditRecord[]>;
}

export const INCIDENT_REPOSITORY = Symbol('INCIDENT_REPOSITORY');
export const USER_REPOSITORY = Symbol('USER_REPOSITORY');
export const IT_SERVICE_REPOSITORY = Symbol('IT_SERVICE_REPOSITORY');
export const CATEGORY_REPOSITORY = Symbol('CATEGORY_REPOSITORY');
export const SLA_POLICY_REPOSITORY = Symbol('SLA_POLICY_REPOSITORY');
export const AUDIT_REPOSITORY = Symbol('AUDIT_REPOSITORY');
