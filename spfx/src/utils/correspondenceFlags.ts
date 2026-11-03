import { IActionsMenuItem } from '../components/common/ActionsMenu';
import { IAwaitedParty, ICorrespondenceStub } from '../models/ICorrespondence';
import { IUser } from '../models/IUser';

// TODO(confirm): no Figma frame yet — modeled on shared components + story ACs (CMS-014/015);
// confirm against design when available.

function nowTimestamp(): string {
  return new Date().toISOString().replace('T', ' ').slice(0, 16);
}

/** CMS-015: gates the Expedite action — Document Control, Supervisor, Manager, or Administrator. */
export function canExpedite(user: IUser | undefined): boolean {
  if (!user) return false;
  const allowed = ['Document Control', 'Supervisor', 'Manager', 'Administrator'];
  return user.roles.some((role) => allowed.indexOf(role) !== -1);
}

/** CMS-034 AC5 — roles that count as "vetted" for capturing classified correspondence at/above the
 * configurable threshold. Modelled as a role gate (the same defensible, existing signal
 * canExpedite uses) rather than a new user attribute CORMS doesn't yet carry: alongside the
 * document-control/management line, 'Security Officer' is included as the natural vetting role. */
const VETTED_CAPTURE_ROLES = ['Document Control', 'Security Officer', 'Supervisor', 'Manager', 'Administrator'];

/**
 * CMS-034 AC5 — whether the user is vetted to capture classified correspondence in the restricted
 * band. Distinct from clearance (AC8 already gates the security-level pills by clearanceTier): this
 * is an additional role-based vetting gate, so a merely high clearance is not by itself enough.
 */
export function isVettedForClassifiedCapture(user: IUser | undefined): boolean {
  if (!user) return false;
  return user.roles.some((role) => VETTED_CAPTURE_ROLES.indexOf(role) !== -1);
}

export function applyFlagPendingResponse(
  item: ICorrespondenceStub,
  awaitedParty: IAwaitedParty,
  actor: string
): Partial<ICorrespondenceStub> {
  return {
    pendingResponse: true,
    pendingResponseDetail: { awaitedParty, flaggedAt: nowTimestamp(), flaggedBy: actor },
  };
}

export function applyClearPendingResponse(): Partial<ICorrespondenceStub> {
  return { pendingResponse: false, pendingResponseDetail: undefined };
}

export function applyExpedite(reason: string, actor: string): Partial<ICorrespondenceStub> {
  return { expedited: { reason, expeditedBy: actor, expeditedAt: nowTimestamp() } };
}

export function applyRemoveExpedite(): Partial<ICorrespondenceStub> {
  return { expedited: undefined };
}

/** Expedited items sort first — same sort-priority mechanism InboxSentView already applies for
 * "signature required sorts first" (CMS-047), chained ahead of it rather than replacing it. */
export function expediteSortWeight(item: ICorrespondenceStub): number {
  return item.expedited ? 0 : 1;
}

export interface IFlagActionHandlers<T extends ICorrespondenceStub> {
  onFlagPendingResponse: (row: T) => void;
  onClearPendingResponse: (id: string) => void;
  onExpedite: (row: T) => void;
  onRemoveExpedite: (id: string) => void;
}

/** The Flag Pending Response / Expedite pair of "…" menu entries (CMS-014/015), built once
 * here so every list screen that offers them (My Correspondence, Inbox/Sent) shows the same
 * items, labels, icons and role gating rather than repeating the block per screen. */
export function buildFlagActionItems<T extends ICorrespondenceStub>(
  row: T,
  user: IUser | undefined,
  handlers: IFlagActionHandlers<T>
): IActionsMenuItem[] {
  const items: IActionsMenuItem[] = [
    row.pendingResponse
      ? {
          key: 'clearPendingResponse',
          labelKey: 'pendingResponse.action.clear',
          iconName: 'checkCircle',
          dividerBefore: true,
          onClick: () => handlers.onClearPendingResponse(row.id),
        }
      : {
          key: 'flagPendingResponse',
          labelKey: 'pendingResponse.action.flag',
          iconName: 'clock',
          dividerBefore: true,
          onClick: () => handlers.onFlagPendingResponse(row),
        },
  ];
  if (canExpedite(user)) {
    items.push(
      row.expedited
        ? {
            key: 'removeExpedite',
            labelKey: 'expedite.action.remove',
            iconName: 'alertTriangle',
            onClick: () => handlers.onRemoveExpedite(row.id),
          }
        : {
            key: 'expedite',
            labelKey: 'expedite.action.set',
            iconName: 'alertTriangle',
            onClick: () => handlers.onExpedite(row),
          }
    );
  }
  return items;
}

/** CMS-014's auto-clear-on-reply, stubbed per the story text: "if a new item in local state has
 * repliesTo === this.id, clear pendingResponse." `repliesTo` isn't a real field on
 * ICorrespondenceStub — the reply flow (ReplyModal -> Create Correspondence) doesn't currently
 * append a new item back into this shared list — so this utility models the check described
 * rather than being wired into an end-to-end flow. */
export function clearPendingResponseOnReply(
  items: ICorrespondenceStub[],
  newItem: ICorrespondenceStub & { repliesTo?: string }
): ICorrespondenceStub[] {
  if (!newItem.repliesTo) return items;
  return items.map((item) => (item.id === newItem.repliesTo ? { ...item, ...applyClearPendingResponse() } : item));
}

// CMS-014 AC4 — escalation deadline. The overdue detection now lives in
// modules/pendingResponse/pendingResponseEscalation.ts, measured from the persisted
// PendingResponseFlaggedAt against the configurable `pendingResponse.escalationDays`
// (CORMS_AdminConfig); the sent/supervisor views badge overdue flags as "escalation due". The
// actual escalation NOTIFICATION (email/inbox push) is sent by a scheduled Power Automate flow
// reading those same two values — the app has no cron of its own — same boundary as the rest of
// CMS-016's notification scope.
