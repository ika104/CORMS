import { IRouteInput, IRoutingService } from '../interfaces/IRoutingService';

const SIMULATED_LATENCY_MS = 150;

function delay<T>(value: T): Promise<T> {
  return new Promise((resolve) => setTimeout(() => resolve(value), SIMULATED_LATENCY_MS));
}

/** Mock stand-in for CMS-011 — TriageRoutingView applies the routing to its own session-local
 * queue state (removing the item and recording the next action) the same way it already handles
 * classify/complete in mock mode. This service exists so the wiring has a mock counterpart to
 * resolve to, consistent with every other service; it deliberately does not persist. */
export class RoutingServiceMock implements IRoutingService {
  public route(_input: IRouteInput): Promise<void> {
    return delay(undefined);
  }
}
