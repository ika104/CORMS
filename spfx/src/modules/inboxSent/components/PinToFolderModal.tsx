import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { Modal } from '../../../components/common/Modal';
import { Button } from '../../../components/common/Button';
import { Icon } from '../../../components/icons/Icon';
import { IUserFolder } from '../../../models/IFolder';
import styles from './PinToFolderModal.module.scss';

export interface IPinToFolderModalProps {
  isOpen: boolean;
  onDismiss: () => void;
  folders: IUserFolder[];
  /** Ids already pinned into each folder, for the given item — drives the "Pinned" state. */
  pinnedFolderIds: string[];
  onTogglePin: (folderId: string) => void;
}

export const PinToFolderModal: React.FC<IPinToFolderModalProps> = ({
  isOpen,
  onDismiss,
  folders,
  pinnedFolderIds,
  onTogglePin,
}) => {
  const { t } = useTranslation();

  return (
    <Modal
      isOpen={isOpen}
      onDismiss={onDismiss}
      title={t('inboxSent.pinModal.title')}
      width={380}
      footer={<Button variant="default" text={t('inboxSent.pinModal.cancel')} onClick={onDismiss} />}
    >
      <p className={styles.choose}>{t('inboxSent.pinModal.choose')}</p>
      {folders.length === 0 ? (
        <p className={styles.empty}>{t('inboxSent.pinModal.noFolders')}</p>
      ) : (
        <div className={styles.list}>
          {folders.map((folder) => {
            const pinned = pinnedFolderIds.indexOf(folder.id) !== -1;
            return (
              <button key={folder.id} type="button" className={styles.item} onClick={() => onTogglePin(folder.id)}>
                <Icon name={pinned ? 'checkCircle' : 'folderOpen'} size={16} />
                <span className={styles.itemName}>{folder.name}</span>
                {pinned && <span className={styles.pinnedTag}>{t('inboxSent.pinModal.pinned')}</span>}
              </button>
            );
          })}
        </div>
      )}
    </Modal>
  );
};
