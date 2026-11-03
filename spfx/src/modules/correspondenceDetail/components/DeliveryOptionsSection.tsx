import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { Check, X } from 'lucide-react';
import { useServices } from '../../../state/hooks';
import { ICorrespondenceDetail } from '../../../models/ICorrespondenceDetail';
import { ICourierConfig, courierFieldLabel } from '../../../models/ICourierConfig';
import { canDeliverExternally } from '../declaration';
import styles from './DeliveryOptionsSection.module.scss';

export interface IDeliveryOptionsSectionProps {
  detail: ICorrespondenceDetail;
}

interface IRow {
  label: string;
  value: string;
}

// CMS-020 — read-only view of the correspondence's Delivery Options (Email + Physical Mail) and, for
// Physical Mail, the dispatch details captured by the wizard. The dispatch is stored as JSON
// (CORMS_Correspondence.PhysicalDispatch), so the dynamic courier fields are rendered generically;
// couriers are fetched only to resolve each field's admin-configured label.
export const DeliveryOptionsSection: React.FC<IDeliveryOptionsSectionProps> = ({ detail }) => {
  const { t } = useTranslation();
  const { metadataService } = useServices();
  const [couriers, setCouriers] = React.useState<ICourierConfig[]>([]);

  const dispatch = detail.physicalDispatch;
  React.useEffect(() => {
    if (dispatch?.method === 'Courier') {
      metadataService.getCouriers().then(setCouriers).catch(() => setCouriers([]));
    }
  }, [metadataService, dispatch]);

  // Nothing to show if neither channel is recorded (older items created before Delivery Options).
  if (detail.deliveryEmail === undefined && detail.deliveryPhysicalMail === undefined && !dispatch) {
    return null;
  }

  const dispatchRows: IRow[] = [];
  if (dispatch) {
    dispatchRows.push({ label: t('deliveryOptions.method'), value: t(`physicalMail.method.${dispatch.method}.name`) });
    if (dispatch.method === 'Courier') {
      const courier = couriers.find((c) => c.id === dispatch.courierId);
      if (dispatch.courier) dispatchRows.push({ label: t('physicalMail.courier'), value: dispatch.courier });
      if (dispatch.trackingRef) dispatchRows.push({ label: t('physicalMail.trackingRef'), value: dispatch.trackingRef });
      Object.keys(dispatch.courierFields ?? {}).forEach((key) => {
        const value = (dispatch.courierFields ?? {})[key];
        if (value) dispatchRows.push({ label: courierFieldLabel(courier, key), value });
      });
    } else if (dispatch.method === 'InPerson') {
      if (dispatch.bearerName) dispatchRows.push({ label: t('physicalMail.bearerName'), value: dispatch.bearerName });
      if (dispatch.bearerDateTime) dispatchRows.push({ label: t('physicalMail.deliveryDateTime'), value: dispatch.bearerDateTime });
    } else if (dispatch.method === 'Postal') {
      if (dispatch.postalService) dispatchRows.push({ label: t('physicalMail.postalService'), value: dispatch.postalService });
      if (dispatch.receiptNumber) dispatchRows.push({ label: t('physicalMail.receiptNumber'), value: dispatch.receiptNumber });
    }
    if (dispatch.comment) dispatchRows.push({ label: t('physicalMail.comment'), value: dispatch.comment });
  }

  return (
    <div className={styles.section}>
      <div className={styles.title}>{t('deliveryOptions.title')}</div>

      <div className={styles.channels}>
        <span className={`${styles.channel} ${detail.deliveryEmail ? styles.channelOn : ''}`}>
          {detail.deliveryEmail ? <Check size={14} /> : <X size={14} />} {t('createCorrespondence.field.email')}
        </span>
        <span className={`${styles.channel} ${detail.deliveryPhysicalMail ? styles.channelOn : ''}`}>
          {detail.deliveryPhysicalMail ? <Check size={14} /> : <X size={14} />} {t('createCorrespondence.field.physicalMail')}
        </span>
      </div>

      {dispatchRows.length > 0 && (
        <div className={styles.dispatch}>
          {dispatchRows.map((row, i) => (
            <div key={i} className={styles.row}>
              <span className={styles.label}>{row.label}</span>
              <span className={styles.value}>{row.value}</span>
            </div>
          ))}
        </div>
      )}
      {detail.deliveryPhysicalMail && !dispatch && <div className={styles.pending}>{t('deliveryOptions.dispatchPending')}</div>}
      {/* CMS-008 AC4 — an undeclared draft cannot be delivered to external parties. */}
      {(detail.deliveryEmail || detail.deliveryPhysicalMail) && !canDeliverExternally(detail.status) && (
        <div className={styles.blocked}>{t('deliveryOptions.undeclaredBlocked')}</div>
      )}
    </div>
  );
};
