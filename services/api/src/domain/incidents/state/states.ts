import { InvalidIncidentException } from '../../exceptions/index.js';
import { IncidentState } from './incident-state.js';
import { IncidentStatus } from './incident-status.js';

export class NewState extends IncidentState {
  readonly status = IncidentStatus.NEW;
  override classify(): IncidentState {
    return IncidentStates.of(IncidentStatus.CLASSIFIED);
  }
}

export class ClassifiedState extends IncidentState {
  readonly status = IncidentStatus.CLASSIFIED;
  override assign(): IncidentState {
    return IncidentStates.of(IncidentStatus.ASSIGNED);
  }
  override closeAsDuplicate(): IncidentState {
    return IncidentStates.of(IncidentStatus.CLOSED);
  }
}

export class AssignedState extends IncidentState {
  readonly status = IncidentStatus.ASSIGNED;
  override assign(): IncidentState {
    return IncidentStates.of(IncidentStatus.ASSIGNED);
  }
  override acknowledge(): IncidentState {
    return IncidentStates.of(IncidentStatus.ACKNOWLEDGED);
  }
  override addNote(): IncidentState {
    return this;
  }
  override closeAsDuplicate(): IncidentState {
    return IncidentStates.of(IncidentStatus.CLOSED);
  }
}

export class AcknowledgedState extends IncidentState {
  readonly status = IncidentStatus.ACKNOWLEDGED;
  override startWork(): IncidentState {
    return IncidentStates.of(IncidentStatus.IN_PROGRESS);
  }
  override assign(): IncidentState {
    return IncidentStates.of(IncidentStatus.ASSIGNED);
  }
  override addNote(): IncidentState {
    return this;
  }
}

export class InProgressState extends IncidentState {
  readonly status = IncidentStatus.IN_PROGRESS;
  override requestInfo(): IncidentState {
    return IncidentStates.of(IncidentStatus.PENDING_INFO);
  }
  override resolve(): IncidentState {
    return IncidentStates.of(IncidentStatus.RESOLVED);
  }
  override assign(): IncidentState {
    return IncidentStates.of(IncidentStatus.ASSIGNED);
  }
  override addNote(): IncidentState {
    return this;
  }
}

export class PendingInfoState extends IncidentState {
  readonly status = IncidentStatus.PENDING_INFO;
  override provideInfo(): IncidentState {
    return IncidentStates.of(IncidentStatus.IN_PROGRESS);
  }
  override addNote(): IncidentState {
    return this;
  }
}

export class ResolvedState extends IncidentState {
  readonly status = IncidentStatus.RESOLVED;
  override verify(): IncidentState {
    return IncidentStates.of(IncidentStatus.VERIFIED);
  }
  override reject(): IncidentState {
    return IncidentStates.of(IncidentStatus.REOPENED);
  }
}

export class VerifiedState extends IncidentState {
  readonly status = IncidentStatus.VERIFIED;
  override close(): IncidentState {
    return IncidentStates.of(IncidentStatus.CLOSED);
  }
}

export class ReopenedState extends IncidentState {
  readonly status = IncidentStatus.REOPENED;
  override startWork(): IncidentState {
    return IncidentStates.of(IncidentStatus.IN_PROGRESS);
  }
  override addNote(): IncidentState {
    return this;
  }
}

export class ClosedState extends IncidentState {
  readonly status = IncidentStatus.CLOSED;
}

function singleton(state: IncidentState): IncidentState {
  Object.freeze(state);
  return state;
}

/** Stateless singleton states are shared across aggregates. */
export class IncidentStates {
  private static readonly byStatus: ReadonlyMap<IncidentStatus, IncidentState> = new Map<
    IncidentStatus,
    IncidentState
  >([
    [IncidentStatus.NEW, singleton(new NewState())],
    [IncidentStatus.CLASSIFIED, singleton(new ClassifiedState())],
    [IncidentStatus.ASSIGNED, singleton(new AssignedState())],
    [IncidentStatus.ACKNOWLEDGED, singleton(new AcknowledgedState())],
    [IncidentStatus.IN_PROGRESS, singleton(new InProgressState())],
    [IncidentStatus.PENDING_INFO, singleton(new PendingInfoState())],
    [IncidentStatus.RESOLVED, singleton(new ResolvedState())],
    [IncidentStatus.VERIFIED, singleton(new VerifiedState())],
    [IncidentStatus.REOPENED, singleton(new ReopenedState())],
    [IncidentStatus.CLOSED, singleton(new ClosedState())],
  ]);
  static of(status: IncidentStatus): IncidentState {
    const state = this.byStatus.get(status);
    if (!state) throw new InvalidIncidentException(`unknown status ${status}`);
    return state;
  }
}
