import { IActionsMenuItem } from '../components/common/ActionsMenu';
import { ICorrespondenceStub } from '../models/ICorrespondence';
import { IUser } from '../models/IUser';
import { buildForwardPrefill, buildReplyPrefill } from './replyPrefill';

/**
 * The shared "…" overflow-menu for a correspondence row — used by the card AND table renderers on
 * both My Correspondence and Inbox / Sent so every surface offers the same actions in the same
 * order, matching the Figma design:
 *
 *   View Details · Open Full Preview · Edit in Word Online
 *   Reply · Forward · Share Link
 *   Download · Print · Annotate · View Attachments · View Timeline
 *   Approve · Reject · Reassign / Route
 *   Set Reminder · Delegate
 *
 * Every action opens the correspondence detail view on the matching tab (or the relevant flow —
 * Reply/Forward go to the compose screen), so the real, permission-gated action happens there
 * rather than being half-implemented per row. Items that don't apply to the row's direction/status
 * (or the user's role) are omitted, so the menu never shows a dead/greyed action.
 */
export interface ICorrespondenceRowActionsOptions {
  /** react-router navigate. */
  navigate: (path: string, opts?: { state?: unknown }) => void;
  /** Merged into the detail nav state so the detail view's "← Back" returns to this list. */
  originState?: { originPath?: string; originLabel?: string };
  /** The signed-in user — gates the workflow actions (Approve/Reject/Reassign/Delegate). */
  currentUser?: IUser;
  /** Offered only by a requestor-facing list for one of their own Draft items. */
  onDeleteDraft?: (row: ICorrespondenceStub) => void;
}

function hasAnyRole(user: IUser | undefined, ...roles: string[]): boolean {
  return !!user && roles.some((role) => user.roles.indexOf(role) !== -1);
}

export function buildCorrespondenceRowActions(
  row: ICorrespondenceStub,
  opts: ICorrespondenceRowActionsOptions
): IActionsMenuItem[] {
  const { navigate, originState = {}, currentUser, onDeleteDraft } = opts;

  const openDetail = (tab: string, extra?: Record<string, unknown>): (() => void) => (): void =>
    navigate(`/correspondence/${row.id}`, { state: { tab, ...originState, ...extra } });
  const openCompose = (state: Record<string, unknown>): (() => void) => (): void =>
    navigate('/correspondence/new', { state });

  // Drafts are unfinished requests, not readable correspondence records. Every opening path must
  // return the user to Compose so they can amend fields, documents, and recipients before sending.
  if (row.status === 'Draft') {
    const actions: IActionsMenuItem[] = [
      {
        key: 'view',
        labelKey: 'inboxSent.action.editDraft',
        iconName: 'pencil',
        onClick: openCompose({ editDraftId: row.id, ...originState }),
      },
    ];
    if (onDeleteDraft) {
      actions.push({
        key: 'deleteDraft',
        labelKey: 'inboxSent.bulk.delete',
        iconName: 'trash',
        dividerBefore: true,
        onClick: () => onDeleteDraft(row),
      });
    }
    return actions;
  }

  const isReceived = row.direction === 'Incoming';
  const isSent = row.direction === 'Outgoing';
  const hasDoc = !!row.hasAttachment;
  const inReview = row.status === 'InReview';
  const routable = row.status === 'Registered' || row.status === 'InReview';
  // Coarse role gate for the workflow actions until the full RBAC model lands — mirrors the
  // Administrator/Supervisor/Document Control set the detail-view roleHelpers already use.
  const canWorkflow = hasAnyRole(currentUser, 'Administrator', 'Supervisor', 'Manager', 'Document Control');

  // Grouped so a removed optional item never strands a divider — the first surviving item of each
  // non-empty group (after the first) gets `dividerBefore`.
  const groups: (IActionsMenuItem | undefined)[][] = [
    [
      { key: 'view', labelKey: 'myCorrespondence.viewDetails', iconName: 'eye', onClick: openDetail('details') },
      { key: 'preview', labelKey: 'correspondenceActions.openFullPreview', iconName: 'fileText', onClick: openDetail('preview') },
      hasDoc ? { key: 'editWord', labelKey: 'correspondenceActions.editInWord', iconName: 'fileEdit', onClick: openDetail('files') } : undefined,
    ],
    [
      isReceived
        ? { key: 'reply', labelKey: 'myCorrespondence.reply', iconName: 'reply', onClick: openCompose({ replyTo: buildReplyPrefill(row) }) }
        : undefined,
      { key: 'forward', labelKey: 'myCorrespondence.forward', iconName: 'forward', onClick: openCompose({ replyTo: buildForwardPrefill(row) }) },
      { key: 'share', labelKey: 'correspondenceActions.shareLink', iconName: 'share', onClick: openDetail('details', { openShare: true }) },
    ],
    [
      hasDoc ? { key: 'download', labelKey: 'myCorrespondence.download', iconName: 'download', onClick: openDetail('files') } : undefined,
      hasDoc ? { key: 'print', labelKey: 'myCorrespondence.print', iconName: 'printer', onClick: openDetail('preview') } : undefined,
      hasDoc ? { key: 'annotate', labelKey: 'correspondenceActions.annotate', iconName: 'annotType', onClick: openDetail('annotate') } : undefined,
      { key: 'attachments', labelKey: 'correspondenceActions.viewAttachments', iconName: 'paperclip', onClick: openDetail('files') },
      { key: 'timeline', labelKey: 'correspondenceActions.viewTimeline', iconName: 'history', onClick: openDetail('timeline') },
    ],
    [
      inReview && canWorkflow ? { key: 'approve', labelKey: 'correspondenceActions.approve', iconName: 'check', onClick: openDetail('approvals') } : undefined,
      inReview && canWorkflow ? { key: 'reject', labelKey: 'correspondenceActions.reject', iconName: 'xCircle', onClick: openDetail('approvals') } : undefined,
      routable && canWorkflow ? { key: 'reassign', labelKey: 'correspondenceActions.reassignRoute', iconName: 'route', onClick: openDetail('details') } : undefined,
    ],
    [
      isSent ? { key: 'reminder', labelKey: 'correspondenceActions.setReminder', iconName: 'clock', onClick: openDetail('reminder') } : undefined,
      canWorkflow ? { key: 'delegate', labelKey: 'correspondenceActions.delegate', iconName: 'userCog', onClick: () => navigate('/delegation') } : undefined,
    ],
  ];

  const items: IActionsMenuItem[] = [];
  groups.forEach((group) => {
    const present = group.filter((item): item is IActionsMenuItem => !!item);
    if (present.length === 0) return;
    // A separator above the first item of every group except the very first rendered one.
    present[0] = { ...present[0], dividerBefore: items.length > 0 };
    items.push(...present);
  });
  return items;
}
