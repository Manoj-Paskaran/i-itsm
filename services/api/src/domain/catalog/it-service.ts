import { BusinessCriticality, type ItServiceId } from '../shared/index.js';
import { text } from '../shared/validation.js';
export interface ItServiceSnapshot {
  readonly id: ItServiceId;
  readonly name: string;
  readonly description?: string;
  readonly criticality: number;
  readonly active: boolean;
}
/** Independently managed service affected by incidents. */
export class ItService {
  private readonly serviceId: ItServiceId;
  private serviceName: string;
  private description: string | undefined;
  private criticality: BusinessCriticality;
  private active: boolean;
  private constructor(s: ItServiceSnapshot) {
    this.serviceId = s.id;
    this.serviceName = text(s.name, 'name', 80);
    this.description = s.description;
    this.criticality = BusinessCriticality.of(s.criticality);
    this.active = s.active;
  }
  static create(s: ItServiceSnapshot): ItService {
    return new ItService(s);
  }
  static rehydrate(s: ItServiceSnapshot): ItService {
    return new ItService(s);
  }
  id(): ItServiceId {
    return this.serviceId;
  }
  name(): string {
    return this.serviceName;
  }
  isActive(): boolean {
    return this.active;
  }
  businessCriticality(): BusinessCriticality {
    return this.criticality;
  }
  rename(name: string): void {
    this.serviceName = text(name, 'name', 80);
  }
  changeCriticality(value: BusinessCriticality): void {
    this.criticality = value;
  }
  changeDescription(value: string): void {
    this.description = text(value, 'description');
  }
  activate(): void {
    this.active = true;
  }
  deactivate(): void {
    this.active = false;
  }
  toSnapshot(): ItServiceSnapshot {
    return {
      id: this.serviceId,
      name: this.serviceName,
      ...(this.description === undefined ? {} : { description: this.description }),
      criticality: this.criticality.value,
      active: this.active,
    };
  }
}
