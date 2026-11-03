import { IReassignInput, IReassignmentService } from '../interfaces/IReassignmentService';

const SIMULATED_LATENCY_MS = 150;

function delay<T>(value: T): Promise<T> {
  return new Promise((resolve) => setTimeout(() => resolve(value), SIMULATED_LATENCY_MS));
}

/** Mock stand-in for CMS-019 — TeamInboxView currently reassigns via its own local React state
 * (src/modules/teamInbox/mockData.ts / TeamInboxView.tsx), which already handles the mock-mode
 * visual update. This service exists only so the ds.delegation-style toggle wiring has something
 * to resolve to in mock mode, consistent with every other service having a mock counterpart —
 * it deliberately does not mutate the shared teamInbox mock fixtures itself. */
export class ReassignmentServiceMock implements IReassignmentService {
  public reassign(_input: IReassignInput): Promise<void> {
    return delay(undefined);
  }
}
