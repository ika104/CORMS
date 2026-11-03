import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { Icon } from '../icons/Icon';
import { Button } from './Button';
import styles from './DocumentViewer.module.scss';

export interface IDocumentViewerBodyLine {
  text: string;
  bold?: boolean;
}

export interface IDocumentViewerProps {
  /** Total renderable pages — drives the thumbnail strip. */
  pageCount: number;
  currentPage: number;
  onPageChange: (page: number) => void;
  zoom: number;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onZoomReset: () => void;
  /** Whether the diagonal watermark overlay is currently shown — the toggle button itself lives
   * in PreviewTab's action bar so it stays visible even in the non-renderable fallback state. */
  watermarkOn: boolean;
  watermarkText?: string;
  /** False for non-renderable attachment types — shows the "preview not available" fallback instead. */
  renderable: boolean;
  fileName: string;
  /** The attachment's real SharePoint/document URL — when set, it's embedded in an iframe instead
   * of the synthetic mock page body (GroupDocs Viewer API embed is a later backend task). */
  documentUrl?: string;
  bodyLines?: IDocumentViewerBodyLine[];
  onOpenDocument?: () => void;
}

const MIN_ZOOM = 0.5;
const MAX_ZOOM = 2;

// The one genuinely new primitive this screen needs (everything else reuses shared common
// components) — stubbed against mock page content for now; GroupDocs Viewer API embed is a
// later backend/integration task (see the Preview tab).
export const DocumentViewer: React.FC<IDocumentViewerProps> = ({
  pageCount,
  currentPage,
  onPageChange,
  zoom,
  onZoomIn,
  onZoomOut,
  onZoomReset,
  watermarkOn,
  watermarkText = 'CONFIDENTIAL — CORMS',
  renderable,
  fileName,
  documentUrl,
  bodyLines,
  onOpenDocument,
}) => {
  const { t } = useTranslation();

  if (!renderable) {
    return (
      <div className={styles.fallback}>
        <Icon name="fileWarning" size={40} />
        <div className={styles.fallbackTitle}>{t('correspondenceDetail.preview.notAvailable')}</div>
        <div className={styles.fallbackDescription}>{t('correspondenceDetail.preview.notAvailableDescription')}</div>
        {onOpenDocument && (
          <Button variant="primary" onClick={onOpenDocument} text={t('correspondenceDetail.action.openDocument')} />
        )}
      </div>
    );
  }

  return (
    <div className={styles.viewer}>
      <div className={styles.thumbStrip} role="listbox" aria-label={t('correspondenceDetail.preview.pages')}>
        {Array.from({ length: pageCount }).map((_, i) => {
          const page = i + 1;
          const active = page === currentPage;
          return (
            <button
              key={page}
              type="button"
              role="option"
              aria-selected={active}
              className={active ? `${styles.thumb} ${styles.thumbActive}` : styles.thumb}
              onClick={() => onPageChange(page)}
            >
              <span className={styles.thumbLine} style={{ width: '80%' }} />
              <span className={styles.thumbLine} style={{ width: '60%' }} />
              <span className={styles.thumbLine} style={{ width: '70%' }} />
              <span className={styles.thumbPageNo}>{t('correspondenceDetail.preview.pageShort', { page })}</span>
            </button>
          );
        })}
      </div>

      <div className={styles.canvasArea}>
        <div className={styles.toolbarRow}>
          <div className={styles.zoomControls}>
            <button type="button" onClick={onZoomOut} disabled={zoom <= MIN_ZOOM} aria-label={t('correspondenceDetail.preview.zoomOut')}>
              <Icon name="zoomOut" size={16} />
            </button>
            <span className={styles.zoomValue}>{Math.round(zoom * 100)}%</span>
            <button type="button" onClick={onZoomIn} disabled={zoom >= MAX_ZOOM} aria-label={t('correspondenceDetail.preview.zoomIn')}>
              <Icon name="zoomIn" size={16} />
            </button>
            <button type="button" onClick={onZoomReset} aria-label={t('correspondenceDetail.preview.zoomReset')}>
              <Icon name="rotateCcw" size={16} />
            </button>
          </div>
          {watermarkOn && (
            <span className={styles.watermarkIndicator}>
              <Icon name="check" size={14} /> {t('correspondenceDetail.preview.watermarked')}
            </span>
          )}
        </div>

        <div className={styles.pageWrap}>
          {documentUrl ? (
            <div className={styles.pdfFrameWrap} style={{ transform: `scale(${zoom})` }}>
              {watermarkOn && (
                <div className={styles.watermarkOverlay} aria-hidden="true">
                  {Array.from({ length: 10 }).map((_, i) => (
                    <span key={i}>{watermarkText}</span>
                  ))}
                </div>
              )}
              <iframe key={documentUrl} title={fileName} src={documentUrl} className={styles.pdfFrame} />
            </div>
          ) : (
            <div className={styles.page} style={{ transform: `scale(${zoom})` }}>
              {watermarkOn && (
                <div className={styles.watermarkOverlay} aria-hidden="true">
                  {Array.from({ length: 10 }).map((_, i) => (
                    <span key={i}>{watermarkText}</span>
                  ))}
                </div>
              )}
              <div className={styles.pageBody}>
                {(bodyLines ?? []).map((line, i) => (
                  <div key={i} className={line.bold ? styles.lineBold : styles.line}>
                    {line.text || ' '}
                  </div>
                ))}
              </div>
              <div className={styles.pageFooter}>
                {t('correspondenceDetail.preview.pageOf', { page: currentPage, total: pageCount })} · {fileName}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
