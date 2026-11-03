import { INavBadge } from '../../models/INavModel';

/** Pluggable nav badge-count resolution, keyed by CORMS_NavigationMenu.BadgeSourceKey (CMS-038
 * AC7). Only sources this epic's own data can honestly back are implemented; every other key
 * resolves to no badge rather than a guessed number. */
export interface IBadgeCountService {
  /** Undefined `badgeSourceKey` or an unrecognized one resolves to undefined (no badge shown). */
  resolveBadge(badgeSourceKey: string | undefined): Promise<INavBadge | undefined>;
}
