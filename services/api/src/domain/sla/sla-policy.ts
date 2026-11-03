import {
  Duration,
  Priority,
  type ItServiceId,
  type PriorityCode,
  type SlaPolicyId,
} from '../shared/index.js';
import { text } from '../shared/validation.js';
import { SlaTarget, type SlaTargetSnapshot } from './sla-target.js';
import { validateWarningRatio } from './validation.js';

export interface SlaPolicyProps {
  readonly id: SlaPolicyId;
  readonly name: string;
  readonly serviceId: ItServiceId | null;
  readonly targets: ReadonlyMap<PriorityCode, SlaTarget>;
  readonly warningRatio?: number;
}

export interface SlaPolicySnapshot {
  readonly id: SlaPolicyId;
  readonly name: string;
  readonly serviceId: ItServiceId | null;
  readonly targets: ReadonlyArray<readonly [PriorityCode, SlaTargetSnapshot]>;
  readonly warningRatio: number;
}

/** Named service-specific or default SLA terms indexed by priority code. */
export class SlaPolicy {
  private readonly policyId: SlaPolicyId;
  private readonly policyName: string;
  private readonly policyServiceId: ItServiceId | null;
  private readonly targets: ReadonlyMap<PriorityCode, SlaTarget>;
  readonly warningRatio: number;

  private constructor(props: SlaPolicyProps) {
    this.policyId = props.id;
    this.policyName = text(props.name, 'name');
    this.policyServiceId = props.serviceId;
    this.warningRatio = validateWarningRatio(props.warningRatio ?? 0.75);
    this.targets = new Map(
      [...props.targets].map(([key, target]) => [Priority.of(key).value, target]),
    );
  }

  static create(props: SlaPolicyProps): SlaPolicy {
    return new SlaPolicy(props);
  }

  static specDefault(id: SlaPolicyId): SlaPolicy {
    return SlaPolicy.create({
      id,
      name: 'Default SLA',
      serviceId: null,
      targets: new Map([
        ['P1', SlaTarget.of(Duration.ofMinutes(5), Duration.ofMinutes(30))],
        ['P2', SlaTarget.of(Duration.ofMinutes(15), Duration.ofHours(2))],
        ['P3', SlaTarget.of(Duration.ofHours(1), Duration.ofHours(8))],
        ['P4', SlaTarget.of(Duration.ofHours(4), Duration.ofHours(24))],
      ]),
    });
  }

  id(): SlaPolicyId {
    return this.policyId;
  }
  name(): string {
    return this.policyName;
  }
  serviceId(): ItServiceId | null {
    return this.policyServiceId;
  }
  targetFor(priority: Priority): SlaTarget | undefined {
    return this.targets.get(priority.value);
  }

  toSnapshot(): SlaPolicySnapshot {
    return {
      id: this.policyId,
      name: this.policyName,
      serviceId: this.policyServiceId,
      targets: [...this.targets].map(([key, target]) => [key, target.toSnapshot()]),
      warningRatio: this.warningRatio,
    };
  }

  static rehydrate(s: SlaPolicySnapshot): SlaPolicy {
    return SlaPolicy.create({
      ...s,
      targets: new Map(s.targets.map(([key, target]) => [key, SlaTarget.rehydrate(target)])),
    });
  }
}
