import {
  CorrespondenceDetailResult,
  ICorrespondenceDetailService,
  IDetailFieldPatch,
  TabResult,
} from '../interfaces/ICorrespondenceDetailService';
import { CorrespondenceStatus, ICorrespondenceStub } from '../../models/ICorrespondence';
import {
  IAttachment,
  IAttachmentsResult,
  IAuditEntry,
  ICorrespondenceDetail,
  IDeclarationResult,
  IReminder,
  ISecurityPrincipal,
  ITimelineEvent,
  IFilePlanInfo,
  IDeliveryRecipient,
} from '../../models/ICorrespondenceDetail';
import { IAnnotationItem } from '../../models/IGroupDocs';
import { formatRecordSerial } from '../common/recordSerial';
import { parseStoredAnnotations, serializeAnnotations } from './annotationStore';
import correspondenceMock from '../../mocks/correspondence.json';
import correspondenceDetailsMock from '../../mocks/correspondenceDetails.json';
import recordClassificationsMock from '../../mocks/recordClassifications.json';
import { IRecordClassification } from '../../models/ICorrespondenceMetadata';

const SIMULATED_LATENCY_MS = 150;

// Public, stable sample PDFs used only so the Preview/Files tabs have something real to open
// and render in dev — stand in for the real SharePoint document URL a live RecordsHub API
// would return.
const SAMPLE_PDF_MAIN = 'https://mozilla.github.io/pdf.js/web/compressed.tracemonkey-pldi-09.pdf';
const SAMPLE_PDF_ANNEX = 'https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf';

function delay<T>(value: T): Promise<T> {
  return new Promise((resolve) => setTimeout(() => resolve(value), SIMULATED_LATENCY_MS));
}

interface IDetailOverride {
  originatingFunction?: string;
  contentType?: string;
  channel?: string;
  priorityReason?: string;
  comment?: string;
  filePlan?: IFilePlanInfo;
  attachments?: IAttachment[];
  securityPrincipals?: ISecurityPrincipal[];
  reminder?: { date: string; followUpType: string; note: string };
  delivery?: IDeliveryRecipient[];
}

const overridesById = correspondenceDetailsMock as Record<string, IDetailOverride>;

// CMS-042 — session-lived reminder store so save/clear persist across getReminder calls in mock
// mode (no SharePoint list behind it). `undefined` value = explicitly cleared.
const reminderStore = new Map<string, IReminder | undefined>();
// CMS-008 — session counter for the mock record serial number (no persistent store in mock mode).
let declareCounter = 0;
// CMS-024 — session-lived annotation store so create/save round-trip and reload across getAnnotations
// calls in mock mode (no SharePoint column behind it). Serialized through the same envelope the live
// column uses, so mock exercises the real (de)serialization path.
const annotationStoreById = new Map<string, string>();
const allStubs = correspondenceMock as ICorrespondenceStub[];
const recordClassifications = recordClassificationsMock as IRecordClassification[];

/** Business-activity File a correspondence's record classification files under — deterministic per
 * department since no real file-plan API exists yet (TODO(confirm) per ICorrespondenceDetail). */
function defaultFilePlan(stub: ICorrespondenceStub): IFilePlanInfo {
  return {
    fileNumber: `FP-${stub.department.slice(0, 3).toUpperCase()}-2025-001`,
    fileName: `${stub.department} — General Correspondence`,
    filePlanPosition: '1.0.0',
  };
}

function defaultAttachments(stub: ICorrespondenceStub): IAttachment[] {
  if (!stub.hasAttachment) return [];
  return [
    {
      id: `${stub.id}-att-1`,
      name: `${stub.type.toLowerCase()}_document.pdf`,
      pages: 4,
      source: 'SharePoint library',
      isMain: true,
      url: SAMPLE_PDF_MAIN,
    },
    {
      id: `${stub.id}-att-2`,
      name: 'supporting_annex.pdf',
      pages: 1,
      source: 'RecordHub · 500012',
      isMain: false,
      url: SAMPLE_PDF_ANNEX,
    },
  ];
}

function defaultSecurityPrincipals(stub: ICorrespondenceStub): ISecurityPrincipal[] {
  return [
    { id: 'sp-1', principal: `${stub.department} Team`, permissionLevel: 'Edit', type: 'SharePoint Group' },
    {
      id: 'sp-2',
      principal: stub.currentReviewer || stub.senderName || 'Unassigned',
      permissionLevel: 'Read',
      type: 'User',
    },
    {
      id: 'sp-3',
      principal: 'Records Administrators',
      permissionLevel: 'Full Control',
      type: 'SharePoint Group',
    },
  ];
}

function offsetDate(dateStr: string, days: number, hhmm: string): string {
  const d = new Date(`${dateStr}T00:00:00`);
  d.setDate(d.getDate() + days);
  return `${d.toISOString().slice(0, 10)} ${hhmm}`;
}

function buildTimeline(stub: ICorrespondenceStub): ITimelineEvent[] {
  const events: ITimelineEvent[] = [
    {
      id: `${stub.id}-tl-1`,
      kind: 'created',
      actor: stub.senderName || stub.currentReviewer || 'System',
      details: 'Correspondence created',
      timestamp: offsetDate(stub.createdAt, 0, '09:00'),
    },
  ];
  if (stub.status !== 'Draft') {
    events.push({
      id: `${stub.id}-tl-2`,
      kind: 'submitted',
      actor: stub.currentReviewer || 'System',
      details: 'Submitted for review',
      timestamp: offsetDate(stub.createdAt, 1, '10:15'),
    });
  }
  if (stub.referenceNumber) {
    events.push({
      id: `${stub.id}-tl-3`,
      kind: 'referenceAssigned',
      actor: 'System',
      details: `Reference: ${stub.referenceNumber}`,
      timestamp: offsetDate(stub.createdAt, 1, '10:16'),
    });
  }
  if (stub.currentReviewer && stub.status !== 'Draft') {
    events.push({
      id: `${stub.id}-tl-4`,
      kind: 'routed',
      actor: 'System',
      details: `Routed to ${stub.currentReviewer} for review`,
      timestamp: offsetDate(stub.createdAt, 1, '11:00'),
    });
  }
  if (['Approved', 'Signed', 'Declared', 'Delivered'].indexOf(stub.status) !== -1) {
    events.push({
      id: `${stub.id}-tl-5`,
      kind: 'approved',
      actor: stub.currentReviewer || 'System',
      details: 'Approved',
      timestamp: offsetDate(stub.createdAt, 2, '14:00'),
    });
  }
  if (stub.signatureRequired) {
    events.push({
      id: `${stub.id}-tl-6`,
      kind: 'signatureRequested',
      actor: 'System',
      details: 'Sent for digital signature',
      timestamp: offsetDate(stub.createdAt, 3, '09:30'),
    });
    if (stub.isSigned) {
      events.push({
        id: `${stub.id}-tl-7`,
        kind: 'signed',
        actor: stub.currentReviewer || 'System',
        details: 'Document signed digitally',
        timestamp: offsetDate(stub.createdAt, 3, '15:45'),
      });
    }
  }
  if (stub.status === 'Delivered') {
    events.push({
      id: `${stub.id}-tl-8`,
      kind: 'emailSent',
      actor: 'System',
      details: 'Delivered via email to recipients',
      timestamp: offsetDate(stub.createdAt, 4, '08:00'),
    });
  }
  // Reply events: any item whose parentId points back at this one.
  allStubs
    .filter((s) => s.parentId === stub.id)
    .forEach((reply, i) => {
      events.push({
        id: `${stub.id}-tl-reply-${i}`,
        kind: 'reply',
        actor: reply.senderName || 'Unknown',
        details: `Reply received: ${reply.subject}`,
        timestamp: offsetDate(reply.createdAt, 0, '09:00'),
      });
    });
  return events.sort((a, b) => a.timestamp.localeCompare(b.timestamp));
}

function buildAuditSeed(stub: ICorrespondenceStub): IAuditEntry[] {
  const seed: IAuditEntry[] = [
    {
      id: `${stub.id}-au-1`,
      seq: 1,
      action: 'Created',
      actor: stub.senderName || 'System',
      details: `Created ${stub.type.toLowerCase()}: ${stub.subject}`,
      timestamp: offsetDate(stub.createdAt, 0, '09:00'),
    },
  ];
  if (stub.status !== 'Draft') {
    seed.push({
      id: `${stub.id}-au-2`,
      seq: 2,
      action: 'Submitted',
      actor: stub.senderName || 'System',
      details: 'Submitted for review',
      timestamp: offsetDate(stub.createdAt, 1, '10:15'),
    });
  }
  return seed;
}

// CMS-020/021 — the create-form's own Delivery Options today only capture two booleans
// (deliveryEmail/deliveryPhysicalMail, no per-channel status/acknowledgement tracking), so
// there is nothing on the stub itself to reuse verbatim; this derives a plausible read-only
// delivery record for dispatched Outgoing/External items instead. TODO(confirm): no Figma
// frame yet — modeled on shared components + story ACs.
const DISPATCHED_STATUSES = ['Approved', 'Signed', 'Declared', 'Delivered'];

function defaultDelivery(stub: ICorrespondenceStub): IDeliveryRecipient[] {
  if (
    (stub.direction !== 'Outgoing' && stub.direction !== 'External') ||
    DISPATCHED_STATUSES.indexOf(stub.status) === -1
  ) {
    return [];
  }
  const sentAt = offsetDate(stub.createdAt, 4, '08:00');
  const emailStatus = stub.status === 'Delivered' ? 'Delivered' : 'Sent';
  const primary: IDeliveryRecipient = {
    id: `${stub.id}-recipient-1`,
    name: stub.recipientName || stub.department,
    isCc: false,
    channels: [{ channel: 'Email', status: emailStatus, timestamp: sentAt }],
  };
  // Every other securityTier gets a Physical Mail channel too, purely to show the read-only
  // dispatch-method field set (courier/in-person/postal) varying across the mock dataset.
  if (stub.securityTier % 2 === 0) {
    primary.channels.push({
      channel: 'PhysicalMail',
      status: 'Sent',
      timestamp: sentAt,
      dispatchMethod: 'Courier',
      courierName: 'Aramex',
      trackingNumber: `TRK-${stub.id.replace('C-', '')}`,
    });
  }
  return [primary];
}

function resolveRecordClassificationName(stub: ICorrespondenceStub): string | undefined {
  if (!stub.recordClassificationId) return undefined;
  return recordClassifications.find((rc) => rc.id === stub.recordClassificationId)?.name;
}

function buildDetail(stub: ICorrespondenceStub): ICorrespondenceDetail {
  const override = overridesById[stub.id] ?? {};
  return {
    ...stub,
    originatingFunction: override.originatingFunction ?? stub.department,
    // Content Type (Letter/Memo/…) and Channel (how it arrived) are distinct from the direction the
    // stub's `type` carries — defaulted here so the Details tab shows them populated in mock/review.
    contentType: override.contentType ?? 'Letter',
    channel: override.channel ?? 'Email',
    priorityReason: override.priorityReason,
    comment: override.comment,
    recordClassificationName: resolveRecordClassificationName(stub),
    filePlan: override.filePlan ?? defaultFilePlan(stub),
    delivery: override.delivery ?? defaultDelivery(stub),
    // The demo user stands in for every item's requestor so the approver management is reviewable.
    viewerIsRequestor: true,
  };
}

// Mock-only for now (no live RecordsHub/RecordHub API exists for correspondence detail, security
// principals, or audit history yet) — same "mock-only, no live pair" wiring as workflowMatrixService
// in bootstrap.ts, swappable for a real implementation once the API exists.
//
// CMS-040 Part 1 — mock users are always clearanceTier 5 (src/mocks/users.json) so the
// accessDenied branch of TabResult<T> is never exercised here — dev/mock mode always sees full
// detail on every one of the 7 methods below, matching this service's pre-existing behavior. The
// live implementation is what actually enforces AC9; see CorrespondenceDetailServiceCore.
export class CorrespondenceDetailServiceMock implements ICorrespondenceDetailService {
  public getDetail(id: string): Promise<CorrespondenceDetailResult> {
    const stub = allStubs.find((s) => s.id === id);
    return delay(stub ? buildDetail(stub) : undefined);
  }

  public getAttachments(id: string): Promise<TabResult<IAttachmentsResult>> {
    const stub = allStubs.find((s) => s.id === id);
    if (!stub) return delay({ uploaded: [], physical: [] });
    const override = overridesById[id];
    return delay({ uploaded: override?.attachments ?? defaultAttachments(stub), physical: [] });
  }

  public getSecurityAssignments(id: string): Promise<TabResult<ISecurityPrincipal[]>> {
    const stub = allStubs.find((s) => s.id === id);
    if (!stub) return delay([]);
    const override = overridesById[id];
    return delay(override?.securityPrincipals ?? defaultSecurityPrincipals(stub));
  }

  public getAuditTrail(id: string): Promise<TabResult<IAuditEntry[]>> {
    const stub = allStubs.find((s) => s.id === id);
    return delay(stub ? buildAuditSeed(stub) : []);
  }

  public getTimeline(id: string): Promise<TabResult<ITimelineEvent[]>> {
    const stub = allStubs.find((s) => s.id === id);
    return delay(stub ? buildTimeline(stub) : []);
  }

  public getThread(_id: string, chainId: string): Promise<TabResult<ICorrespondenceStub[]>> {
    if (!chainId) return delay([]);
    // CMS-022 — chain identified by the controlled number: match chainId or the reference number.
    return delay(
      allStubs
        .filter((s) => s.chainId === chainId || s.referenceNumber === chainId)
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
    );
  }

  public getReminder(id: string): Promise<TabResult<IReminder | undefined>> {
    if (reminderStore.has(id)) return delay(reminderStore.get(id));
    const override = overridesById[id];
    return delay(override?.reminder as IReminder | undefined);
  }

  public saveReminder(id: string, reminder: IReminder): Promise<TabResult<void>> {
    if (!reminder.date) return delay(undefined);
    reminderStore.set(id, reminder);
    return delay(undefined);
  }

  public clearReminder(id: string): Promise<TabResult<void>> {
    reminderStore.set(id, undefined);
    return delay(undefined);
  }

  // CMS-008 — declare the draft as a final record. No persistent CORMS_Correspondence store in mock
  // mode, so the serial is issued from a session counter; the view stamps the returned result onto
  // its local detail state (applyDeclaration). Record classification is echoed from the stub.
  //
  // Template provenance is optional; any approved outgoing correspondence may be declared.
  public declareRecord(id: string, declaredBy: string): Promise<TabResult<IDeclarationResult>> {
    const stub = allStubs.find((s) => s.id === id);
    declareCounter += 1;
    return delay({
      declaredBy,
      declaredAt: new Date().toISOString(),
      recordSerialNumber: formatRecordSerial(new Date().getFullYear(), declareCounter),
      recordClassification: stub?.recordClassificationName,
    });
  }

  // CMS-024 — annotations round-trip through a session store, serialized via the same envelope the
  // live column uses, so create→save→reload behaves in dev exactly as it does against SharePoint.
  public getAnnotations(id: string): Promise<TabResult<IAnnotationItem[]>> {
    return delay(parseStoredAnnotations(annotationStoreById.get(id)));
  }

  public saveAnnotations(id: string, annotations: IAnnotationItem[]): Promise<TabResult<void>> {
    annotationStoreById.set(id, serializeAnnotations(annotations));
    return delay(undefined);
  }

  // Session-only in mock mode — the caller patches its local detail state; nothing persists.
  public updateDetails(
    _id: string,
    _patch: IDetailFieldPatch,
    _changeComment: string
  ): Promise<TabResult<void>> {
    return delay(undefined);
  }

  // Session-only in mock mode — the caller patches its local detail/timeline state.
  public setStatus(_id: string, _status: CorrespondenceStatus): Promise<TabResult<void>> {
    return delay(undefined);
  }

  public saveSignedMainDocument(id: string, _signedPdf: Blob): Promise<TabResult<string>> {
    const stub = allStubs.find((s) => s.id === id);
    return delay(stub ? `${stub.referenceNumber || stub.id} (signed).pdf` : 'Signed document.pdf');
  }

  public addTimelineEntry(_id: string, _eventType: string, _description: string): Promise<TabResult<void>> {
    return delay(undefined);
  }

  // No persistent audit store in mock mode — logging a warning is enough to make silent
  // no-behavior visible during dev, matching the "stubbed as local-state-only" note this task
  // replaces on the live side.
  public logView(): Promise<void> {
    return Promise.resolve();
  }
}
