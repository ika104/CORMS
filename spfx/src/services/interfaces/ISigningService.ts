import { ISigningSession, ISigningSessionFilters } from '../../models/ISigningSession';
import { INewSigningSessionInput } from '../../modules/signingDashboard/signingDashboardLogic';

/**
 * CMS-007 — backs the signing dashboard (list CORMS_SigningSessions). Reads/searches signing
 * sessions and performs the document-control actions (resend, cancel). Sessions are created here
 * (createSession) once the signing flow has raised the request; provider interaction and the
 * signed-document callback remain Power Automate concerns.
 */
export interface ISigningService {
  /** AC2 — every signing session, optionally filtered by the dashboard's search criteria. */
  getSessions(filters?: ISigningSessionFilters): Promise<ISigningSession[]>;
  /** Records a newly-sent signing request as a CORMS_SigningSessions row (status 'Sent') so the
   * dashboard tracks it. Called after IESignatureService.sendForSignature returns the provider id. */
  createSession(input: INewSigningSessionInput, actor: string): Promise<ISigningSession>;
  /** AC3 — resend the signing request; returns the updated session. */
  resend(id: string, actor: string): Promise<ISigningSession | undefined>;
  /** AC3 — cancel the signing request; returns the updated session. */
  cancel(id: string, actor: string, reason?: string): Promise<ISigningSession | undefined>;
}
