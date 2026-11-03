import type { SPFI } from '@pnp/sp';
import { SECURITY_TIERS } from '../../models/ICorrespondence';
import { tierToSecurityLevel } from '../common/clearance';
import {
  IReclassificationDecision,
  IReclassificationInput,
  IReclassificationRequest,
  ReclassificationStatus,
} from '../../models/IReclassification';

const CORRESPONDENCE_LIST = 'CORMS_Correspondence';
const REQUESTS_LIST = 'CORMS_ReclassificationRequests';

const REQUEST_SELECT = [
  'Id',
  'CorrespondenceId',
  'CorrespondenceRef',
  'Subject',
  'FromTier',
  'ToTier',
  'FromLevel',
  'ToLevel',
  'Justification',
  'RequestedBy',
  'RequestedAt',
  'Status',
  'DecidedBy',
  'DecidedAt',
  'DecisionNote',
];

interface IRequestRow {
  Id: number;
  CorrespondenceId?: string;
  CorrespondenceRef?: string;
  Subject?: string;
  FromTier?: number;
  ToTier?: number;
  FromLevel?: string;
  ToLevel?: string;
  Justification?: string;
  RequestedBy?: string;
  RequestedAt?: string;
  Status?: string;
  DecidedBy?: string;
  DecidedAt?: string;
  DecisionNote?: string;
}

function tierName(tier: number): string {
  return SECURITY_TIERS.find((t) => t.tier === tier)?.name ?? String(tier);
}

function nowIso(): string {
  return new Date().toISOString();
}

function mapRow(row: IRequestRow): IReclassificationRequest {
  return {
    id: String(row.Id),
    correspondenceId: row.CorrespondenceId ?? '',
    correspondenceRef: row.CorrespondenceRef ?? '',
    subject: row.Subject ?? '',
    fromTier: row.FromTier ?? 0,
    toTier: row.ToTier ?? 0,
    fromLevel: row.FromLevel ?? '',
    toLevel: row.ToLevel ?? '',
    justification: row.Justification ?? '',
    requestedBy: row.RequestedBy ?? '',
    requestedAt: row.RequestedAt ?? '',
    status: (row.Status as ReclassificationStatus) || 'Pending',
    decidedBy: row.DecidedBy || undefined,
    decidedAt: row.DecidedAt || undefined,
    decisionNote: row.DecisionNote || undefined,
  };
}

/**
 * CMS-023 pure data logic. Applies (or requests) a security-level change on CORMS_Correspondence
 * and records maker-checker requests in CORMS_ReclassificationRequests. Only SecurityLevel is ever
 * written; RecordClassification (the file-plan classification) is untouched (AC4), and because
 * clearance filtering reads SecurityLevel, a persisted change takes effect immediately (AC5). The
 * audit entry (before/after level, actor, timestamp, justification — AC3) is written by the callers
 * via the shared audit path, the same way every other CORMS action audits. See provisioningCore.ts
 * for why Core only imports the SPFI type.
 */
export class ReclassificationServiceCore {
  constructor(private readonly sp: SPFI) {}

  private async applySecurityLevel(correspondenceId: string, toTier: number): Promise<void> {
    const idNum = Number(correspondenceId);
    if (!idNum) return;
    await this.sp.web.lists
      .getByTitle(CORRESPONDENCE_LIST)
      .items.getById(idNum)
      .update({ SecurityLevel: tierToSecurityLevel(toTier) ?? '' });
  }

  public async applyDirect(input: IReclassificationInput): Promise<void> {
    await this.applySecurityLevel(input.correspondenceId, input.toTier);
  }

  public async requestReclassification(input: IReclassificationInput): Promise<void> {
    await this.sp.web.lists.getByTitle(REQUESTS_LIST).items.add({
      Title: `${input.correspondenceRef} — ${tierName(input.fromTier)} → ${tierName(input.toTier)}`,
      CorrespondenceId: input.correspondenceId,
      CorrespondenceRef: input.correspondenceRef,
      Subject: input.subject,
      FromTier: input.fromTier,
      ToTier: input.toTier,
      FromLevel: tierName(input.fromTier),
      ToLevel: tierName(input.toTier),
      Justification: input.justification,
      RequestedBy: input.actor,
      RequestedAt: nowIso(),
      Status: 'Pending',
    });
  }

  public async getPendingRequests(): Promise<IReclassificationRequest[]> {
    const rows = (await this.sp.web.lists
      .getByTitle(REQUESTS_LIST)
      .items.filter(`Status eq 'Pending'`)
      .select(...REQUEST_SELECT)
      .orderBy('RequestedAt', true)()) as IRequestRow[];
    return rows.map(mapRow);
  }

  public async decideRequest(decision: IReclassificationDecision): Promise<void> {
    const idNum = Number(decision.requestId);
    if (!idNum) return;
    const requests = this.sp.web.lists.getByTitle(REQUESTS_LIST);
    const row = (await requests.items.getById(idNum).select(...REQUEST_SELECT)()) as IRequestRow;
    const status: ReclassificationStatus = decision.approve ? 'Approved' : 'Rejected';
    await requests.items.getById(idNum).update({
      Status: status,
      DecidedBy: decision.decidedBy,
      DecidedAt: nowIso(),
      DecisionNote: decision.decisionNote ?? '',
    });
    // AC2/AC5 — approving applies the level change (and thus updates access control) now.
    if (decision.approve && row.CorrespondenceId && typeof row.ToTier === 'number') {
      await this.applySecurityLevel(row.CorrespondenceId, row.ToTier);
    }
  }
}
