import * as React from 'react';
import { useServices } from '../../services/ServiceProvider';
import { useNav } from './useNav';

function nowTimestamp(): string {
  return new Date().toISOString().replace('T', ' ').slice(0, 16);
}

/** CMS-045 — "view events are recorded, not just edits": logs a "Viewed Tab" audit entry for
 * the given screen/tab label once per mount. Reused by every screen built in this task set
 * (Statistics tabs, Admin Config, Translations, the Master Registers tabs, and the global
 * Audit Trail screen itself) so read-access stays comprehensively auditable, per the story. */
export function useAuditViewEvent(objectId: string): void {
  const { auditTrailService } = useServices();
  // Modules render before useNav resolves the signed-in user (150ms mock latency, or a real
  // SharePoint round-trip), so logging on mount alone would attribute the first view event of
  // every session to "Unknown". Wait for the identity load to settle first, then log once —
  // `loggedFor` keeps a later re-render from appending a duplicate entry for the same screen.
  const { currentUser, isLoading } = useNav();
  const actor = currentUser?.displayName;
  const loggedFor = React.useRef<string | undefined>(undefined);

  React.useEffect(() => {
    if (isLoading || loggedFor.current === objectId) return;
    loggedFor.current = objectId;
    auditTrailService
      .logEvent({
        objectId,
        actor: actor ?? 'Unknown',
        action: 'Viewed Tab',
        details: `Opened ${objectId}`,
        timestamp: nowTimestamp(),
      })
      .catch(() => undefined);
  }, [objectId, actor, isLoading, auditTrailService]);
}
