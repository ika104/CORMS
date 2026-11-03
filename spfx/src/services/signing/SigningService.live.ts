import { SPHttpClient, SPHttpClientResponse } from '@microsoft/sp-http';
import { WebPartContext } from '@microsoft/sp-webpart-base';
import { ISigningService } from '../interfaces/ISigningService';
import {
  ISigningEvent,
  ISigningSession,
  ISigningSessionFilters,
  SigningSessionStatus,
} from '../../models/ISigningSession';
import {
  applyCancel,
  applyResend,
  buildSigningSessionEvents,
  filterSigningSessions,
  INewSigningSessionInput,
} from '../../modules/signingDashboard/signingDashboardLogic';

interface ISigningListItem {
  Id: number;
  Title?: string;
  CorrespondenceId?: string;
  ReferenceNo?: string;
  Subject?: string;
  SignerName?: string;
  SignerEmail?: string;
  ExternalDocumentId?: string;
  Status?: string;
  SentAt?: string;
  SignedAt?: string;
  EventsJson?: string;
  Created?: string;
  Modified?: string;
}

const BASE_SELECT =
  'Id,Title,CorrespondenceId,ReferenceNo,Subject,SignerName,SignerEmail,Status,SentAt,SignedAt,EventsJson,Created,Modified';
// ExternalDocumentId was added after the original schema. Naming it in $select on a site that
// hasn't re-run Provision Lists 400s the whole query, so reads retry without it.
const FULL_SELECT = `${BASE_SELECT},ExternalDocumentId`;

// CMS-007 — live CORMS_SigningSessions store. The signing history is held as a JSON array in the
// EventsJson Note column; createdAt/updatedAt map to SharePoint's built-in Created/Modified.
export class SigningServiceLive implements ISigningService {
  constructor(
    private readonly context: WebPartContext,
    private readonly siteUrl: string,
    private readonly listName: string = 'CORMS_SigningSessions'
  ) {}

  private itemsUrl(): string {
    return `${this.siteUrl}/_api/web/lists/getbytitle('${this.listName}')/items`;
  }

  private toModel(item: ISigningListItem): ISigningSession {
    return {
      id: String(item.Id),
      correspondenceId: item.CorrespondenceId ?? '',
      referenceNumber: item.ReferenceNo ?? '',
      subject: item.Subject ?? item.Title ?? '',
      signerName: item.SignerName ?? '',
      signerEmail: item.SignerEmail || undefined,
      externalDocumentId: item.ExternalDocumentId || undefined,
      status: (item.Status as SigningSessionStatus) ?? 'Sent',
      createdAt: item.Created ?? '',
      sentAt: item.SentAt || undefined,
      signedAt: item.SignedAt || undefined,
      updatedAt: item.Modified ?? item.Created ?? '',
      events: parseEvents(item.EventsJson),
    };
  }

  private async getWithSelectFallback(url: (select: string) => string): Promise<SPHttpClientResponse> {
    const get = (select: string): Promise<SPHttpClientResponse> =>
      this.context.spHttpClient.get(url(select), SPHttpClient.configurations.v1, {
        headers: { Accept: 'application/json;odata=nometadata' },
      });
    const response = await get(FULL_SELECT);
    return response.status === 400 ? get(BASE_SELECT) : response;
  }

  public async getSessions(filters?: ISigningSessionFilters): Promise<ISigningSession[]> {
    const response = await this.getWithSelectFallback(
      (select) => `${this.itemsUrl()}?$select=${select}&$orderby=Created desc&$top=500`
    );
    if (!response.ok) {
      throw new Error(`Failed to read ${this.listName}: ${response.status} ${response.statusText}`);
    }
    const body = (await response.json()) as { value: ISigningListItem[] };
    // Search is applied in memory so the mock and live agree on match semantics (Arabic-aware).
    return filterSigningSessions(
      body.value.map((item) => this.toModel(item)),
      filters
    );
  }

  public async createSession(input: INewSigningSessionInput, actor: string): Promise<ISigningSession> {
    const now = new Date().toISOString();
    const events = buildSigningSessionEvents(actor, now, input.externalDocumentId);
    const response = await this.context.spHttpClient.post(this.itemsUrl(), SPHttpClient.configurations.v1, {
      headers: {
        Accept: 'application/json;odata=nometadata',
        'Content-Type': 'application/json;odata=nometadata',
      },
      body: JSON.stringify({
        Title: input.subject,
        CorrespondenceId: input.correspondenceId,
        ReferenceNo: input.referenceNumber,
        Subject: input.subject,
        SignerName: input.signerName,
        SignerEmail: input.signerEmail ?? null,
        ExternalDocumentId: input.externalDocumentId ?? null,
        Status: 'Sent',
        SentAt: now,
        EventsJson: JSON.stringify(events),
      }),
    });
    if (!response.ok) {
      throw new Error(`Failed to create ${this.listName} item: ${response.status} ${response.statusText}`);
    }
    return this.toModel((await response.json()) as ISigningListItem);
  }

  public async resend(id: string, actor: string): Promise<ISigningSession | undefined> {
    return this.mutate(id, (session) => applyResend(session, actor, new Date().toISOString()));
  }

  public async cancel(id: string, actor: string, reason?: string): Promise<ISigningSession | undefined> {
    return this.mutate(id, (session) => applyCancel(session, actor, new Date().toISOString(), reason));
  }

  private async mutate(
    id: string,
    fn: (s: ISigningSession) => ISigningSession
  ): Promise<ISigningSession | undefined> {
    const getResp = await this.getWithSelectFallback(
      (select) => `${this.itemsUrl()}(${id})?$select=${select}`
    );
    if (!getResp.ok) {
      throw new Error(`Failed to read ${this.listName} item ${id}: ${getResp.status} ${getResp.statusText}`);
    }
    const current = this.toModel((await getResp.json()) as ISigningListItem);
    const next = fn(current);
    if (next === current) return current; // transition not applicable — no write
    const updateResp = await this.context.spHttpClient.post(
      `${this.itemsUrl()}(${id})`,
      SPHttpClient.configurations.v1,
      {
        headers: {
          Accept: 'application/json;odata=nometadata',
          'Content-Type': 'application/json;odata=nometadata',
          'IF-MATCH': '*',
          'X-HTTP-Method': 'MERGE',
        },
        body: JSON.stringify({
          Status: next.status,
          SentAt: next.sentAt ?? null,
          EventsJson: JSON.stringify(next.events),
        }),
      }
    );
    if (!updateResp.ok) {
      throw new Error(
        `Failed to update ${this.listName} item ${id}: ${updateResp.status} ${updateResp.statusText}`
      );
    }
    return next;
  }
}

function parseEvents(raw: string | undefined): ISigningEvent[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as ISigningEvent[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}
