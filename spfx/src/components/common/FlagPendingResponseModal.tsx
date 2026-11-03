import * as React from 'react';
import { Building2, Globe2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Modal } from './Modal';
import { Button } from './Button';
import { SearchableSelect, ISelectOption } from '../../modules/createCorrespondence/components/SearchableSelect';
import { IAwaitedParty } from '../../models/ICorrespondence';
import { useServices } from '../../state/hooks';
import styles from './FlagPendingResponseModal.module.scss';

// TODO(confirm): no Figma frame yet — modeled on shared components + story ACs (CMS-014);
// confirm against design when available.
export interface IFlagPendingResponseModalProps {
  isOpen: boolean;
  onDismiss: () => void;
  onFlag: (awaitedParty: IAwaitedParty) => void;
}

export const FlagPendingResponseModal: React.FC<IFlagPendingResponseModalProps> = ({ isOpen, onDismiss, onFlag }) => {
  const { t } = useTranslation();
  const { metadataService, externalOrgsService } = useServices();
  const [partyType, setPartyType] = React.useState<'Internal' | 'External'>('Internal');
  const [selected, setSelected] = React.useState<ISelectOption | undefined>(undefined);

  React.useEffect(() => {
    if (isOpen) {
      setPartyType('Internal');
      setSelected(undefined);
    }
  }, [isOpen]);

  const handleFlag = (): void => {
    if (!selected) return;
    onFlag({ type: partyType, name: selected.label });
  };

  return (
    <Modal
      isOpen={isOpen}
      onDismiss={onDismiss}
      title={t('pendingResponse.modal.title')}
      width={440}
      footer={
        <>
          <Button variant="default" text={t('common.cancel')} onClick={onDismiss} />
          <Button variant="primary" disabled={!selected} text={t('pendingResponse.modal.flagItem')} onClick={handleFlag} />
        </>
      }
    >
      <div className={styles.field}>
        <span className={styles.label}>{t('pendingResponse.modal.awaitedParty')}</span>
        <div className={styles.segmented}>
          <button
            type="button"
            className={`${styles.segmentButton} ${partyType === 'Internal' ? styles.segmentButtonActive : ''}`}
            onClick={() => {
              setPartyType('Internal');
              setSelected(undefined);
            }}
          >
            <Building2 size={14} /> {t('createCorrespondence.field.internal')}
          </button>
          <button
            type="button"
            className={`${styles.segmentButton} ${partyType === 'External' ? styles.segmentButtonActive : ''}`}
            onClick={() => {
              setPartyType('External');
              setSelected(undefined);
            }}
          >
            <Globe2 size={14} /> {t('createCorrespondence.field.external')}
          </button>
        </div>
        <SearchableSelect
          placeholder={
            partyType === 'Internal'
              ? t('createCorrespondence.field.destinationDepartmentsPlaceholder')
              : t('createCorrespondence.field.externalOrganizationsPlaceholder')
          }
          fetchOptions={async (query) => {
            if (partyType === 'Internal') {
              const results = await metadataService.getDestinationDepartments(query);
              return results.map((r): ISelectOption => ({ id: r.id, label: r.name }));
            }
            const results = await externalOrgsService.getExternalOrganizations(query);
            return results.map((r): ISelectOption => ({ id: r.id, label: r.name }));
          }}
          selected={selected ? [selected] : []}
          onChange={(next) => setSelected(next[0])}
        />
      </div>
    </Modal>
  );
};
