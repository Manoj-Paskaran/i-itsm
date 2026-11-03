import { InvalidStateTransitionException } from '../../exceptions/index.js';
import type { Incident } from '../incident.js';
import { IncidentAction } from './incident-action.js';
import { IncidentStatus } from './incident-status.js';

/** Default-deny State pattern. Subclasses override only legal actions. */
export abstract class IncidentState {
  abstract readonly status: IncidentStatus;
  classify(incident: Incident): IncidentState {
    void incident;
    return this.illegal('classify');
  }
  assign(incident: Incident): IncidentState {
    void incident;
    return this.illegal('assign');
  }
  acknowledge(incident: Incident): IncidentState {
    void incident;
    return this.illegal('acknowledge');
  }
  startWork(incident: Incident): IncidentState {
    void incident;
    return this.illegal('startWork');
  }
  addNote(incident: Incident): IncidentState {
    void incident;
    return this.illegal('addNote');
  }
  requestInfo(incident: Incident): IncidentState {
    void incident;
    return this.illegal('requestInfo');
  }
  provideInfo(incident: Incident): IncidentState {
    void incident;
    return this.illegal('provideInfo');
  }
  resolve(incident: Incident): IncidentState {
    void incident;
    return this.illegal('resolve');
  }
  verify(incident: Incident): IncidentState {
    void incident;
    return this.illegal('verify');
  }
  reject(incident: Incident): IncidentState {
    void incident;
    return this.illegal('reject');
  }
  close(incident: Incident): IncidentState {
    void incident;
    return this.illegal('close');
  }
  closeAsDuplicate(incident: Incident): IncidentState {
    void incident;
    return this.illegal('closeAsDuplicate');
  }
  isOpen(): boolean {
    return this.status !== IncidentStatus.CLOSED;
  }
  allowedActions(): ReadonlySet<IncidentAction> {
    // Overrides are the single source of truth. Return a copy so callers cannot change policy.
    return new Set(
      Object.values(IncidentAction).filter(
        (action) => this[action] !== IncidentState.prototype[action],
      ),
    );
  }
  protected illegal(action: IncidentAction): never {
    throw new InvalidStateTransitionException(this.status, action);
  }
}
