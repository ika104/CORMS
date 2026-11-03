import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { useServices } from '../../../state/hooks';
import { DocumentViewer, IDocumentViewerBodyLine } from '../../../components/common/DocumentViewer';
import { Spinner } from '../../../components/common/Spinner';
import { Icon } from '../../../components/icons/Icon';
import { SECURITY_TIERS } from '../../../models/ICorrespondence';
import { IAttachment, ICorrespondenceDetail } from '../../../models/ICorrespondenceDetail';
import { useNav } from '../../../state/hooks';
import { isRecordsAdmin } from '../roleHelpers';
import {
  buildRepeatingTextWatermarks,
  isWatermarkMandatory,
  watermarkOnByDefault,
} from '../../../services/documentPreview/groupDocsRequests';
import { formatCardDateTime } from '../../../utils/formatDateTime';
import styles from './PreviewTab.module.scss';

export interface IPreviewTabProps {
  detail: ICorrespondenceDetail;
  attachments: IAttachment[];
  /** True while the parent is still fetching attachments — the tab mounts as soon as `detail`
   * resolves, before attachments arrive, so without this it would flash the "can't preview"
   * fallback until the (later) attachments call completes. Keep the loader up until then. */
  attachmentsLoading?: boolean;
  /** Opens the main attachment at its SharePoint URL in a new tab — from there the user can
   * edit, view, download or print using their own SharePoint permissions, so this tab doesn't
   * duplicate those actions as separate buttons. */
  onOpenDocument: () => void;
  /** CMS-041 AC1 — Reply from the reading pane. Provided only for received (incoming) items; when
   * absent the button is not shown (a sent item cannot be replied to). */
  onReply?: () => void;
}

const RENDERABLE_EXT = /\.(pdf|tiff?|png|jpe?g|docx?)$/i;
const ZOOM_STEP = 0.25;
const MIN_ZOOM = 0.5;
const MAX_ZOOM = 2;

export const PreviewTab: React.FC<IPreviewTabProps> = ({
  detail,
  attachments,
  attachmentsLoading,
  onOpenDocument,
  onReply,
}) => {
  const { t } = useTranslation();
  const { documentPreviewService } = useServices();
  const { currentUser } = useNav();
  const [zoom, setZoom] = React.useState(1);
  const [currentPage, setCurrentPage] = React.useState(1);
  // Every document opens watermarked. Only Records Administrators can change that preference.
  const watermarkMandatory = isWatermarkMandatory(detail.direction, detail.securityTier);
  const [watermarkPref, setWatermarkPref] = React.useState(() => watermarkOnByDefault(detail.direction));
  // Effective state: a mandatory (classified received) item is always watermarked regardless of the
  // toggle (AC5); otherwise it follows the user's toggle.
  const watermarkOn = watermarkMandatory || watermarkPref;
  const canToggleWatermark = isRecordsAdmin(currentUser);

  const mainAttachment = attachments.find((a) => a.isMain) ?? attachments[0];
  const renderable = !!mainAttachment && RENDERABLE_EXT.test(mainAttachment.name);
  const pageCount = mainAttachment?.pages ?? 1;
  const documentUrl = mainAttachment?.url;

  // GroupDocs server-side preview (data-URI PNG per page). undefined images + notConfigured means
  // no viewer URL is set in Admin Config; on any failure or when unconfigured we fall back to the
  // built-in DocumentViewer below. previewLoading starts true whenever there's a document, so the
  // first render shows the loader (not a flash of the "can't preview" fallback) until viewdoc responds.
  const [previewImages, setPreviewImages] = React.useState<string[] | undefined>(undefined);
  const [previewLoading, setPreviewLoading] = React.useState<boolean>(!!documentUrl);
  const [previewNotConfigured, setPreviewNotConfigured] = React.useState(false);

  const securityLevelName = SECURITY_TIERS.find((tier) => tier.tier === detail.securityTier)?.name ?? '';
  // Watermark text is the item's classification; falls back to a generic CONFIDENTIAL when the tier
  // has no resolved name. The toggle is always available so any document can be watermarked.
  const watermarkText = securityLevelName || 'CONFIDENTIAL';

  // Re-renders the preview whenever the document OR the watermark toggle changes: with the toggle
  // on we ask viewdoc to BURN the classification watermark into the returned page images
  // (ViewDocs.includeWatermarks/watermarks), rather than the old CSS overlay — so it's part of the
  // actual rendered pages and survives print/screenshot.
  React.useEffect(() => {
    if (!documentUrl) {
      setPreviewImages(undefined);
      setPreviewNotConfigured(false);
      return undefined;
    }
    let cancelled = false;
    setPreviewLoading(true);
    setPreviewNotConfigured(false);
    const watermarks = watermarkOn ? buildRepeatingTextWatermarks(watermarkText) : undefined;
    documentPreviewService
      .getPreviewImages(documentUrl, watermarks)
      .then((images) => {
        if (cancelled) return;
        setPreviewNotConfigured(images === undefined);
        setPreviewImages(images && images.length ? images : undefined);
      })
      .catch(() => {
        if (!cancelled) setPreviewImages(undefined);
      })
      .finally(() => {
        if (!cancelled) setPreviewLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [documentPreviewService, documentUrl, watermarkOn, watermarkText]);

  const groupDocsNotConfigured = previewNotConfigured;
  const hasServerPreview = !!previewImages && previewImages.length > 0;
  // Keep the loader up while the parent is still fetching attachments too, so the fallback never
  // flashes before we even know what the document is.
  const showLoader = attachmentsLoading || previewLoading;

  // DECISION (CMS-040 Part 5): GroupDocs.Viewer has no browser-embeddable client SDK — the only
  // GroupDocs product that could render documents from a pure client SPFx app is the Cloud REST
  // API, which needs an OAuth2 Client Secret. A Secret is not safe to embed in client-side SPFx
  // code (unlike this license key, which only gates local UI state, never leaves the browser).
  // Building a secure server-side credential broker for that is out of scope for an SPFx-only
  // task, so the real render surface here stays the existing DocumentViewer (PDF/image/docx),
  // with a real, functional watermark overlay (DocumentViewer's own watermarkOverlay) — not a
  // GroupDocs-Cloud-dependent one. The license key config is left in place, ready for that
  // follow-up once a token-broker exists.
  // Fallback mock body — only used when the attachment has no real document URL to embed.
  const bodyLines: IDocumentViewerBodyLine[] = [
    { text: detail.subject, bold: true },
    { text: '' },
    {
      text: `${t('correspondenceDetail.field.refNo')}: ${detail.referenceNumber || t('myCorrespondence.draftNotRegistered')}`,
    },
    { text: `${t('correspondenceDetail.field.createdAt')}: ${formatCardDateTime(detail.createdAt)}` },
    { text: `${t('correspondenceDetail.field.department')}: ${detail.department}` },
    { text: `${t('correspondenceDetail.field.securityLevel')}: ${securityLevelName}` },
    { text: '' },
    { text: `${t('correspondenceDetail.field.sender')}: ${detail.senderName || '—'}` },
    { text: `${t('correspondenceDetail.field.recipient')}: ${detail.recipientName || '—'}` },
  ];

  return (
    <div className={styles.tab}>
      {groupDocsNotConfigured && (
        <div className={styles.notConfiguredNotice}>
          <Icon name="info" size={14} /> {t('correspondenceDetail.preview.groupDocsNotConfigured')}
        </div>
      )}
      <div className={styles.actionBar}>
        {onReply && (
          <button type="button" className={`${styles.actionBtn} ${styles.actionBtnOn}`} onClick={onReply}>
            <Icon name="reply" size={14} /> {t('myCorrespondence.reply')}
          </button>
        )}
        <button
          type="button"
          className={styles.actionBtn}
          onClick={onOpenDocument}
          disabled={!mainAttachment?.url}
        >
          <Icon name="externalLink" size={14} /> {t('correspondenceDetail.action.openDocument')}
        </button>
        {canToggleWatermark && (
          <button
            type="button"
            className={watermarkOn ? `${styles.actionBtn} ${styles.actionBtnOn}` : styles.actionBtn}
            onClick={() => setWatermarkPref((v) => !v)}
            disabled={watermarkMandatory}
            title={watermarkMandatory ? t('correspondenceDetail.preview.watermarkRequired') : undefined}
          >
            <Icon name={watermarkMandatory ? 'lock' : watermarkOn ? 'check' : 'watermark'} size={14} />
            {watermarkMandatory
              ? t('correspondenceDetail.preview.watermarkRequired')
              : watermarkOn
                ? t('correspondenceDetail.preview.watermarked')
                : t('correspondenceDetail.preview.toggleWatermark')}
          </button>
        )}
      </div>
      {showLoader ? (
        <div className={styles.previewLoading}>
          <Spinner label={t('correspondenceDetail.preview.loading')} />
        </div>
      ) : hasServerPreview ? (
        <div className={styles.previewPages}>
          {previewImages!.map((src, index) => (
            <img
              key={index}
              className={styles.previewPage}
              src={src}
              alt={`${t('correspondenceDetail.preview.page')} ${index + 1}`}
            />
          ))}
        </div>
      ) : (
        <DocumentViewer
          pageCount={pageCount}
          currentPage={Math.min(currentPage, pageCount)}
          onPageChange={setCurrentPage}
          zoom={zoom}
          onZoomIn={() => setZoom((z) => Math.min(MAX_ZOOM, +(z + ZOOM_STEP).toFixed(2)))}
          onZoomOut={() => setZoom((z) => Math.max(MIN_ZOOM, +(z - ZOOM_STEP).toFixed(2)))}
          onZoomReset={() => setZoom(1)}
          watermarkOn={watermarkOn}
          watermarkText={watermarkText}
          renderable={renderable}
          fileName={mainAttachment?.name ?? detail.subject}
          documentUrl={mainAttachment?.url}
          bodyLines={bodyLines}
          onOpenDocument={onOpenDocument}
        />
      )}
    </div>
  );
};
