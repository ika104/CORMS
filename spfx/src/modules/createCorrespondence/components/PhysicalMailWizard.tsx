import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { Truck, User, Send, ArrowLeft, ArrowRight, Check } from 'lucide-react';
import { Modal } from '../../../components/common/Modal';
import { IPhysicalDispatch, PhysicalDispatchMethod, isPhysicalDispatchComplete } from '../../../models/IPhysicalDispatch';
import { ICourierConfig, courierFieldsComplete, generateTrackingRef } from '../../../models/ICourierConfig';
import styles from './PhysicalMailWizard.module.scss';

export interface IPhysicalMailWizardProps {
  isOpen: boolean;
  /** Couriers to offer on the Courier path — admin-managed (admin.couriersJson), each with its own
   * fields. */
  couriers: ICourierConfig[];
  /** Existing dispatch to edit — the wizard opens pre-filled on its Details step; undefined starts
   * fresh on the Method step. */
  initial?: IPhysicalDispatch;
  onDismiss: () => void;
  onSubmit: (dispatch: IPhysicalDispatch) => void;
}

const METHODS: { id: PhysicalDispatchMethod; icon: React.ReactNode }[] = [
  { id: 'Courier', icon: <Truck size={18} /> },
  { id: 'InPerson', icon: <User size={18} /> },
  { id: 'Postal', icon: <Send size={18} /> },
];

// CMS-020 §13 — the Physical Mail dispatch wizard: pick a method, then capture that method's
// details. Purely captures the dispatch intent into form state; the dispatch itself is initiated
// (follow-up task + receiver notification) when the correspondence is sent — there is no
// courier-system integration.
export const PhysicalMailWizard: React.FC<IPhysicalMailWizardProps> = ({ isOpen, couriers, initial, onDismiss, onSubmit }) => {
  const { t } = useTranslation();
  const [step, setStep] = React.useState<'method' | 'details'>('method');
  const [method, setMethod] = React.useState<PhysicalDispatchMethod>('Courier');
  const [courierId, setCourierId] = React.useState('');
  const [courierFields, setCourierFields] = React.useState<Record<string, string>>({});
  const [trackingRef, setTrackingRef] = React.useState('');
  const [bearerName, setBearerName] = React.useState('');
  const [bearerDateTime, setBearerDateTime] = React.useState('');
  const [postalService, setPostalService] = React.useState('');
  const [receiptNumber, setReceiptNumber] = React.useState('');
  const [comment, setComment] = React.useState('');

  // Reset/seed each time the wizard is opened, from `initial` when editing an existing dispatch.
  React.useEffect(() => {
    if (!isOpen) return;
    setMethod(initial?.method ?? 'Courier');
    setCourierId(initial?.courierId ?? '');
    setCourierFields(initial?.courierFields ? { ...initial.courierFields } : {});
    setTrackingRef(initial?.trackingRef ?? '');
    setBearerName(initial?.bearerName ?? '');
    setBearerDateTime(initial?.bearerDateTime ?? '');
    setPostalService(initial?.postalService ?? '');
    setReceiptNumber(initial?.receiptNumber ?? '');
    setComment(initial?.comment ?? '');
    setStep(initial ? 'details' : 'method');
  }, [isOpen, initial]);

  const selectedCourier = couriers.find((c) => c.id === courierId);

  // Picking a courier resets its fields and mints a fresh CORMS-side tracking reference (kept once
  // generated so it doesn't churn on every keystroke).
  const handleCourierChange = (id: string): void => {
    setCourierId(id);
    setCourierFields({});
    const courier = couriers.find((c) => c.id === id);
    setTrackingRef(id ? generateTrackingRef(courier?.refPrefix) : '');
  };

  const draft: IPhysicalDispatch = {
    method,
    courier: method === 'Courier' ? selectedCourier?.name : undefined,
    courierId: method === 'Courier' ? courierId || undefined : undefined,
    trackingRef: method === 'Courier' ? trackingRef || undefined : undefined,
    courierFields: method === 'Courier' && Object.keys(courierFields).length ? courierFields : undefined,
    bearerName: method === 'InPerson' ? bearerName || undefined : undefined,
    bearerDateTime: method === 'InPerson' ? bearerDateTime || undefined : undefined,
    postalService: method === 'Postal' ? postalService || undefined : undefined,
    receiptNumber: method === 'Postal' ? receiptNumber || undefined : undefined,
    comment: comment || undefined,
  };
  const canSubmit =
    method === 'Courier' ? !!courierId && courierFieldsComplete(selectedCourier, courierFields) : isPhysicalDispatchComplete(draft);

  const footer =
    step === 'method' ? (
      <button type="button" className={styles.primaryBtn} onClick={() => setStep('details')}>
        {t('physicalMail.next')} <ArrowRight size={14} />
      </button>
    ) : (
      <>
        <button type="button" className={styles.secondaryBtn} onClick={() => setStep('method')}>
          <ArrowLeft size={14} /> {t('physicalMail.back')}
        </button>
        <button type="button" className={styles.primaryBtn} disabled={!canSubmit} onClick={() => onSubmit(draft)}>
          {t('physicalMail.submit')}
        </button>
      </>
    );

  return (
    <Modal isOpen={isOpen} onDismiss={onDismiss} title={t('physicalMail.title')} width={520} footer={footer}>
      <div className={styles.steps}>
        <span className={`${styles.step} ${styles.stepActive}`}>
          <span className={styles.stepNo}>1</span> {t('physicalMail.stepMethod')}
        </span>
        <span className={`${styles.step} ${step === 'details' ? styles.stepActive : ''}`}>
          <span className={styles.stepNo}>2</span> {t('physicalMail.stepDetails')}
        </span>
      </div>

      <div className={styles.dispatchFor}>
        {t('physicalMail.dispatchFor')} <strong>{t('physicalMail.newCorrespondence')}</strong>
      </div>

      {step === 'method' ? (
        <div className={styles.methodList}>
          {METHODS.map((m) => (
            <button
              key={m.id}
              type="button"
              className={`${styles.methodCard} ${method === m.id ? styles.methodCardActive : ''}`}
              onClick={() => setMethod(m.id)}
            >
              <span className={styles.methodIcon}>{m.icon}</span>
              <span className={styles.methodText}>
                <span className={styles.methodName}>{t(`physicalMail.method.${m.id}.name`)}</span>
                <span className={styles.methodDesc}>{t(`physicalMail.method.${m.id}.desc`)}</span>
              </span>
              <span className={styles.radio}>{method === m.id && <Check size={12} />}</span>
            </button>
          ))}
        </div>
      ) : (
        <div className={styles.detailsForm}>
          <div className={styles.chosenMethod}>{t(`physicalMail.method.${method}.name`)}</div>

          {method === 'Courier' && (
            <>
              <label className={styles.field}>
                <span className={styles.fieldLabel}>
                  {t('physicalMail.courier')} <span className={styles.req}>*</span>
                </span>
                <select className={styles.input} value={courierId} onChange={(e) => handleCourierChange(e.target.value)}>
                  <option value="">{t('physicalMail.selectCourier')}</option>
                  {couriers.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
                {selectedCourier?.description && <span className={styles.hint}>{selectedCourier.description}</span>}
              </label>

              {selectedCourier && (
                <>
                  <label className={styles.field}>
                    <span className={styles.fieldLabel}>
                      {t('physicalMail.trackingRef')} <span className={styles.muted}>({t('physicalMail.autoGenerated')})</span>
                    </span>
                    <input type="text" className={styles.input} value={trackingRef} readOnly disabled />
                    <span className={styles.hint}>{t('physicalMail.trackingRefHelper')}</span>
                  </label>

                  {(selectedCourier.fields ?? []).map((field) => (
                    <label key={field.key} className={styles.field}>
                      <span className={styles.fieldLabel}>
                        {field.label} {field.required && <span className={styles.req}>*</span>}
                      </span>
                      {field.type === 'select' ? (
                        <select
                          className={styles.input}
                          value={courierFields[field.key] ?? ''}
                          onChange={(e) => setCourierFields((prev) => ({ ...prev, [field.key]: e.target.value }))}
                        >
                          <option value="">{t('physicalMail.select')}</option>
                          {(field.options ?? []).map((opt) => (
                            <option key={opt} value={opt}>
                              {opt}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <input
                          type="text"
                          className={styles.input}
                          placeholder={field.placeholder}
                          value={courierFields[field.key] ?? ''}
                          onChange={(e) => setCourierFields((prev) => ({ ...prev, [field.key]: e.target.value }))}
                        />
                      )}
                    </label>
                  ))}
                </>
              )}
            </>
          )}

          {method === 'InPerson' && (
            <>
              <label className={styles.field}>
                <span className={styles.fieldLabel}>
                  {t('physicalMail.bearerName')} <span className={styles.req}>*</span>
                </span>
                <input
                  type="text"
                  className={styles.input}
                  placeholder={t('physicalMail.bearerNamePlaceholder')}
                  value={bearerName}
                  onChange={(e) => setBearerName(e.target.value)}
                />
              </label>
              <label className={styles.field}>
                <span className={styles.fieldLabel}>
                  {t('physicalMail.deliveryDateTime')} <span className={styles.req}>*</span>
                </span>
                <input
                  type="datetime-local"
                  className={styles.input}
                  value={bearerDateTime}
                  onChange={(e) => setBearerDateTime(e.target.value)}
                />
              </label>
            </>
          )}

          {method === 'Postal' && (
            <>
              <label className={styles.field}>
                <span className={styles.fieldLabel}>
                  {t('physicalMail.postalService')} <span className={styles.req}>*</span>
                </span>
                <input
                  type="text"
                  className={styles.input}
                  placeholder={t('physicalMail.postalServicePlaceholder')}
                  value={postalService}
                  onChange={(e) => setPostalService(e.target.value)}
                />
              </label>
              <label className={styles.field}>
                <span className={styles.fieldLabel}>{t('physicalMail.receiptNumber')}</span>
                <input
                  type="text"
                  className={styles.input}
                  placeholder={t('physicalMail.optional')}
                  value={receiptNumber}
                  onChange={(e) => setReceiptNumber(e.target.value)}
                />
              </label>
            </>
          )}

          <label className={styles.field}>
            <span className={styles.fieldLabel}>{t('physicalMail.comment')}</span>
            <textarea
              className={styles.textarea}
              placeholder={t('physicalMail.commentPlaceholder')}
              value={comment}
              onChange={(e) => setComment(e.target.value)}
            />
          </label>
        </div>
      )}
    </Modal>
  );
};
