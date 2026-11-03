import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { useNav, useServices } from '../../../state/hooks';
import { Icon } from '../../../components/icons/Icon';
import { Button } from '../../../components/common/Button';
import { Modal } from '../../../components/common/Modal';
import { Spinner } from '../../../components/common/Spinner';
import { IAttachment } from '../../../models/ICorrespondenceDetail';
import { IAnnotationItem } from '../../../models/IGroupDocs';
import { isAccessDenied } from '../../../services/interfaces/ICorrespondenceDetailService';
import { ANNOTATION_TOOLS, AnnotationToolId, isEditableNote, renderKindForType } from './annotationTools';
import { AnnotationStyleBar } from './AnnotationStyleBar';
import { canResizeAnnotation, resizeAnnotationBox } from './annotationGeometry';
import {
  DEFAULT_ANNOTATION_STYLE,
  IAnnotationStyle,
  applyAnnotationStyle,
  styleFromAnnotation,
} from './annotationStyle';
import styles from './AnnotateTab.module.scss';

export interface IAnnotateTabProps {
  /** The correspondence whose document is being annotated — the key under which annotations are
   * persisted (CMS-024). RecordsHub/GroupDocs does not store annotations, so they live in
   * CORMS_Correspondence.AnnotationsJson and are loaded/saved via correspondenceDetailService. */
  correspondenceId: string;
  attachments: IAttachment[];
  attachmentsLoading?: boolean;
  /** Called after an explicit Save persists new annotations (AC4) — the detail view audits it (AC9). */
  onSave: (comment: string) => void;
  /** CMS-024 AC9 — annotation activity beyond save (clear-all, remove) is audited via this callback. */
  onAudit?: (action: string, details: string) => void;
}

// Default click-placed box sizes (in the page image's natural pixels).
const NOTE_W = 220;
const NOTE_H = 44;
const SHAPE_W = 180;
const SHAPE_H = 110;
// Minimum time the "Saving annotations…" state stays visible after Save is clicked, so the loader
// is never too quick to notice (a fast persist, or the no-unsaved-changes path, would otherwise
// close the modal instantly).
const MIN_SAVING_DISPLAY_MS = 600;

interface ILocalAnnotation extends IAnnotationItem {
  key: string;
  saved: boolean; // true once persisted server-side (so it can be removed by id)
}

let localKeySeq = 0;
const nextKey = (): string => `a-${(localKeySeq += 1)}`;

/** Bounding box (natural pixels) of a freehand point set, for the API payload + overlay sizing. */
function boundingBox(points: { x: number; y: number }[]): {
  x: number;
  y: number;
  width: number;
  height: number;
} {
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  return {
    x: minX,
    y: minY,
    width: Math.max(1, Math.max(...xs) - minX),
    height: Math.max(1, Math.max(...ys) - minY),
  };
}

// Correspondence Detail → Annotate tab (CMS-024). Renders the document directly via the GroupDocs
// preview API (AC2 — never downloaded) and layers GroupDocs annotations on top: existing ones are
// loaded (/api/Annotation/get, AC8) and drawn; a tool + click/drag adds a new one; Save persists
// them explicitly (/api/Annotation/add, saveToSharePoint — AC4) to the separate annotation store
// (AC6), leaving the declared record untouched (AC10). Each new annotation is attributed to the
// signed-in user with a timestamp (AC7). The tab lives inside the clearance-gated detail view, so
// the session is scoped to this document and the viewer's clearance (AC5). Coordinates are kept in
// each page's natural-pixel space and rendered as percentages so overlays track the responsive image.
export const AnnotateTab: React.FC<IAnnotateTabProps> = ({
  correspondenceId,
  attachments,
  attachmentsLoading,
  onSave,
  onAudit,
}) => {
  const { t } = useTranslation();
  const { documentPreviewService, correspondenceDetailService } = useServices();
  const { currentUser } = useNav();
  const [activeTool, setActiveTool] = React.useState<AnnotationToolId>('text');
  // The colour/width style applied to new annotations. When an annotation is selected, the style
  // bar edits that annotation instead (see handleStyleChange) — but this stays the default for the
  // next drawn annotation.
  const [style, setStyle] = React.useState<IAnnotationStyle>(DEFAULT_ANNOTATION_STYLE);
  const [selectedKey, setSelectedKey] = React.useState<string | undefined>(undefined);

  const mainAttachment = attachments.find((a) => a.isMain) ?? attachments[0];
  const documentUrl = mainAttachment?.url;
  const authorName = currentUser?.displayName ?? '';

  const [previewImages, setPreviewImages] = React.useState<string[] | undefined>(undefined);
  const [previewLoading, setPreviewLoading] = React.useState<boolean>(!!documentUrl);
  const [pageDims, setPageDims] = React.useState<Record<number, { w: number; h: number }>>({});
  const [annotations, setAnnotations] = React.useState<ILocalAnnotation[]>([]);
  const [textDraft, setTextDraft] = React.useState<{ key: string } | undefined>(undefined);
  const [penDraft, setPenDraft] = React.useState<
    { pageIndex: number; points: { x: number; y: number }[] } | undefined
  >(undefined);
  const [saving, setSaving] = React.useState(false);
  const [commentModalOpen, setCommentModalOpen] = React.useState(false);
  const [saveComment, setSaveComment] = React.useState('');
  const [error, setError] = React.useState<string | undefined>(undefined);
  const pageImageRefs = React.useRef<Record<number, HTMLImageElement | null>>({});
  const resizeState = React.useRef<
    | {
        key: string;
        pageIndex: number;
        pointerId: number;
        start: { x: number; y: number };
        box: { x: number; y: number; width: number; height: number };
      }
    | undefined
  >(undefined);
  const [resizingKey, setResizingKey] = React.useState<string | undefined>(undefined);

  // Load the preview pages (from GroupDocs) and the persisted annotations (from CORMS) together.
  // CMS-024 — GroupDocs does not store annotations across sessions, so previously saved ones are
  // read from CORMS_Correspondence.AnnotationsJson (via the detail service), not from
  // /api/Annotation/get, and re-drawn over the plain preview pages.
  React.useEffect(() => {
    if (!documentUrl) {
      setPreviewImages(undefined);
      setPreviewLoading(false);
      return undefined;
    }
    let cancelled = false;
    setPreviewLoading(true);
    Promise.all([
      documentPreviewService.getPreviewImages(documentUrl).catch(() => undefined),
      correspondenceDetailService.getAnnotations(correspondenceId).catch(() => undefined),
    ])
      .then(([images, stored]) => {
        if (cancelled) return;
        setPreviewImages(images && images.length ? images : undefined);
        const existing = stored && !isAccessDenied(stored) ? stored : [];
        setAnnotations(existing.map((a) => ({ ...a, key: nextKey(), saved: true })));
      })
      .finally(() => {
        if (!cancelled) setPreviewLoading(false);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [documentPreviewService, correspondenceDetailService, documentUrl, correspondenceId]);

  const showLoader = attachmentsLoading || previewLoading;
  const hasServerPreview = !!previewImages && previewImages.length > 0;

  const naturalPoint = (
    img: HTMLImageElement,
    e: { clientX: number; clientY: number }
  ): { x: number; y: number } => {
    const rect = img.getBoundingClientRect();
    const scale = img.naturalWidth ? img.naturalWidth / rect.width : 1;
    return { x: (e.clientX - rect.left) * scale, y: (e.clientY - rect.top) * scale };
  };

  /** Common fields (author, timestamp) for every newly created annotation (AC7); the user-chosen
   * colours/width from the style bar are applied here so every new annotation adopts them. */
  const baseAnnotation = (): Omit<ILocalAnnotation, 'type' | 'pageNumber' | 'box'> => ({
    key: nextKey(),
    saved: false,
    opacity: 1,
    fontFamily: 'Arial',
    fontSize: style.fontSize,
    angle: 0,
    message: '',
    text: '',
    creatorName: authorName,
    createdOn: new Date().toISOString(),
    penColor: style.penColor,
    backgroundColor: style.backgroundColor,
    fontColor: style.fontColor,
    penWidth: style.penWidth,
  });

  const handlePageClick = (pageIndex: number, e: React.MouseEvent<HTMLImageElement>): void => {
    if (activeTool === 'eraser' || activeTool === 'pen') return; // eraser/pen don't click-place
    const tool = ANNOTATION_TOOLS.find((tl) => tl.id === activeTool);
    if (!tool) return;
    const p = naturalPoint(e.currentTarget, e);
    const isNote = tool.renderKind === 'note';
    const w = isNote ? NOTE_W : SHAPE_W;
    const h = isNote ? NOTE_H : SHAPE_H;
    const base = baseAnnotation();
    const annotation: ILocalAnnotation = {
      ...base,
      type: tool.apiType,
      pageNumber: pageIndex, // GroupDocs.Annotation page numbers are 0-based (0 = first page)
      box: { x: Math.max(0, p.x - w / 2), y: Math.max(0, p.y - h / 2), width: w, height: h },
      // Per-tool opacity keeps highlights translucent and shapes see-through; the fill colour itself
      // comes from the user's chosen style (base), so a highlight is a translucent version of it.
      opacity: tool.renderKind === 'highlight' ? 0.4 : isNote ? 1 : 0.35,
    };
    setAnnotations((prev) => [...prev, annotation]);
    setSelectedKey(base.key);
    if (isNote) setTextDraft({ key: base.key });
  };

  // Freehand pen — pointer down/move/up capture a stroke (natural-pixel points) into a Polyline.
  const handlePenDown = (pageIndex: number, e: React.PointerEvent<HTMLImageElement>): void => {
    if (activeTool !== 'pen') return;
    e.currentTarget.setPointerCapture(e.pointerId);
    setPenDraft({ pageIndex, points: [naturalPoint(e.currentTarget, e)] });
  };
  const handlePenMove = (pageIndex: number, e: React.PointerEvent<HTMLImageElement>): void => {
    if (activeTool !== 'pen' || !penDraft || penDraft.pageIndex !== pageIndex) return;
    const p = naturalPoint(e.currentTarget, e);
    setPenDraft((prev) => (prev ? { ...prev, points: [...prev.points, p] } : prev));
  };
  const handlePenUp = (pageIndex: number): void => {
    if (activeTool !== 'pen' || !penDraft || penDraft.pageIndex !== pageIndex) return;
    const points = penDraft.points;
    setPenDraft(undefined);
    if (points.length < 2) return;
    const base = baseAnnotation();
    setAnnotations((prev) => [
      ...prev,
      {
        ...base,
        type: 'Polyline',
        pageNumber: pageIndex,
        box: boundingBox(points),
        points,
        opacity: 1,
      },
    ]);
    setSelectedKey(base.key);
  };

  const updateAnnotationText = (key: string, value: string): void =>
    setAnnotations((prev) => prev.map((a) => (a.key === key ? { ...a, text: value, message: value } : a)));

  const beginResize = (
    annotation: ILocalAnnotation,
    pageIndex: number,
    e: React.PointerEvent<HTMLSpanElement>
  ): void => {
    const image = pageImageRefs.current[pageIndex];
    if (!annotation.box || !image) return;
    e.preventDefault();
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    resizeState.current = {
      key: annotation.key,
      pageIndex,
      pointerId: e.pointerId,
      start: naturalPoint(image, e),
      box: annotation.box,
    };
    setSelectedKey(annotation.key);
    setResizingKey(annotation.key);
  };

  const continueResize = (e: React.PointerEvent<HTMLSpanElement>): void => {
    const resize = resizeState.current;
    if (!resize || resize.pointerId !== e.pointerId) return;
    const image = pageImageRefs.current[resize.pageIndex];
    const dims = pageDims[resize.pageIndex];
    if (!image || !dims) return;
    e.preventDefault();
    const current = naturalPoint(image, e);
    const box = resizeAnnotationBox(resize.box, current.x - resize.start.x, current.y - resize.start.y, dims);
    setAnnotations((prev) => prev.map((a) => (a.key === resize.key ? { ...a, box, saved: false } : a)));
  };

  const finishResize = (e: React.PointerEvent<HTMLSpanElement>): void => {
    if (resizeState.current?.pointerId !== e.pointerId) return;
    e.preventDefault();
    resizeState.current = undefined;
    setResizingKey(undefined);
  };

  // CMS-024 — CORMS_Correspondence.AnnotationsJson is the source of truth (RecordsHub does not store
  // annotations), so a destructive change to the *persisted* set is written straight back. Only the
  // already-saved annotations are persisted — in-progress unsaved drafts stay local until Save.
  const removeAnnotation = (item: ILocalAnnotation): void => {
    const next = annotations.filter((a) => a.key !== item.key);
    setAnnotations(next);
    if (selectedKey === item.key) setSelectedKey(undefined);
    if (item.saved) {
      correspondenceDetailService
        .saveAnnotations(
          correspondenceId,
          next.filter((a) => a.saved)
        )
        .catch(() => undefined);
      onAudit?.('Annotation Removed', `Removed a ${item.type} annotation`);
    }
  };

  const clearAll = (): void => {
    const savedCount = annotations.filter((a) => a.saved).length;
    setAnnotations([]);
    setSelectedKey(undefined);
    if (savedCount > 0) {
      correspondenceDetailService.saveAnnotations(correspondenceId, []).catch(() => undefined);
      onAudit?.('Annotations Cleared', `Cleared ${savedCount} annotation(s)`);
    }
  };

  /** Style bar change: always update the default style for the next annotation; when one is
   * selected, also update its visual style in place (marked unsaved so an explicit Save persists it). */
  const handleStyleChange = (patch: Partial<IAnnotationStyle>): void => {
    setStyle((prev) => ({ ...prev, ...patch }));
    if (!selectedKey) return;
    setAnnotations((prev) =>
      prev.map((a) =>
        a.key === selectedKey
          ? { ...applyAnnotationStyle(a, { ...styleFromAnnotation(a, style), ...patch }), saved: false }
          : a
      )
    );
  };

  // The style bar shows the selected annotation's own style when one is selected, otherwise the
  // new-annotation default.
  const selectedAnnotation = selectedKey ? annotations.find((a) => a.key === selectedKey) : undefined;
  const activeStyle = selectedAnnotation ? styleFromAnnotation(selectedAnnotation, style) : style;

  const requestSave = (): void => {
    if (!saving) setCommentModalOpen(true);
  };

  const handleSave = (): void => {
    if (!documentUrl) return;
    const comment = saveComment.trim();
    if (!comment) return;
    // The saving state is shown for at least MIN_SAVING_DISPLAY_MS from the click so the loader is
    // always perceptible — otherwise a fast persist (or the "nothing changed" path below) would
    // close the modal before the user ever registers that a save happened.
    // Flip to the saving state and let React paint the spinner FIRST, then start the persist work
    // on the next macrotask. Serialising/persisting annotations can briefly block the main thread,
    // and if it ran synchronously here the browser would never paint the overlay before the work
    // finished — the exact "loader never appears" symptom. The saving state is also held for at
    // least MIN_SAVING_DISPLAY_MS so a fast persist (or the "nothing changed" path) can't flash by.
    setSaving(true);
    setError(undefined);
    const startedAt = Date.now();
    const settle = (onDone: () => void): void => {
      const remaining = Math.max(0, MIN_SAVING_DISPLAY_MS - (Date.now() - startedAt));
      window.setTimeout(() => {
        setSaving(false);
        onDone();
      }, remaining);
    };
    const succeed = (): void => {
      onSave(comment);
      setCommentModalOpen(false);
      setSaveComment('');
    };

    window.setTimeout(() => {
      // We resend every annotation — already-saved ones included — so the persisted set is always
      // the full picture (GroupDocs /add replaces rather than appends, and CORMS stores the whole
      // set too). When there are no unsaved changes there is nothing to persist, but we still show
      // the loader briefly and record the comment so the Save action always gives visible feedback.
      if (!annotations.some((a) => !a.saved)) {
        settle(succeed);
        return;
      }
      // Strip the local-only bookkeeping fields (key/saved) before sending the API payload.
      const toAdd: IAnnotationItem[] = annotations.map((a) => {
        const payload = { ...a } as Partial<ILocalAnnotation>;
        delete payload.key;
        delete payload.saved;
        return payload as IAnnotationItem;
      });
      // CMS-024 — create the annotations on GroupDocs and read the canonical set back, then persist
      // THAT into CORMS_Correspondence.AnnotationsJson (RecordsHub does not store annotations
      // itself). When GroupDocs isn't configured (undefined), still persist what the user drew so
      // annotations survive regardless. The persisted set becomes the new saved state.
      documentPreviewService
        .addAndReadBackAnnotations(documentUrl, toAdd)
        .then((canonical) => {
          const persisted = canonical ?? toAdd;
          return correspondenceDetailService
            .saveAnnotations(correspondenceId, persisted)
            .then((result) => ({ persisted, result }));
        })
        .then(({ persisted, result }) => {
          if (isAccessDenied(result)) {
            setError(t('correspondenceDetail.annotate.saveFailed'));
            settle(() => undefined);
            return;
          }
          setAnnotations(persisted.map((a) => ({ ...a, key: nextKey(), saved: true })));
          settle(succeed);
        })
        .catch(() => {
          setError(t('correspondenceDetail.annotate.saveFailed'));
          settle(() => undefined);
        });
    }, 0);
  };

  if (showLoader) {
    return (
      <div className={styles.loading}>
        <Spinner />
        <div className={styles.loadingTitle}>{t('correspondenceDetail.annotate.initializing')}</div>
        <div className={styles.loadingSubtitle}>{t('correspondenceDetail.annotate.establishingSession')}</div>
      </div>
    );
  }

  const annotationsForPage = (pageIndex: number): ILocalAnnotation[] =>
    annotations.filter((a) => (a.pageNumber ?? 0) === pageIndex);

  const attributionTitle = (a: ILocalAnnotation): string | undefined =>
    a.creatorName
      ? t('correspondenceDetail.annotate.attribution', {
          author: a.creatorName,
          date: (a.createdOn ?? '').slice(0, 10),
        })
      : undefined;

  const renderRemove = (a: ILocalAnnotation): React.ReactNode => (
    <button
      type="button"
      className={styles.annRemove}
      title={t('correspondenceDetail.annotate.remove')}
      onClick={(e) => {
        e.stopPropagation();
        removeAnnotation(a);
      }}
    >
      <Icon name="x" size={11} />
    </button>
  );

  const renderShape = (
    a: ILocalAnnotation,
    pageIndex: number,
    dims: { w: number; h: number }
  ): React.ReactNode => {
    const kind = renderKindForType(a.type);
    const box = a.box ?? { x: 0, y: 0, width: NOTE_W, height: NOTE_H };
    const pct = (v: number, total: number): string => `${(v / total) * 100}%`;

    // Freehand pen: an SVG polyline spanning the page, in natural-pixel viewBox coordinates.
    if (kind === 'polyline' && a.points && a.points.length > 1) {
      return (
        <svg
          key={a.key}
          className={`${styles.penSvg} ${selectedKey === a.key ? styles.annSelected : ''}`}
          viewBox={`0 0 ${dims.w} ${dims.h}`}
          preserveAspectRatio="none"
          onClick={(e) => {
            e.stopPropagation();
            if (activeTool === 'eraser') removeAnnotation(a);
            else setSelectedKey(a.key);
          }}
        >
          <title>{attributionTitle(a)}</title>
          <polyline
            points={a.points.map((p) => `${p.x},${p.y}`).join(' ')}
            fill="none"
            stroke={a.penColor ?? '#E0A000'}
            strokeWidth={a.penWidth ?? 2}
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        </svg>
      );
    }

    const style: React.CSSProperties = {
      left: pct(box.x, dims.w),
      top: pct(box.y, dims.h),
      width: pct(box.width, dims.w),
      height: pct(box.height, dims.h),
    };
    const onShapeClick = (e: React.MouseEvent): void => {
      e.stopPropagation();
      if (activeTool === 'eraser') {
        removeAnnotation(a);
        return;
      }
      // Select the annotation so the style bar re-colours it; notes also open their text editor.
      setSelectedKey(a.key);
      if (kind === 'note') setTextDraft({ key: a.key });
    };
    const renderResizeHandle = (): React.ReactNode =>
      selectedKey === a.key &&
      canResizeAnnotation(a) && (
        <span
          className={`${styles.resizeHandle} ${resizingKey === a.key ? styles.resizeHandleActive : ''}`}
          title={t('correspondenceDetail.annotate.resize')}
          aria-hidden="true"
          onPointerDown={(e) => beginResize(a, pageIndex, e)}
          onPointerMove={continueResize}
          onPointerUp={finishResize}
          onPointerCancel={finishResize}
          onClick={(e) => e.stopPropagation()}
        />
      );

    // Arrow: an SVG line with an arrowhead, drawn corner-to-corner of its box.
    if (kind === 'arrow') {
      return (
        <div
          key={a.key}
          className={`${styles.shapeBox} ${selectedKey === a.key ? styles.annSelected : ''}`}
          style={style}
          title={attributionTitle(a)}
          onClick={onShapeClick}
        >
          <svg className={styles.arrowSvg} viewBox="0 0 100 100" preserveAspectRatio="none">
            <defs>
              <marker id={`ah-${a.key}`} markerWidth="10" markerHeight="10" refX="7" refY="5" orient="auto">
                <path d="M0,0 L10,5 L0,10 z" fill={a.penColor ?? '#E0A000'} />
              </marker>
            </defs>
            <line
              x1="4"
              y1="4"
              x2="92"
              y2="92"
              stroke={a.penColor ?? '#E0A000'}
              strokeWidth="3"
              markerEnd={`url(#ah-${a.key})`}
            />
          </svg>
          {renderRemove(a)}
          {renderResizeHandle()}
        </div>
      );
    }

    // Note / sticky (editable), highlight, ellipse, area — a positioned box with kind-specific style.
    const boxClass =
      kind === 'note'
        ? styles.noteBox
        : kind === 'highlight'
          ? styles.highlightBox
          : kind === 'ellipse'
            ? styles.ellipseBox
            : styles.areaBox;
    // Note text uses the annotation's own font colour/size (both user-configurable via the style bar).
    const noteTextStyle: React.CSSProperties = {
      color: a.fontColor ?? undefined,
      fontSize: a.fontSize ? `${a.fontSize}px` : undefined,
    };
    return (
      <div
        key={a.key}
        className={`${boxClass} ${selectedKey === a.key ? styles.annSelected : ''}`}
        style={{ ...style, background: a.backgroundColor ?? undefined, opacity: a.opacity ?? 1 }}
        title={attributionTitle(a)}
        onClick={onShapeClick}
      >
        {kind === 'note' && (
          <div className={styles.noteContent}>
            {textDraft?.key === a.key ? (
              <input
                autoFocus
                className={styles.noteInput}
                style={noteTextStyle}
                value={a.text ?? ''}
                placeholder={t('correspondenceDetail.annotate.notePlaceholder')}
                onClick={(e) => e.stopPropagation()}
                onChange={(e) => updateAnnotationText(a.key, e.target.value)}
                onBlur={() => setTextDraft(undefined)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === 'Escape') setTextDraft(undefined);
                }}
              />
            ) : (
              <span className={styles.noteText} style={noteTextStyle}>
                {a.text || t('correspondenceDetail.annotate.emptyNote')}
              </span>
            )}
          </div>
        )}
        {renderRemove(a)}
        {renderResizeHandle()}
      </div>
    );
  };

  return (
    <div className={styles.tab}>
      <div className={styles.header}>
        <span className={styles.headerTitle}>
          {t('correspondenceDetail.annotate.title')}
          {annotations.length > 0 && <span className={styles.count}> · {annotations.length}</span>}
        </span>
        <div className={styles.headerActions}>
          {annotations.length > 0 && (
            <button type="button" className={styles.clearBtn} onClick={clearAll}>
              {t('correspondenceDetail.annotate.clearAll')}
            </button>
          )}
          <Button
            variant="primary"
            onClick={requestSave}
            text={t('correspondenceDetail.annotate.saveAnnotations')}
            disabled={saving}
          />
        </div>
      </div>
      <div className={styles.toolbar}>
        {ANNOTATION_TOOLS.map((tool) => (
          <button
            key={tool.id}
            type="button"
            className={activeTool === tool.id ? `${styles.toolBtn} ${styles.toolBtnActive}` : styles.toolBtn}
            onClick={() => setActiveTool(tool.id)}
            title={t(tool.labelKey)}
            aria-label={t(tool.labelKey)}
          >
            <Icon name={tool.iconName} size={16} />
          </button>
        ))}
        {error && <span className={styles.toolbarError}>{error}</span>}
      </div>
      <AnnotationStyleBar
        style={activeStyle}
        onChange={handleStyleChange}
        editingSelection={!!selectedAnnotation}
        showFontSize={
          selectedAnnotation
            ? isEditableNote(selectedAnnotation.type)
            : activeTool === 'text' || activeTool === 'sticky'
        }
      />
      <Modal
        isOpen={commentModalOpen}
        onDismiss={() => !saving && setCommentModalOpen(false)}
        title={t('correspondenceDetail.annotate.saveCommentTitle')}
        footer={
          <>
            <Button
              variant="default"
              onClick={() => setCommentModalOpen(false)}
              text={t('common.cancel')}
              disabled={saving}
            />
            <Button
              variant="primary"
              onClick={handleSave}
              text={saving ? t('correspondenceDetail.annotate.saving') : t('common.save')}
              disabled={saving || !saveComment.trim()}
            />
          </>
        }
      >
        {saving ? (
          // Prominent, unmistakable saving state — replaces the whole form so the user clearly sees
          // the save is in progress rather than a small inline spinner that's easy to miss.
          <div className={styles.savingState} role="status" aria-live="polite">
            <span className={styles.savingSpinner} aria-hidden="true" />
            <span className={styles.savingLabel}>{t('correspondenceDetail.annotate.saving')}</span>
          </div>
        ) : (
          <div className={styles.commentField}>
            <label className={styles.commentLabel} htmlFor="annotation-save-comment">
              {t('correspondenceDetail.annotate.saveCommentLabel')}
              <span className={styles.commentRequired} aria-hidden="true">
                *
              </span>
            </label>
            <textarea
              id="annotation-save-comment"
              className={styles.commentTextarea}
              value={saveComment}
              onChange={(event) => setSaveComment(event.target.value)}
              placeholder={t('correspondenceDetail.annotate.saveCommentPlaceholder')}
              rows={4}
              autoFocus
            />
            <span className={styles.commentHint}>{t('correspondenceDetail.annotate.saveCommentHint')}</span>
          </div>
        )}
      </Modal>
      <div className={styles.canvas}>
        {hasServerPreview ? (
          <div className={styles.pages}>
            {previewImages!.map((src, index) => {
              const dims = pageDims[index];
              return (
                <div key={index} className={styles.pageWrap}>
                  <img
                    className={`${styles.page} ${activeTool !== 'eraser' ? styles.pagePlacing : ''}`}
                    src={src}
                    alt={`${t('correspondenceDetail.preview.page')} ${index + 1}`}
                    draggable={false}
                    ref={(element) => {
                      pageImageRefs.current[index] = element;
                    }}
                    onLoad={(e) => {
                      const w = e.currentTarget.naturalWidth;
                      const h = e.currentTarget.naturalHeight;
                      setPageDims((prev) => ({ ...prev, [index]: { w, h } }));
                    }}
                    onClick={(e) => handlePageClick(index, e)}
                    onPointerDown={(e) => handlePenDown(index, e)}
                    onPointerMove={(e) => handlePenMove(index, e)}
                    onPointerUp={() => handlePenUp(index)}
                  />
                  {dims && annotationsForPage(index).map((a) => renderShape(a, index, dims))}
                  {dims && penDraft && penDraft.pageIndex === index && penDraft.points.length > 1 && (
                    <svg
                      className={styles.penSvg}
                      viewBox={`0 0 ${dims.w} ${dims.h}`}
                      preserveAspectRatio="none"
                    >
                      <polyline
                        points={penDraft.points.map((p) => `${p.x},${p.y}`).join(' ')}
                        fill="none"
                        stroke="#E0A000"
                        strokeWidth={2}
                        strokeLinejoin="round"
                        strokeLinecap="round"
                      />
                    </svg>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <div className={styles.canvasHint}>{t('correspondenceDetail.annotate.canvasHint')}</div>
        )}
      </div>
    </div>
  );
};
