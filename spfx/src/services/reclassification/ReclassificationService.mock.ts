import { IReclassificationService } from '../interfaces/IReclassificationService';
import { SECURITY_TIERS } from '../../models/ICorrespondence';
import { IReclassificationDecision, IReclassificationInput, IReclassificationRequest } from '../../models/IReclassification';

const SIMULATED_LATENCY_MS = 150;
function delay<T>(value: T): Promise<T> {
  return new Promise((resolve) => setTimeout(() => resolve(value), SIMULATED_LATENCY_MS));
}
function tierName(tier: number): string {
  return SECURITY_TIERS.find((t) => t.tier === tier)?.name ?? String(tier);
}

/** Dev/jsdom stand-in — pending requests live in memory for the session. */
export class ReclassificationServiceMock implements IReclassificationService {
  private requests: IReclassificationRequest[] = [];
  private seq = 0;

  public applyDirect(): Promise<void> {
    return delay(undefined);
  }

  public requestReclassification(input: IReclassificationInput): Promise<void> {
    this.seq += 1;
    this.requests.push({
      id: `r-${this.seq}`,
      correspondenceId: input.correspondenceId,
      correspondenceRef: input.correspondenceRef,
      subject: input.subject,
      fromTier: input.fromTier,
      toTier: input.toTier,
      fromLevel: tierName(input.fromTier),
      toLevel: tierName(input.toTier),
      justification: input.justification,
      requestedBy: input.actor,
      requestedAt: new Date().toISOString(),
      status: 'Pending',
    });
    return delay(undefined);
  }

  public getPendingRequests(): Promise<IReclassificationRequest[]> {
    return delay(this.requests.filter((r) => r.status === 'Pending').map((r) => ({ ...r })));
  }

  public decideRequest(decision: IReclassificationDecision): Promise<void> {
    this.requests = this.requests.map((r) =>
      r.id === decision.requestId
        ? { ...r, status: decision.approve ? 'Approved' : 'Rejected', decidedBy: decision.decidedBy, decidedAt: new Date().toISOString(), decisionNote: decision.decisionNote }
        : r
    );
    return delay(undefined);
  }
}
