import * as React from 'react';
import { useServices } from '../../state/hooks';
import { DEFAULT_SLA_CONFIG, ISlaConfig, resolveSlaConfig } from './escalationTimers';

/**
 * CMS-016 AC3 — reads the notification/escalation cadences from CORMS_AdminConfig once (via REST) so
 * deadlines and escalation state are driven by config, changeable without a redeploy. Falls back to
 * DEFAULT_SLA_CONFIG until the fetch resolves (or if the keys are unset), so the UI never blocks.
 */
export function useSlaConfig(): ISlaConfig {
  const { adminConfigService } = useServices();
  const [config, setConfig] = React.useState<ISlaConfig>(DEFAULT_SLA_CONFIG);

  React.useEffect(() => {
    adminConfigService
      .getEntries()
      .then((entries) => {
        const values: Record<string, string | undefined> = {};
        entries.forEach((e) => {
          values[e.key] = e.value;
        });
        setConfig(resolveSlaConfig(values));
      })
      .catch(() => undefined);
  }, [adminConfigService]);

  return config;
}
