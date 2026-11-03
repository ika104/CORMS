import * as React from 'react';
import { useServices } from '../../state/hooks';
import { DEFAULT_ESCALATION_DAYS, parseEscalationDays } from './pendingResponseEscalation';

const ESCALATION_DAYS_KEY = 'pendingResponse.escalationDays';

/**
 * CMS-014 AC4 — reads the configurable pending-response escalation deadline (days) from
 * CORMS_AdminConfig once, so the sent/supervisor views badge overdue flags against the admin's
 * configured value rather than a hard-coded one. Falls back to the default until it resolves (or
 * if the key is unset), so the UI never blocks on the fetch.
 */
export function useEscalationDays(): number {
  const { adminConfigService } = useServices();
  const [days, setDays] = React.useState<number>(DEFAULT_ESCALATION_DAYS);

  React.useEffect(() => {
    adminConfigService
      .getEntries()
      .then((entries) => {
        const entry = entries.find((e) => e.key === ESCALATION_DAYS_KEY);
        if (entry) setDays(parseEscalationDays(entry.value));
      })
      .catch(() => undefined);
  }, [adminConfigService]);

  return days;
}
