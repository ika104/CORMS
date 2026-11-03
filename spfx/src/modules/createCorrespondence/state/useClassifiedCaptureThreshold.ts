import * as React from 'react';
import { useServices } from '../../../services/ServiceProvider';
import {
  CLASSIFIED_CAPTURE_THRESHOLD_KEY,
  DEFAULT_CLASSIFIED_CAPTURE_THRESHOLD,
  parseClassifiedCaptureThreshold,
} from './classificationRules';

/**
 * CMS-034 AC5 — reads the configurable security tier at/above which classified capture is
 * restricted to vetted users from CORMS_AdminConfig once. Falls back to the default until it
 * resolves (or if the key is unset), so the form never blocks on the fetch — mirrors
 * pendingResponse/useEscalationDays.
 */
export function useClassifiedCaptureThreshold(): number {
  const { adminConfigService } = useServices();
  const [threshold, setThreshold] = React.useState<number>(DEFAULT_CLASSIFIED_CAPTURE_THRESHOLD);

  React.useEffect(() => {
    adminConfigService
      .getEntries()
      .then((entries) => {
        const entry = entries.find((e) => e.key === CLASSIFIED_CAPTURE_THRESHOLD_KEY);
        if (entry) setThreshold(parseClassifiedCaptureThreshold(entry.value));
      })
      .catch(() => undefined);
  }, [adminConfigService]);

  return threshold;
}
