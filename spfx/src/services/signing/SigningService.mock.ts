import { ISigningService } from '../interfaces/ISigningService';
import { ISigningSession, ISigningSessionFilters } from '../../models/ISigningSession';
import {
  applyCancel,
  applyResend,
  buildNewSigningSession,
  filterSigningSessions,
  INewSigningSessionInput,
} from '../../modules/signingDashboard/signingDashboardLogic';
import sessionsMock from '../../mocks/signingSessions.json';

const SIMULATED_LATENCY_MS = 140;

function delay<T>(value: T): Promise<T> {
  return new Promise((resolve) => setTimeout(() => resolve(value), SIMULATED_LATENCY_MS));
}

/**
 * CMS-007 — in-memory signing-session store for DEV / tests, seeded from signingSessions.json.
 * Resend/cancel mutate the in-memory copy (and its history) so the dashboard reflects the action
 * for the life of the session, the same way the live SharePoint list would.
 */
export class SigningServiceMock implements ISigningService {
  private sessions: ISigningSession[] = (sessionsMock as ISigningSession[]).map((s) => ({ ...s, events: [...s.events] }));

  public getSessions(filters?: ISigningSessionFilters): Promise<ISigningSession[]> {
    const result = filterSigningSessions(this.sessions, filters).map((s) => ({ ...s, events: [...s.events] }));
    return delay(result);
  }

  public createSession(input: INewSigningSessionInput, actor: string): Promise<ISigningSession> {
    const id = `sign-${Date.now()}`;
    const session = buildNewSigningSession(id, input, actor, new Date().toISOString());
    this.sessions = [session, ...this.sessions];
    return delay({ ...session, events: [...session.events] });
  }

  public resend(id: string, actor: string): Promise<ISigningSession | undefined> {
    return delay(this.mutate(id, (s) => applyResend(s, actor, new Date().toISOString())));
  }

  public cancel(id: string, actor: string, reason?: string): Promise<ISigningSession | undefined> {
    return delay(this.mutate(id, (s) => applyCancel(s, actor, new Date().toISOString(), reason)));
  }

  private mutate(id: string, fn: (s: ISigningSession) => ISigningSession): ISigningSession | undefined {
    const index = this.sessions.findIndex((s) => s.id === id);
    if (index === -1) return undefined;
    this.sessions[index] = fn(this.sessions[index]);
    return { ...this.sessions[index], events: [...this.sessions[index].events] };
  }
}
