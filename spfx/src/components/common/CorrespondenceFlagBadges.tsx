import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { StatusBadge } from './StatusBadge';
import { ICorrespondenceStub } from '../../models/ICorrespondence';
import { DEFAULT_ESCALATION_DAYS, pendingResponseState } from '../../modules/pendingResponse/pendingResponseEscalation';

export interface ICorrespondenceFlagBadgesProps {
  item: Pick<ICorrespondenceStub, 'expedited' | 'pendingResponse' | 'pendingResponseDetail'>;
  /** Applied to each badge — list screens use it to space badges after inline subject text. */
  badgeClassName?: string;
  /** CMS-014 AC4 — the configured escalation deadline (days). When the flag is past it, the
   * Pending Response badge is shown as escalation-due (danger). Defaults to DEFAULT_ESCALATION_DAYS. */
  escalationDays?: number;
  /** CMS-015 AC4 — the shortened escalation window (days) applied to expedited items, so an expedited
   * pending item shows escalation-due sooner (escalation.expeditedDays). Omit to keep the normal window. */
  expeditedEscalationDays?: number;
}

/** The Expedited / Pending Response badge pair (CMS-014/015). Rendered from one place so the
 * same labels and tones show wherever a correspondence row or card is drawn. A pending-response
 * flag past its escalation deadline (AC4) is drawn danger/"escalation due" instead of warning. */
export const CorrespondenceFlagBadges: React.FC<ICorrespondenceFlagBadgesProps> = ({
  item,
  badgeClassName,
  escalationDays = DEFAULT_ESCALATION_DAYS,
  expeditedEscalationDays,
}) => {
  const { t } = useTranslation();
  const state = pendingResponseState(item, escalationDays, undefined, expeditedEscalationDays);
  return (
    <>
      {item.expedited && (
        // CMS-015 AC3 — the expedite reason is shown wherever the flag appears (here as the badge's
        // tooltip, since list/card rows are space-constrained; the Details tab shows it in full).
        <StatusBadge
          className={badgeClassName}
          label={t('expedite.badge')}
          tone="danger"
          title={item.expedited.reason ? t('expedite.reasonTooltip', { reason: item.expedited.reason }) : undefined}
        />
      )}
      {state === 'overdue' && (
        <StatusBadge className={badgeClassName} label={t('pendingResponse.escalationBadge')} tone="danger" />
      )}
      {state === 'pending' && <StatusBadge className={badgeClassName} label={t('pendingResponse.badge')} tone="warning" />}
    </>
  );
};
