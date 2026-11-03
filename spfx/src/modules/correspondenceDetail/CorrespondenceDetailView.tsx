import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { useServices, useNav } from '../../state/hooks';
import { Spinner } from '../../components/common/Spinner';
import { SECURITY_TIERS, ICorrespondenceStub, IAwaitedParty } from '../../models/ICorrespondence';
import {
  IAttachment,
  IAuditEntry,
  ICorrespondenceDetail,
  IPhysicalAttachmentStub,
  IReminder,
  ITimelineEvent,
} from '../../models/ICorrespondenceDetail';
import { canSignCorrespondence, applySignature } from '../../utils/signature';
import { buildSharePointItemUrl } from '../../services/common/sharePointItemLink';
import { IReplyPrefill, buildForwardPrefill, buildReplyPrefill } from '../../utils/replyPrefill';
import {
  applyClearPendingResponse,
  applyExpedite,
  applyFlagPendingResponse,
  applyRemoveExpedite,
} from '../../utils/correspondenceFlags';
import { IActionsMenuItem } from '../../components/common/ActionsMenu';
import { FlagPendingResponseModal } from '../../components/common/FlagPendingResponseModal';
import { ExpediteReasonModal } from '../../components/common/ExpediteReasonModal';
import { ActionCommentModal } from '../../components/common/ActionCommentModal';
import {
  canDeclareRecord,
  canEditDetailFields,
  canShareCorrespondence,
  isAssignedTo,
  reclassifyGoesDirect,
} from './roleHelpers';
import { applyDeclaration, canDeclare, isImmutable } from './declaration';
import { isAccessDenied, IDetailFieldPatch } from '../../services/interfaces/ICorrespondenceDetailService';
import {
  diffDetailPatch,
  formatDetailChanges,
  IDetailBefore,
} from '../../services/correspondenceDetail/detailChangeSummary';
import { IFieldChangeMeta } from './components/DetailsTab';
import { BulkActionForbiddenError } from '../../services/interfaces/IBulkActionsService';
import { DetailTab, IDetailNavState } from './types';
import { DetailHeader } from './components/DetailHeader';
import { SendForSignatureModal } from './components/SendForSignatureModal';
import { SigningFrameModal, SigningFrameOutcome } from './components/SigningFrameModal';
import { ISignatureRequestResult, ISignatureSigner } from '../../models/IESignature';
import { pageSigningReturnUrl } from '../../services/esignature/signingReturn';
import { APPROVAL_TIMELINE_EVENTS, saveSignedDocumentAsMain } from '../approvalTasks/approvalTaskActions';
import { AccessDeniedView } from './components/AccessDeniedView';
import { PreviewTab } from './components/PreviewTab';
import { AnnotateTab } from './components/AnnotateTab';
import { DetailsTab } from './components/DetailsTab';
import { FilesTab } from './components/FilesTab';
import { FilePlanTab } from './components/FilePlanTab';
import { SecurityTab } from './components/SecurityTab';
import { ReclassifyModal } from './components/ReclassifyModal';
import { AuditTab } from './components/AuditTab';
import { TimelineTab } from './components/TimelineTab';
import { ThreadTab } from './components/ThreadTab';
import { ReminderTab } from './components/ReminderTab';
import { ApprovalsTab } from './components/ApprovalsTab';
import { ReplyModal } from './components/ReplyModal';
import { ShareLinkModal } from './components/ShareLinkModal';
import styles from './CorrespondenceDetailView.module.scss';

const DEFAULT_MAX_CLEARANCE = 1;

const TAB_CONFIG: { id: DetailTab; labelKey: string }[] = [
  { id: 'preview', labelKey: 'correspondenceDetail.tab.preview' },
  { id: 'annotate', labelKey: 'correspondenceDetail.tab.annotate' },
  { id: 'details', labelKey: 'correspondenceDetail.tab.details' },
  { id: 'files', labelKey: 'correspondenceDetail.tab.files' },
  { id: 'file', labelKey: 'correspondenceDetail.tab.file' },
  { id: 'security', labelKey: 'correspondenceDetail.tab.security' },
  { id: 'audit', labelKey: 'correspondenceDetail.tab.audit' },
  { id: 'timeline', labelKey: 'correspondenceDetail.tab.timeline' },
];

// Every tab switch is audited. A switch that triggers the tab's own service fetch is written
// server-side by that fetch (CMS-040 Part 1/4) and only echoed locally here; every other switch
// writes its own row through logView — see handleTabClick. 'preview' is covered by the "Viewed
// Correspondence" entry logged once on open instead of a per-click entry.
const TAB_VIEW_AUDIT: Partial<Record<DetailTab, string>> = {
  annotate: 'Opened Annotate',
  details: 'Viewed Details',
  files: 'Viewed Attachments',
  file: 'Viewed File Plan',
  security: 'Viewed Security',
  audit: 'Viewed Audit',
  timeline: 'Viewed Timeline',
  thread: 'Viewed Thread',
  reminder: 'Viewed Reminder',
  // The Approvals tab loads from CORMS_ApprovalTasks (not one of the detail service's own
  // audit-writing fetches), so its view is not audited server-side — write it here like the other
  // no-server-audit tabs so opening Approvals is recorded too.
  approvals: 'Viewed Approvals',
};

let auditSeqCounter = 0;
function nextAuditId(): string {
  auditSeqCounter += 1;
  return `session-au-${auditSeqCounter}`;
}

// Audit rows must read newest-first by time. `seq` is only a display row number, so it must reflect
// timestamp order — otherwise the grid (which sorts on `seq`) shows rows in fetch/merge order, not
// chronologically. Timestamps are mixed (ES ISO, and this session's "YYYY-MM-DD HH:mm" echoes), so
// they are parsed to epoch ms for a stable comparison; an unparseable one sorts last.
function auditEpoch(timestamp: string): number {
  const ms = new Date(timestamp).getTime();
  return Number.isNaN(ms) ? 0 : ms;
}
function resequenceByTimestamp(rows: IAuditEntry[]): IAuditEntry[] {
  // Number oldest → newest (seq #1 is the earliest event), so the grid's default `seq` desc sort
  // puts the newest event at the top — i.e. sorted by timestamp descending.
  return [...rows]
    .sort((a, b) => auditEpoch(a.timestamp) - auditEpoch(b.timestamp))
    .map((row, index) => ({ ...row, seq: index + 1 }));
}

// Full ISO-8601 UTC (with the trailing 'Z'), the same shape the Elasticsearch audit/timeline rows
// carry — so an optimistic session echo parses to the correct instant for sorting and renders in the
// viewer's local time (formatCardDateTime) exactly like a fetched row. The old
// "YYYY-MM-DD HH:mm" form dropped the 'Z', so a UTC time was re-read as local and a fresh echo
// looked hours in the past (sorting to the bottom, and off by the site's UTC offset on screen).
function nowTimestamp(): string {
  return new Date().toISOString();
}

const CorrespondenceDetailView: React.FC = () => {
  const { t } = useTranslation();
  const { id } = useParams<{ id: string }>();
  const location = useLocation();
  const navigate = useNavigate();
  const {
    correspondenceDetailService,
    bulkActionsService,
    correspondenceService,
    reclassificationService,
    eSignatureService,
    signingService,
  } = useServices();
  const { currentUser, currentRole } = useNav();

  const navState = (location.state as IDetailNavState | null) ?? {};
  const backPath = navState.originPath ?? '/my-correspondence';
  const backLabel = navState.originLabel ?? t('myCorrespondence.masterLog');

  const [detail, setDetail] = React.useState<ICorrespondenceDetail | undefined>(undefined);
  const [notFound, setNotFound] = React.useState(false);
  const [accessDenied, setAccessDenied] = React.useState(false);
  const [attachments, setAttachments] = React.useState<IAttachment[]>([]);
  // Attachments load in a separate call after `detail` resolves — the Preview tab uses this to
  // keep its loader up instead of flashing the "can't preview" fallback before they arrive.
  const [attachmentsLoaded, setAttachmentsLoaded] = React.useState(false);
  const [physicalAttachments, setPhysicalAttachments] = React.useState<IPhysicalAttachmentStub[]>([]);
  const [threadItems, setThreadItems] = React.useState<ICorrespondenceStub[]>([]);
  const [tab, setTab] = React.useState<DetailTab>(navState.tab ?? 'preview');
  const [auditRows, setAuditRows] = React.useState<IAuditEntry[]>([]);
  const [auditLoaded, setAuditLoaded] = React.useState(false);
  // Distinct from auditLoaded (which flips as soon as the fetch is *kicked off*): true only while
  // the Elasticsearch getAuditTrail call is actually in flight, so the tab shows a spinner instead
  // of the handful of optimistic session echoes until the full history arrives.
  const [auditLoading, setAuditLoading] = React.useState(false);
  const [timeline, setTimeline] = React.useState<ITimelineEvent[]>([]);
  const [timelineLoaded, setTimelineLoaded] = React.useState(false);
  const [reminder, setReminder] = React.useState<IReminder | undefined>(undefined);
  const [reminderLoaded, setReminderLoaded] = React.useState(false);
  const [replyModalOpen, setReplyModalOpen] = React.useState(false);
  // Honor the "Share Link" row action's request to open the share modal straight away (CMS-035).
  const [shareModalOpen, setShareModalOpen] = React.useState(!!navState.openShare);
  const [shareLink, setShareLink] = React.useState<string | undefined>(undefined);
  const [reclassifyModalOpen, setReclassifyModalOpen] = React.useState(false);
  const [expediteModalOpen, setExpediteModalOpen] = React.useState(false);
  // The modal captures the signer before the request is raised. The action is shown for Outgoing
  // items; a missing Power Automate flow configuration surfaces a clear error rather than failing silently.
  const [signatureModalOpen, setSignatureModalOpen] = React.useState(false);
  // The signing page shown in-app after a standalone Send for e-Signature.
  const [signingPage, setSigningPage] = React.useState<ISignatureRequestResult | undefined>(undefined);
  const [signatureBusy, setSignatureBusy] = React.useState(false);
  const [signatureError, setSignatureError] = React.useState<string | undefined>(undefined);
  const [flagModalOpen, setFlagModalOpen] = React.useState(false);
  // CMS-040 — Details-tab inline edits are staged locally until Save; `detailsDirty` enables the
  // Save button, and the save first captures a mandatory change comment in the modal.
  const [detailsDirty, setDetailsDirty] = React.useState(false);
  const [detailsSaveModalOpen, setDetailsSaveModalOpen] = React.useState(false);
  // The typed patch accumulated from the staged Details edits (Originating Function / Due Date /
  // Assigned To / Comments), and the field values as they were before editing began — the latter
  // drives the exact before→after summary echoed to the Audit tab on save. Refs, not state: they
  // change only on edit/save and must not re-render the field list mid-typing.
  const stagedPatchRef = React.useRef<IDetailFieldPatch>({});
  const detailsBeforeRef = React.useRef<IDetailBefore>({});
  // Set by the final approval's status change so the audit handler (which runs just after) writes the
  // "Correspondence approved" summary Timeline event last, after the step-approved event.
  const finalApprovalPendingRef = React.useRef(false);

  const loggedOpenRef = React.useRef<string | undefined>(undefined);

  // Local-only append, so the Audit tab reflects an event in the same session without a second
  // round trip. Never used on its own for an event that isn't also written server-side — an audit
  // trail that shows entries nobody recorded is worse than one that shows none.
  const echoAudit = React.useCallback(
    (action: string, details: string): void => {
      setAuditRows((prev) =>
        resequenceByTimestamp([
          ...prev,
          {
            id: nextAuditId(),
            seq: 0,
            action,
            actor: currentUser?.displayName ?? 'Unknown',
            details,
            timestamp: nowTimestamp(),
          },
        ])
      );
    },
    [currentUser]
  );

  const logAudit = React.useCallback(
    (action: string, details: string): void => {
      echoAudit(action, details);
      // Real Elasticsearch audit write — fire-and-forget: an audit failure never blocks the UI.
      if (detail) {
        correspondenceDetailService.logView(detail.id, action, details).catch(() => undefined);
      }
    },
    [echoAudit, detail, correspondenceDetailService]
  );

  // Load the item whenever the route id changes. getDetail() now only carries header/Details-tab
  // fields (CMS-040 Part 1) — Attachments and Thread are fetched right alongside it since Preview
  // (the default tab) and the tab strip itself (hasThread) both need them immediately; Security/
  // Audit/Timeline/Reminder are each fetched lazily, on first activation of their own tab, via
  // their own independently-gated service method (see the per-tab effects below).
  React.useEffect(() => {
    if (!id) return;
    setDetail(undefined);
    setNotFound(false);
    setAccessDenied(false);
    setAttachments([]);
    setAttachmentsLoaded(false);
    setPhysicalAttachments([]);
    setThreadItems([]);
    setAuditRows([]);
    setAuditLoaded(false);
    setAuditLoading(false);
    setTimeline([]);
    setTimelineLoaded(false);
    setReminder(undefined);
    setReminderLoaded(false);

    correspondenceDetailService
      .getDetail(id)
      .then((result) => {
        if (!result) {
          console.warn(
            `[CorrespondenceDetailView] getDetail('${id}') resolved undefined — item not found or id is not a valid numeric SharePoint list item id.`
          );
          setNotFound(true);
          return;
        }
        // Clearance denial is enforced server-side (CMS-040 AC9) — a denied result carries no
        // metadata at all, so `detail` is never set and nothing about the item ever reaches this
        // component's state, not just the rendered output.
        if (isAccessDenied(result)) {
          setAccessDenied(true);
          return;
        }
        setDetail(result);

        correspondenceDetailService
          .getAttachments(id)
          .then((att) => {
            if (isAccessDenied(att)) return;
            setAttachments(att.uploaded);
            setPhysicalAttachments(att.physical);
          })
          .catch(() => undefined)
          .finally(() => setAttachmentsLoaded(true));

        if (result.chainId) {
          correspondenceDetailService
            .getThread(id, result.chainId)
            .then((thread) => {
              if (!isAccessDenied(thread)) setThreadItems(thread);
            })
            .catch(() => undefined);
        }
      })
      .catch((err) => {
        // getDetail() rejecting is NOT the normal "not found" path (that resolves undefined) — it
        // means the SharePoint call itself threw (e.g. a $select/$expand naming a column that
        // doesn't exist yet on this tenant, a permissions error, network failure, ...). Logged here
        // because the UI collapses both cases to the same "not found" message and this is otherwise
        // silent — check this line first when that message shows up unexpectedly.
        console.error(`[CorrespondenceDetailView] getDetail('${id}') threw — see the real error below:`, err);
        setNotFound(true);
      });
  }, [id, correspondenceDetailService]);

  // Reset per-item transient UI state and log "Viewed Correspondence" once per item.
  React.useEffect(() => {
    if (!detail || loggedOpenRef.current === detail.id) return;
    loggedOpenRef.current = detail.id;
    setTab(navState.tab ?? 'preview');
    setShareLink(undefined);
    logAudit('Viewed Correspondence', `Opened correspondence: ${detail.subject}`);
  }, [detail?.id]);

  // Lazy per-tab loads (CMS-040 Part 1) — each fires only once per item, on first activation of
  // its own tab, through its own independently-clearance-gated, self-auditing service method.
  React.useEffect(() => {
    if (tab === 'audit' && detail && !auditLoaded) {
      setAuditLoaded(true);
      setAuditLoading(true);
      correspondenceDetailService
        .getAuditTrail(detail.id)
        .then((rows) => {
          if (isAccessDenied(rows)) return;
          // The server (Elasticsearch) rows are the single source of truth — identical for every
          // user who opens this item. This session's optimistic echoes were also written
          // server-side, so blindly prepending them double-counts the acting user's own actions
          // (which is exactly why two users saw different audit totals). Keep the server rows and
          // only carry forward echoes that ES hasn't indexed yet (matched by action+details), so a
          // just-performed action still shows without being duplicated.
          const serverKeys = new Set(rows.map((r) => `${r.action}|${r.details}`));
          setAuditRows((prev) => {
            const pendingEchoes = prev.filter((e) => !serverKeys.has(`${e.action}|${e.details}`));
            // Sort the combined set newest-first by timestamp and re-number, so the grid's `seq`
            // sort is chronological rather than fetch/merge order.
            return resequenceByTimestamp([...rows, ...pendingEchoes]);
          });
        })
        .catch(() => undefined)
        .finally(() => setAuditLoading(false));
    }
  }, [tab, detail, auditLoaded, correspondenceDetailService]);

  React.useEffect(() => {
    if (tab === 'timeline' && detail && !timelineLoaded) {
      setTimelineLoaded(true);
      correspondenceDetailService
        .getTimeline(detail.id)
        .then((events) => {
          if (!isAccessDenied(events)) setTimeline(events);
        })
        .catch(() => undefined);
    }
  }, [tab, detail, timelineLoaded, correspondenceDetailService]);

  React.useEffect(() => {
    if (tab === 'reminder' && detail && !reminderLoaded) {
      setReminderLoaded(true);
      // CMS-042 — hydrate any reminder already set on the item so it's shown for edit/clear (AC4).
      correspondenceDetailService
        .getReminder(detail.id)
        .then((result) => {
          if (!isAccessDenied(result)) setReminder(result);
        })
        .catch(() => undefined);
    }
  }, [tab, detail, reminderLoaded, correspondenceDetailService]);

  if (!id) return null;

  if (notFound) {
    return (
      <div className={styles.page}>
        <div className={styles.notFound}>{t('correspondenceDetail.notFound')}</div>
      </div>
    );
  }

  if (accessDenied) {
    return (
      <div className={styles.page}>
        <AccessDeniedView />
      </div>
    );
  }

  if (!detail) {
    return (
      <div className={styles.page}>
        <Spinner />
      </div>
    );
  }

  const maxClearanceTier = currentUser?.clearanceTier ?? DEFAULT_MAX_CLEARANCE;
  const canView = detail.securityTier <= maxClearanceTier;

  // CMS-040 AC9 — "renders an access-denied state and no content". The live service already
  // denies server-side (the isAccessDenied branch above, which never populates `detail` at all),
  // but this second, client-side check still has to hold for any path where a full detail object
  // did reach the client and the acting identity's clearance says otherwise. It used to render
  // the DetailHeader above the denial panel, which leaked the subject and reference number into
  // the DOM — exactly the content the AC says must not render. Return before anything but the
  // return-to-list action exists.
  if (!canView) {
    return (
      <div className={styles.page}>
        <DetailHeader backPath={backPath} backLabel={backLabel} />
        <AccessDeniedView
          securityLevelName={SECURITY_TIERS.find((tier) => tier.tier === detail.securityTier)?.name}
        />
      </div>
    );
  }

  const isReceived = detail.direction === 'Incoming';
  const isSent = detail.direction === 'Outgoing' || detail.direction === 'External';
  // The Approvals tab manages the chain, so it is for the requestor and System Administrators;
  // approvers sign and decide from the Approval Tasks screen.
  const isSystemAdmin = currentRole === 'SystemAdministrator';
  const canSeeApprovals = isSent && (!!detail.viewerIsRequestor || isSystemAdmin);
  const hasThread = !!detail.chainId && threadItems.length > 1;
  const securityLevelName = SECURITY_TIERS.find((tier) => tier.tier === detail.securityTier)?.name ?? '';

  const tabs = TAB_CONFIG.concat(
    hasThread ? [{ id: 'thread' as DetailTab, labelKey: 'correspondenceDetail.tab.thread' }] : [],
    isSent ? [{ id: 'reminder' as DetailTab, labelKey: 'correspondenceDetail.tab.reminder' }] : [],
    // CMS-006 — the approval routing surface is for outgoing items only (AC8).
    canSeeApprovals ? [{ id: 'approvals' as DetailTab, labelKey: 'correspondenceDetail.tab.approvals' }] : []
  );
  const activeTab: DetailTab = tabs.some((tb) => tb.id === tab) ? tab : tabs[0].id;

  const patchDetail = (patch: Partial<ICorrespondenceDetail>): void => {
    setDetail((prev) => (prev ? { ...prev, ...patch } : prev));
  };

  const handleTabClick = (nextTab: DetailTab): void => {
    setTab(nextTab);
    const action = TAB_VIEW_AUDIT[nextTab];
    if (!action) return;
    // Only the click that actually triggers a tab's own fetch gets a local-only echo — that fetch
    // writes the real row itself (CMS-040 Part 1/4), so writing a second one here would duplicate
    // it. Every other switch — a repeat visit to an already-loaded tab, or a tab whose data was
    // fetched once at open (Files/Thread) or has no fetch at all (Annotate) — makes no service
    // call of its own, so it writes its own row rather than showing an entry nobody recorded.
    const fetchWillAudit =
      (nextTab === 'audit' && !auditLoaded) ||
      (nextTab === 'timeline' && !timelineLoaded) ||
      (nextTab === 'reminder' && !reminderLoaded) ||
      // SecurityTab re-runs loadPrincipals on every mount, so every switch to it self-audits.
      nextTab === 'security';
    if (fetchWillAudit) echoAudit(action, `${action} for ${detail.subject}`);
    else logAudit(action, `${action} for ${detail.subject}`);
  };

  const handleSign = (): void => {
    setDetail((prev) => (prev ? applySignature(prev) : prev));
    logAudit('Signed', `Signed ${detail.referenceNumber || detail.subject}`);
  };

  // CMS-007 e-signature — send the main document only to Power Automate, record a signing session,
  // and open the returned signing URL. Provider communication stays inside the flow.
  const handleSendForSignature = async (signer: ISignatureSigner): Promise<void> => {
    const mainAttachment = attachments.find((a) => a.isMain) ?? attachments[0];
    if (!mainAttachment?.url) {
      setSignatureError(t('correspondenceDetail.eSignature.noDocument'));
      return;
    }
    setSignatureBusy(true);
    setSignatureError(undefined);
    try {
      // no-store: each signed version replaces the file at the same address.
      const fileResp = await fetch(mainAttachment.url, { cache: 'no-store' });
      if (!fileResp.ok) throw new Error(`Could not read the document (${fileResp.status}).`);
      const fileContent = await fileResp.blob();
      const result = await eSignatureService.sendForSignature({
        correspondenceId: detail.id,
        referenceNumber: detail.referenceNumber || '',
        subject: detail.subject,
        fileName: mainAttachment.name,
        fileContent,
        signers: [signer],
        returnUrl: pageSigningReturnUrl(),
      });
      const actor = currentUser?.displayName ?? 'Unknown';
      await signingService.createSession(
        {
          correspondenceId: detail.id,
          referenceNumber: detail.referenceNumber || '',
          subject: detail.subject,
          signerName: signer.name,
          signerEmail: signer.email,
          externalDocumentId: result.externalDocumentId,
        },
        actor
      );
      setSigningPage(result);
      logAudit(
        'Sent for e-Signature',
        `Sent ${detail.referenceNumber || detail.subject} to ${signer.name} <${signer.email}> for signature — external document ${result.externalDocumentId}`
      );
      setSignatureModalOpen(false);
    } catch (err) {
      setSignatureError(err instanceof Error ? err.message : t('correspondenceDetail.eSignature.failed'));
    } finally {
      setSignatureBusy(false);
    }
  };

  // The signed PDF becomes the main document, so the next signer signs the same, already-signed file.
  const saveSignedDocument = async (externalDocumentId: string): Promise<void> => {
    try {
      await saveSignedDocumentAsMain(
        { eSignatureService, correspondenceDetailService },
        detail.id,
        externalDocumentId
      );
      const refreshed = await correspondenceDetailService.getAttachments(detail.id);
      if (!isAccessDenied(refreshed)) setAttachments(refreshed.uploaded);
    } catch {
      throw new Error(t('correspondenceDetail.eSignature.saveSignedFailed'));
    }
  };

  // Standalone Send for e-Signature: the page is shown in-app. Once the provider confirms the
  // signature, the signed PDF is saved as the main document; the Signing Dashboard tracks the rest.
  const handleSigningPageClose = (outcome: SigningFrameOutcome): void => {
    const page = signingPage;
    setSigningPage(undefined);
    const subject = detail.referenceNumber || detail.subject;
    if (outcome === 'declined') {
      logAudit('e-Signature Declined', `Signer declined the signing page for ${subject}`);
      return;
    }
    if (!page) return;
    eSignatureService
      .getSignatureStatus(page.externalDocumentId)
      .then(async (status) => {
        if (!status.isCompleted) return;
        await saveSignedDocument(page.externalDocumentId);
        logAudit('e-Signature Completed', `Signed document saved for ${subject}`);
      })
      .catch((err: unknown) =>
        logAudit('e-Signature Save Failed', err instanceof Error ? err.message : String(err))
      );
  };

  const handleReplyContinue = (): void => {
    setReplyModalOpen(false);
    // CMS-041 AC8 — the reading pane carries the fullest metadata, so the reply pre-fills the core
    // fields (subject/sender/priority/security/classification/originating function), all editable.
    const prefill: IReplyPrefill = buildReplyPrefill(detail);
    logAudit('Reply Started', `Started a reply to ${detail.subject}`);
    navigate('/correspondence/new', { state: { replyTo: prefill } });
  };

  const handleForward = (): void => {
    // Forward inherits the source thread's controlled reference, but not its parent-reply link;
    // this keeps the Thread tab complete without clearing a pending-response flag on the source.
    const prefill = buildForwardPrefill(detail);
    logAudit('Forward Started', `Started a forward of ${detail.subject}`);
    navigate('/correspondence/new', { state: { replyTo: prefill } });
  };

  const handlePrint = (): void => {
    logAudit('Printed', `Printed ${detail.subject}`);
    window.print();
  };

  // Preview tab's single document action: open the main attachment at its SharePoint URL in a
  // new tab, where the user's own permissions govern edit/view/download/print — no separate
  // Edit/Download/Print buttons duplicated here.
  // Open a stored attachment in a new tab. Prefer SharePoint's own document-library page
  // (Forms/AllItems.aspx?id=…&parent=…) so the user gets the OOB view/edit experience on the source
  // file — Open in App / Edit in browser / download / version history under their own permissions —
  // rather than the raw file URL, which the browser just streams into its read-only PDF viewer.
  // Falls back to the raw URL for anything not in the attachments library (e.g. a RecordsHub link).
  const openStoredDocument = (fileUrl: string): void => {
    const sharePointUrl = buildSharePointItemUrl(window.location.origin, fileUrl);
    window.open(sharePointUrl ?? fileUrl, '_blank', 'noopener,noreferrer');
  };

  const handleOpenDocument = (): void => {
    const mainAttachment = attachments.find((a) => a.isMain) ?? attachments[0];
    if (!mainAttachment?.url) return;
    logAudit('Opened Document', `Opened ${mainAttachment.name} in a new tab`);
    openStoredDocument(mainAttachment.url);
  };

  // Optimistic local append — meaningful once the Timeline tab has been loaded at least once;
  // a first visit after this fetches the real server-side list instead (which, for Expedite/
  // Reassign, already includes the real CORMS_Timeline row CMS-040 Part 6 now writes).
  const pushTimelineEvent = (kind: ITimelineEvent['kind'], details: string): void => {
    if (!timelineLoaded) return;
    setTimeline((prev) => [
      ...prev,
      {
        id: `session-tl-${prev.length + 1}`,
        kind,
        actor: currentUser?.displayName ?? 'Unknown',
        details,
        timestamp: nowTimestamp(),
      },
    ]);
  };

  // CMS-006 — an approval decision derives a new correspondence status (InReview while steps remain,
  // Approved once the final step approves, Draft on a reject/return). Persist it to
  // CORMS_Correspondence so the change is durable and every user sees it — the old code only patched
  // local state, so the status silently reverted on refresh. When the chain completes, also record a
  // durable Timeline event so the item's Timeline shows it was approved.
  const handleApprovalStatusChange = (status: ICorrespondenceDetail['status']): void => {
    patchDetail({ status });
    correspondenceDetailService.setStatus(detail.id, status).catch(() => undefined);
    // Don't write the "Correspondence approved" summary here: this fires BEFORE the final step's
    // audit (onCorrespondenceStatusChange runs before onAudit in the approval flow), so writing it
    // now would timestamp it earlier than the step-approved event and it'd sort above it. Flag it
    // and let handleApprovalAudit write it last (chained after the step event) instead.
    if (status === 'Approved') finalApprovalPendingRef.current = true;
  };

  // Every approval decision is audited AND written to the Timeline (who approved/rejected/returned
  // which step), durably, so the Timeline reflects what happened for every viewer — not just an
  // optimistic local echo in the acting user's session.
  const handleApprovalAudit = (action: string, details: string): void => {
    logAudit(action, details);
    if (action.indexOf('Approval ') === 0) {
      const { eventType, kind } = APPROVAL_TIMELINE_EVENTS[action] ?? { eventType: 'Edited', kind: 'edited' };
      const stepWrite = correspondenceDetailService.addTimelineEntry(detail.id, eventType, details);
      pushTimelineEvent(kind, details);
      // On the final approval, add the "Correspondence approved" summary AFTER the step-approved
      // event — chained on its write so it takes a later timestamp and sorts last on the Timeline.
      if (finalApprovalPendingRef.current) {
        finalApprovalPendingRef.current = false;
        const summary = 'Correspondence approved — all approval steps complete';
        stepWrite
          .then(() => correspondenceDetailService.addTimelineEntry(detail.id, 'Approved', summary))
          .catch(() => undefined);
        pushTimelineEvent('approved', summary);
      } else {
        stepWrite.catch(() => undefined);
      }
      // Invalidate the Audit/Timeline caches so opening those tabs re-fetches the server rows this
      // decision just wrote — without this the Audit tab keeps showing its first (pre-approval)
      // fetch until the user manually hits Refresh, which is exactly why the approval "didn't show".
      setAuditLoaded(false);
      setTimelineLoaded(false);
    }
  };

  // CMS-015: single-item Expedite from the header's actions menu — opens the same reason-prompt
  // modal the list-screen "…" menu actions use, then calls the real EPIC 14 IBulkActionsService
  // (CMS-040 Part 9) instead of a local-only stub, so the item's own Timeline (Part 6) picks up a
  // real Expedited event too.
  const handleExpedite = (): void => {
    if (detail.expedited) {
      // CMS-015 AC6 — removal is persisted server-side (role-gated + audited), not a local-only
      // patch, so the flag genuinely clears on CORMS_Correspondence and the item's Timeline records it.
      bulkActionsService
        .removeExpedite([detail.id])
        .then((result) => {
          if (result.succeeded.indexOf(detail.id) === -1) return;
          patchDetail(applyRemoveExpedite());
          logAudit('Expedite Removed', `Expedite removed from ${detail.subject}`);
          pushTimelineEvent('expedited', 'Expedite flag removed');
        })
        .catch((err) => {
          const message =
            err instanceof BulkActionForbiddenError ? err.message : 'Failed to remove the expedite flag.';
          logAudit('Expedite Remove Failed', message);
        });
      return;
    }
    setExpediteModalOpen(true);
  };

  const handleConfirmExpedite = (reason: string): void => {
    setExpediteModalOpen(false);
    bulkActionsService
      .expedite([detail.id], reason)
      .then((result) => {
        if (result.succeeded.indexOf(detail.id) === -1) return;
        // Priority: 'High' mirrors what BulkActionsServiceCore.expedite() just wrote server-side.
        patchDetail({ ...applyExpedite(reason, currentUser?.displayName ?? 'Unknown'), priority: 'High' });
        logAudit('Expedited', `Expedited correspondence: ${detail.subject} — ${reason}`);
        pushTimelineEvent('expedited', `Item expedited — ${reason}`);
      })
      .catch((err) => {
        const message =
          err instanceof BulkActionForbiddenError ? err.message : 'Failed to expedite this item.';
        logAudit('Expedite Failed', message);
      });
  };

  // CMS-014: Flag/Clear Pending Response from the header's actions menu.
  const handleFlagPendingResponse = (awaitedParty: IAwaitedParty): void => {
    patchDetail(applyFlagPendingResponse(detail, awaitedParty, currentUser?.displayName ?? 'Unknown'));
    // Persist the flag WITH the awaited party + flag time, so a later linked reply can clear it
    // (CMS-022 AC7) and the escalation deadline can be evaluated server-side (CMS-014 AC4).
    correspondenceService
      .setPendingResponse(detail.id, true, { awaitedParty, actor: currentUser?.displayName ?? 'Unknown' })
      .catch(() => undefined);
    logAudit(
      'Flagged Pending Response',
      `Awaiting response from ${awaitedParty.name} (${awaitedParty.type})`
    );
    setFlagModalOpen(false);
  };
  const handleClearPendingResponse = (): void => {
    patchDetail(applyClearPendingResponse());
    correspondenceService.setPendingResponse(detail.id, false).catch(() => undefined);
    logAudit('Cleared Pending Response', `Pending response cleared for ${detail.subject}`);
  };

  const handleShare = (): void => setShareModalOpen(true);

  // CMS-008 — manually declare the draft as a final, immutable record. Gated on the Declare
  // permission (AC1) and the approval-complete status (AC1) at the call site; on success the item
  // is stamped Declared with the returned serial/attribution (AC2/AC3/AC7) and audited separately
  // from signing (AC5/AC9 — the service writes the dedicated 'Record Declared' audit row).
  const handleDeclareRecord = (): void => {
    if (
      !window.confirm(
        t('correspondenceDetail.declare.confirm', { ref: detail.referenceNumber || detail.subject })
      )
    )
      return;
    correspondenceDetailService
      .declareRecord(detail.id, currentUser?.displayName ?? 'Unknown')
      .then((result) => {
        if (isAccessDenied(result)) return;
        setDetail((prev) => (prev ? applyDeclaration(prev, result) : prev));
        echoAudit('Record Declared', `Declared as final record · Serial ${result.recordSerialNumber}`);
      })
      .catch(() => window.alert(t('correspondenceDetail.declare.failed')));
  };

  // Inline field edits stage into local state only; nothing persists until the user clicks Save and
  // enters the mandatory change comment (handleConfirmSaveDetails). This is why edits used to vanish
  // on refresh — they were never sent to SharePoint and there was no Save action. Each edit both
  // patches the on-screen detail (live display) and records the typed value on the staged patch,
  // capturing the field's original value the first time it changes so the audit can show old → new.
  const handleFieldChange = (key: string, value: string, meta?: IFieldChangeMeta): void => {
    const before = detailsBeforeRef.current;
    const staged = stagedPatchRef.current;
    switch (key) {
      case 'originatingFunction':
        if (before.originatingFunction === undefined)
          before.originatingFunction = detail.originatingFunction ?? '';
        staged.originatingFunction = value;
        break;
      case 'dueDate':
        if (before.dueDate === undefined) before.dueDate = detail.dueDate ?? '';
        staged.dueDate = value;
        break;
      case 'assignedTo':
        if (before.assignedToName === undefined) before.assignedToName = detail.assignedTo ?? '';
        staged.assignedTo = { login: meta?.login ?? value, name: value };
        break;
      case 'comment':
        if (before.comment === undefined) before.comment = detail.comment ?? '';
        staged.comment = value;
        break;
      default:
        break;
    }
    patchDetail({ [key]: value } as unknown as Partial<ICorrespondenceDetail>);
    setDetailsDirty(true);
  };

  // CMS-040 — persist the staged Details edits (Originating Function, Due Date, Assigned To,
  // Comments). A mandatory comment is captured first (the modal); the audit records the exact
  // per-field before→after diff plus that comment. Mirrors the annotation-save comment flow.
  const handleConfirmSaveDetails = (comment: string): void => {
    setDetailsSaveModalOpen(false);
    const patch = stagedPatchRef.current;
    const changes = diffDetailPatch(detailsBeforeRef.current, patch);
    correspondenceDetailService
      .updateDetails(detail.id, patch, comment)
      .then((result) => {
        if (isAccessDenied(result)) return;
        setDetailsDirty(false);
        stagedPatchRef.current = {};
        detailsBeforeRef.current = {};
        const summary = formatDetailChanges(changes);
        echoAudit('Details Edited', `${summary || 'No fields changed'} — ${comment}`);
      })
      .catch(() => window.alert(t('correspondenceDetail.details.saveFailed')));
  };

  const handleReclassify = (newTier: number, justification: string): void => {
    const before = securityLevelName;
    const after = SECURITY_TIERS.find((tier) => tier.tier === newTier)?.name ?? String(newTier);
    const direct = reclassifyGoesDirect(currentUser);
    const input = {
      correspondenceId: detail.id,
      correspondenceRef: detail.referenceNumber || detail.subject,
      subject: detail.subject,
      fromTier: detail.securityTier,
      toTier: newTier,
      justification,
      actor: currentUser?.displayName ?? 'Unknown',
    };
    if (direct) {
      // AC1 — Records Admin: apply immediately (persisted; access control follows, AC5).
      reclassificationService.applyDirect(input).catch(() => undefined);
      patchDetail({ securityTier: newTier });
      logAudit('Re-classified Security Level', `${before} → ${after} · ${justification}`);
    } else {
      // AC2 — everyone else raises a maker-checker request; the level is NOT changed until approved.
      reclassificationService.requestReclassification(input).catch(() => undefined);
      logAudit('Re-classification Submitted for Approval', `${before} → ${after} · ${justification}`);
    }
    setReclassifyModalOpen(false);
  };

  const handleSaveReminder = (next: IReminder): void => {
    setReminder(next);
    // saveReminder persists the reminder and writes the audit event + 'ReminderSet' CORMS_Timeline
    // rows itself (CMS-042 AC7); echo locally (no second server write) and force the Timeline tab to
    // refetch so the new event shows next time it's opened.
    correspondenceDetailService.saveReminder(detail.id, next).catch(() => undefined);
    echoAudit('Reminder Scheduled', `${next.followUpType} — due ${next.date}`);
    setTimelineLoaded(false);
  };

  const handleClearReminder = (): void => {
    setReminder(undefined);
    correspondenceDetailService.clearReminder(detail.id).catch(() => undefined);
    echoAudit('Reminder Cleared', `Reminder cleared for ${detail.subject}`);
  };

  const goToItem = (targetId: string): void => {
    navigate(`/correspondence/${targetId}`, {
      state: { tab: 'thread', originPath: backPath, originLabel: backLabel },
    });
  };

  const fileTitle = `${detail.referenceNumber || t('myCorrespondence.draftNotRegistered')} — ${detail.subject}`;

  // CMS-040 AC8 — every action available on this item, in one grouped menu on the header, rather
  // than scattered across the tab bodies (Expedite/Print/Share/Flag used to be a button row inside
  // the Details tab only) and the header (Reply/Sign). Reachable from every tab as a result.
  const headerActions: IActionsMenuItem[] = [
    ...(isReceived
      ? [
          {
            key: 'reply',
            labelKey: 'myCorrespondence.reply',
            iconName: 'reply',
            onClick: () => setReplyModalOpen(true),
          },
        ]
      : []),
    { key: 'forward', labelKey: 'myCorrespondence.forward', iconName: 'forward', onClick: handleForward },
    {
      key: 'annotate',
      labelKey: 'correspondenceDetail.details.annotateShortcut',
      iconName: 'annotType',
      onClick: () => setTab('annotate'),
    },
    ...(detail.signatureRequired && !detail.isSigned && canSignCorrespondence()
      ? [
          {
            key: 'sign',
            labelKey: 'correspondenceDetail.signature.sign',
            iconName: 'pencil',
            onClick: handleSign,
          },
        ]
      : []),
    {
      key: 'expedite',
      labelKey: detail.expedited ? 'expedite.action.remove' : 'correspondenceDetail.details.expedite',
      iconName: 'alertTriangle',
      dividerBefore: true,
      onClick: handleExpedite,
    },
    {
      key: 'pendingResponse',
      labelKey: detail.pendingResponse ? 'pendingResponse.action.clear' : 'pendingResponse.action.flag',
      iconName: 'clock',
      onClick: detail.pendingResponse ? handleClearPendingResponse : () => setFlagModalOpen(true),
    },
    {
      key: 'print',
      labelKey: 'myCorrespondence.print',
      iconName: 'printer',
      dividerBefore: true,
      onClick: handlePrint,
    },
    { key: 'share', labelKey: 'correspondenceDetail.details.share', iconName: 'share', onClick: handleShare },
    // CMS-007 e-signature — send the document to Power Automate for a provider-independent signature (Outgoing only).
    ...(isSent
      ? [
          {
            key: 'eSignature',
            labelKey: 'correspondenceDetail.eSignature.action',
            iconName: 'pencil',
            dividerBefore: true,
            onClick: () => {
              setSignatureError(undefined);
              setSignatureModalOpen(true);
            },
          },
        ]
      : []),
    // CMS-008 AC1/AC6 — the explicit Declare Record action, shown only to a user with the Declare
    // permission and only once the approval workflow is complete (status Approved/Signed) and the
    // item isn't already declared. Declaring freezes the record and stamps its serial (AC2/AC7).
    ...(canDeclareRecord(currentUser) && canDeclare(detail.status)
      ? [
          {
            key: 'declareRecord',
            labelKey: 'correspondenceDetail.details.declareRecord',
            iconName: 'fileCheck',
            dividerBefore: true,
            onClick: handleDeclareRecord,
          },
        ]
      : []),
  ];

  return (
    <div className={styles.page}>
      <DetailHeader
        backPath={backPath}
        backLabel={backLabel}
        fileTitle={fileTitle}
        refNo={detail.referenceNumber}
        actions={headerActions}
      />

      <div className={styles.tabStrip}>
        {tabs.map((tb) => (
          <button
            key={tb.id}
            type="button"
            className={activeTab === tb.id ? `${styles.tabBtn} ${styles.tabBtnActive}` : styles.tabBtn}
            onClick={() => handleTabClick(tb.id)}
          >
            {t(tb.labelKey)}
          </button>
        ))}
      </div>

      <div className={styles.tabBody}>
        {activeTab === 'preview' && (
          <PreviewTab
            detail={detail}
            attachments={attachments}
            attachmentsLoading={!attachmentsLoaded}
            onOpenDocument={handleOpenDocument}
            onReply={isReceived ? () => setReplyModalOpen(true) : undefined}
          />
        )}
        {activeTab === 'annotate' && (
          <AnnotateTab
            correspondenceId={detail.id}
            attachments={attachments}
            attachmentsLoading={!attachmentsLoaded}
            onSave={(comment) =>
              logAudit('Annotations Saved', `Saved annotations for ${detail.subject}: ${comment}`)
            }
            onAudit={logAudit}
          />
        )}
        {activeTab === 'details' && (
          <DetailsTab
            detail={detail}
            canEdit={
              (canEditDetailFields(currentUser) || isAssignedTo(currentUser, detail.assignedTo)) &&
              !isImmutable(detail.status)
            }
            dirty={detailsDirty}
            onSave={() => setDetailsSaveModalOpen(true)}
            onFieldChange={handleFieldChange}
          />
        )}
        {activeTab === 'files' && (
          <FilesTab
            attachments={attachments}
            physicalAttachments={physicalAttachments}
            onPreview={(att) => {
              logAudit('Previewed Attachment', att.name);
              if (att.url) openStoredDocument(att.url);
            }}
            onDownload={(att) => {
              logAudit('Downloaded Attachment', att.name);
              if (!att.url) return;
              // ?download=1 is SharePoint's convention for a Content-Disposition: attachment
              // response, but some file URLs don't honor it. The HTML `download` attribute forces
              // a same-origin save instead of navigation regardless of the response header, so the
              // browser saves the file in place rather than opening or replacing the current page.
              const link = document.createElement('a');
              link.href = `${att.url}${att.url.indexOf('?') === -1 ? '?' : '&'}download=1`;
              link.download = att.name;
              link.rel = 'noopener noreferrer';
              document.body.appendChild(link);
              link.click();
              document.body.removeChild(link);
            }}
          />
        )}
        {activeTab === 'file' && <FilePlanTab detail={detail} />}
        {activeTab === 'security' && (
          <SecurityTab
            loadPrincipals={() =>
              correspondenceDetailService
                .getSecurityAssignments(detail.id)
                .then((result) => (isAccessDenied(result) ? [] : result))
            }
            onOpenReclassify={() => setReclassifyModalOpen(true)}
          />
        )}
        {activeTab === 'audit' && (
          <AuditTab
            entries={auditRows}
            loading={auditLoading}
            onRefresh={() => undefined}
            fileNamePrefix={detail.id}
          />
        )}
        {activeTab === 'timeline' && <TimelineTab events={timeline} />}
        {activeTab === 'thread' && hasThread && (
          <ThreadTab
            items={threadItems}
            currentId={detail.id}
            chainId={detail.chainId ?? ''}
            onNavigate={goToItem}
          />
        )}
        {activeTab === 'reminder' && isSent && (
          <ReminderTab reminder={reminder} onSave={handleSaveReminder} onClear={handleClearReminder} />
        )}
        {activeTab === 'approvals' && canSeeApprovals && (
          <ApprovalsTab
            correspondenceId={detail.id}
            referenceNo={detail.referenceNumber}
            correspondenceStatus={detail.status}
            securityTier={detail.securityTier}
            viewerIsRequestor={detail.viewerIsRequestor}
            viewerIsSystemAdmin={isSystemAdmin}
            mainDocumentSigned={detail.mainDocumentSigned}
            currentUserName={currentUser?.displayName}
            onCorrespondenceStatusChange={handleApprovalStatusChange}
            onAudit={handleApprovalAudit}
          />
        )}
      </div>

      <ReplyModal
        isOpen={replyModalOpen}
        onDismiss={() => setReplyModalOpen(false)}
        onContinue={handleReplyContinue}
        hasThread={!!detail.chainId}
      />

      <ShareLinkModal
        isOpen={shareModalOpen}
        onDismiss={() => setShareModalOpen(false)}
        canShare={canShareCorrespondence(currentUser)}
        shareLink={shareLink}
        onGenerate={() => {
          const token = Math.random().toString(36).slice(2, 10);
          const link = `https://corms.oq8.com/s/${token}`;
          setShareLink(link);
          logAudit('Share Link Generated', `Generated a share link for ${detail.subject}`);
        }}
        onRevoke={() => {
          setShareLink(undefined);
          logAudit('Share Link Revoked', `Revoked the share link for ${detail.subject}`);
        }}
      />

      <ReclassifyModal
        isOpen={reclassifyModalOpen}
        onDismiss={() => setReclassifyModalOpen(false)}
        currentTier={detail.securityTier}
        goesDirect={reclassifyGoesDirect(currentUser)}
        onSubmit={handleReclassify}
      />

      <ExpediteReasonModal
        isOpen={expediteModalOpen}
        targetCount={1}
        onDismiss={() => setExpediteModalOpen(false)}
        onConfirm={handleConfirmExpedite}
      />

      <FlagPendingResponseModal
        isOpen={flagModalOpen}
        onDismiss={() => setFlagModalOpen(false)}
        onFlag={handleFlagPendingResponse}
      />

      <ActionCommentModal
        isOpen={detailsSaveModalOpen}
        title={t('correspondenceDetail.details.saveModalTitle')}
        confirmText={t('correspondenceDetail.details.save')}
        onDismiss={() => setDetailsSaveModalOpen(false)}
        onConfirm={handleConfirmSaveDetails}
      />

      <SendForSignatureModal
        isOpen={signatureModalOpen}
        defaultSignerName={detail.recipientName}
        busy={signatureBusy}
        error={signatureError}
        onDismiss={() => setSignatureModalOpen(false)}
        onSend={handleSendForSignature}
      />
      <SigningFrameModal
        url={signingPage?.signingUrl}
        returnUrl={pageSigningReturnUrl()}
        onClose={handleSigningPageClose}
      />
    </div>
  );
};

export default CorrespondenceDetailView;
