import type { SPFI } from '@pnp/sp';
import { INavBadge } from '../../models/INavModel';
import { CorrespondenceListServiceCore } from '../correspondenceList/CorrespondenceListServiceCore';
import { ReadReceiptServiceCore } from '../readReceipts/ReadReceiptServiceCore';

/**
 * CMS-038 AC7 — pluggable badge-count resolution keyed by CORMS_NavigationMenu.BadgeSourceKey.
 * Composes other Core classes directly (not their Live wrappers) since they all share the same
 * injected `sp` — see provisioningCore.ts's file comment for why Core classes stay @pnp/sp
 * runtime-import-free.
 *
 * `inboxUnreadCount` (CMS-039) and `triagePendingCount` (CMS-009) are wired to real data — both
 * this epic's own lists (CORMS_Correspondence + CORMS_ReadReceipts). Any other key referenced by
 * seed data that is not yet backed by its owning epic's backend task resolves to a literal 0
 * rather than a guessed number — per the task's own instruction, not silently decided.
 */
export class BadgeCountServiceCore {
  private readonly correspondenceList: CorrespondenceListServiceCore;
  private readonly readReceipts: ReadReceiptServiceCore;

  constructor(sp: SPFI, getCurrentUserClearanceTier: () => Promise<number>) {
    this.correspondenceList = new CorrespondenceListServiceCore(sp, getCurrentUserClearanceTier);
    this.readReceipts = new ReadReceiptServiceCore(sp);
  }

  public async resolveBadge(badgeSourceKey: string | undefined): Promise<INavBadge | undefined> {
    if (!badgeSourceKey) return undefined;

    if (badgeSourceKey === 'inboxUnreadCount') {
      const inbox = await this.correspondenceList.getInbox();
      const unread = await this.readReceipts.getUnreadIds(inbox.map((i) => i.id));
      return unread.size > 0 ? { count: unread.size, tone: 'danger' } : undefined;
    }

    // CMS-009 AC4 — the count of unseen (unread) items still pending triage, within the current
    // user's clearance (getTriagePending applies the clearance trim). Mirrors the inbox pattern:
    // the pending pool intersected with the per-user read-receipt set.
    if (badgeSourceKey === 'triagePendingCount') {
      const triage = await this.correspondenceList.getTriagePending();
      const unseen = await this.readReceipts.getUnreadIds(triage.map((i) => i.id));
      return unseen.size > 0 ? { count: unseen.size } : undefined;
    }

    // TODO: implement when the owning epic's backend task lands. Returning a literal 0 rather than
    // guessing at another epic's status vocabulary or omitting the badge silently.
    return { count: 0 };
  }
}
