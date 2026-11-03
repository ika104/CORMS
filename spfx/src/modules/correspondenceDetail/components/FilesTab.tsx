import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { Icon } from '../../../components/icons/Icon';
import { IAttachment, IPhysicalAttachmentStub } from '../../../models/ICorrespondenceDetail';
import styles from './FilesTab.module.scss';

export interface IFilesTabProps {
  attachments: IAttachment[];
  physicalAttachments: IPhysicalAttachmentStub[];
  onPreview: (attachment: IAttachment) => void;
  onDownload: (attachment: IAttachment) => void;
}

interface IFileTypeMeta {
  label: string;
  color: string;
  bg: string;
}

// A small, at-a-glance file-type badge per row (PDF/DOCX/XLSX/...) — same idea as the coloured
// document-type squares SharePoint itself uses, so a Files list of mixed attachment types stays
// scannable at more than one item.
const FILE_TYPE_META: Record<string, IFileTypeMeta> = {
  pdf: { label: 'PDF', color: '#c50f1f', bg: '#fde7e9' },
  doc: { label: 'DOC', color: '#185abd', bg: '#e8f0fb' },
  docx: { label: 'DOC', color: '#185abd', bg: '#e8f0fb' },
  xls: { label: 'XLS', color: '#107c41', bg: '#dff6dd' },
  xlsx: { label: 'XLS', color: '#107c41', bg: '#dff6dd' },
  ppt: { label: 'PPT', color: '#c43e1c', bg: '#fce4d6' },
  pptx: { label: 'PPT', color: '#c43e1c', bg: '#fce4d6' },
  png: { label: 'IMG', color: '#5c2d91', bg: '#f4eafb' },
  jpg: { label: 'IMG', color: '#5c2d91', bg: '#f4eafb' },
  jpeg: { label: 'IMG', color: '#5c2d91', bg: '#f4eafb' },
  tif: { label: 'IMG', color: '#5c2d91', bg: '#f4eafb' },
  tiff: { label: 'IMG', color: '#5c2d91', bg: '#f4eafb' },
};
const DEFAULT_FILE_TYPE: IFileTypeMeta = { label: 'FILE', color: '#605e5c', bg: '#f3f2f1' };

function fileTypeMeta(name: string): IFileTypeMeta {
  const ext = name.split('.').pop()?.toLowerCase() ?? '';
  return FILE_TYPE_META[ext] ?? DEFAULT_FILE_TYPE;
}

export const FilesTab: React.FC<IFilesTabProps> = ({ attachments, physicalAttachments, onPreview, onDownload }) => {
  const { t } = useTranslation();

  return (
    <div className={styles.tab}>
      <div className={styles.header}>{t('correspondenceDetail.files.visibleCount', { count: attachments.length })}</div>

      {attachments.length === 0 ? (
        <div className={styles.empty}>{t('correspondenceDetail.files.none')}</div>
      ) : (
        attachments.map((att) => {
          const type = fileTypeMeta(att.name);
          return (
            <div key={att.id} className={styles.row}>
              <span className={styles.typeBadge} style={{ color: type.color, background: type.bg }}>
                {type.label}
              </span>
              <div className={styles.info}>
                <div className={styles.name}>
                  {att.name}
                  {att.isMain && <span className={styles.mainBadge}>{t('correspondenceDetail.files.main')}</span>}
                </div>
                <div className={styles.meta}>
                  {t('correspondenceDetail.files.pages', { count: att.pages ?? 1 })} · {att.source}
                </div>
              </div>
              <div className={styles.actions}>
                <button
                  type="button"
                  className={styles.iconBtn}
                  onClick={() => onPreview(att)}
                  aria-label={t('myCorrespondence.openPreview')}
                  disabled={!att.url}
                >
                  <Icon name="search" size={14} />
                </button>
                <button
                  type="button"
                  className={styles.iconBtn}
                  onClick={() => onDownload(att)}
                  aria-label={t('myCorrespondence.download')}
                  disabled={!att.url}
                >
                  <Icon name="download" size={14} />
                </button>
              </div>
            </div>
          );
        })
      )}

      {physicalAttachments.length > 0 && (
        <>
          <div className={styles.header}>{t('correspondenceDetail.files.physicalHeader', { count: physicalAttachments.length })}</div>
          {physicalAttachments.map((phys) => (
            <div key={phys.id} className={styles.row}>
              <span className={styles.typeBadge} style={{ color: DEFAULT_FILE_TYPE.color, background: DEFAULT_FILE_TYPE.bg }}>
                {t('correspondenceDetail.files.physicalBadge')}
              </span>
              <div className={styles.info}>
                <div className={styles.name}>{phys.resourceIdentifier}</div>
                <div className={styles.meta}>
                  {phys.storageLocation}
                  {phys.description ? ` · ${phys.description}` : ''}
                </div>
              </div>
            </div>
          ))}
        </>
      )}
    </div>
  );
};
