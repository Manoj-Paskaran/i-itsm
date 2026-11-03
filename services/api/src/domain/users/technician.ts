import { User } from './user.js';
import { Role, Availability } from './enums.js';
import { technicianPermissions } from './permissions.js';
import { SkillTag, type ItServiceId } from '../shared/index.js';
import { invalid, numberIn } from '../shared/validation.js';
import { TechnicianUnavailableException, WorkloadExceededException } from '../exceptions/index.js';
import type { TechnicianFields, UserCommonSnapshot, UserSnapshot } from './snapshot.js';
type Snapshot = Extract<UserSnapshot, { role: typeof Role.TECHNICIAN | typeof Role.TEAM_LEAD }>;
/** Technician with skills, availability and bounded workload. */
export class Technician extends User {
  private readonly skillSet: Map<string, SkillTag>;
  private maxActiveIncidents: number;
  private availability: Availability;
  private experienceYears: number;
  private readonly serviceHistory: Map<ItServiceId, number>;
  protected constructor(s: UserCommonSnapshot & TechnicianFields) {
    super(s);
    this.skillSet = new Map(
      s.skills.map((value) => {
        const skill = SkillTag.of(value);
        return [skill.value, skill];
      }),
    );
    if (!this.skillSet.size) invalid('skills', s.skills);
    this.maxActiveIncidents = numberIn(s.maxActiveIncidents, 'maxActiveIncidents', 1, 20, true);
    this.experienceYears = numberIn(s.experienceYears, 'experienceYears', 0, 50);
    this.availability = s.availability;
    this.setAvailability(s.availability);
    this.serviceHistory = new Map(
      s.serviceHistory.map(([id, count]) => [
        id,
        numberIn(count, 'serviceHistory', 0, Number.MAX_SAFE_INTEGER, true),
      ]),
    );
  }
  static rehydrate(s: Snapshot): Technician {
    return new Technician(s);
  }
  role(): Role {
    return Role.TECHNICIAN;
  }
  permissions() {
    return technicianPermissions;
  }
  hasSkill(skill: SkillTag): boolean {
    return this.skillSet.has(skill.value);
  }
  skills(): ReadonlySet<SkillTag> {
    return new Set(this.skillSet.values());
  }
  addSkill(skill: SkillTag): void {
    this.skillSet.set(skill.value, skill);
  }
  removeSkill(skill: SkillTag): void {
    if (this.hasSkill(skill) && this.skillSet.size === 1) invalid('skills', skill.value);
    this.skillSet.delete(skill.value);
  }
  /** Deactivated accounts are never available for assignment, whatever their availability flag says. */
  isAvailable(): boolean {
    return this.isActive() && this.availability === Availability.AVAILABLE;
  }
  capacity(): number {
    return this.maxActiveIncidents;
  }
  experience(): number {
    return this.experienceYears;
  }
  availabilityStatus(): Availability {
    return this.availability;
  }
  hasCapacity(activeCount: number): boolean {
    numberIn(activeCount, 'activeCount', 0, Number.MAX_SAFE_INTEGER, true);
    return activeCount < this.maxActiveIncidents;
  }
  ensureCanTake(activeCount: number): void {
    if (!this.isAvailable()) throw new TechnicianUnavailableException();
    if (!this.hasCapacity(activeCount))
      throw new WorkloadExceededException(this.id(), activeCount, this.maxActiveIncidents);
  }
  experienceWith(id: ItServiceId): number {
    return this.serviceHistory.get(id) ?? 0;
  }
  recordResolvedFor(id: ItServiceId): void {
    this.serviceHistory.set(id, this.experienceWith(id) + 1);
  }
  setCapacity(value: number): void {
    this.maxActiveIncidents = numberIn(value, 'maxActiveIncidents', 1, 20, true);
  }
  setExperienceYears(value: number): void {
    this.experienceYears = numberIn(value, 'experienceYears', 0, 50);
  }
  setAvailability(value: Availability): void {
    if (!Object.values(Availability).includes(value)) invalid('availability', value);
    this.availability = value;
  }
  protected technicianSnapshot(): TechnicianFields {
    return {
      skills: [...this.skillSet.keys()],
      maxActiveIncidents: this.maxActiveIncidents,
      availability: this.availability,
      experienceYears: this.experienceYears,
      serviceHistory: [...this.serviceHistory],
    };
  }
  toSnapshot(): UserSnapshot {
    return { ...this.commonSnapshot(), ...this.technicianSnapshot(), role: Role.TECHNICIAN };
  }
}
