import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronLeft, ChevronRight, Move } from 'lucide-react';
import { ISignaturePlacement } from '../state/types';
import { placementsOverlap } from '../../../utils/signaturePlacement';
import styles from './SignaturePlacementCanvas.module.scss';

export interface ISignaturePlacementCanvasProps {
  placement: ISignaturePlacement;
  /** Emits the new placement as the box is dragged/resized or the page changes. The caller clamps
   * (useCreateCorrespondenceForm.setStepSignaturePlacement) so the box always stays on the page. */
  onChange: (placement: ISignaturePlacement) => void;
  /** Other signers' boxes, drawn faintly on their page so this one can be placed clear of them. */
  otherSignatures?: Array<{ label: string; placement: ISignaturePlacement }>;
}

type DragMode = 'move' | 'resize';

// CMS-006 AC16 — a draggable, resizable signature box on a page canvas. The box position/size are
// percentages of the page, so they survive whatever pixel size the real document renders at; the
// chosen page is a simple stepper (the authored document's true page count isn't known in the
// builder). Pointer-based so it works with mouse, pen and touch; arrow keys nudge for accessibility.
export const SignaturePlacementCanvas: React.FC<ISignaturePlacementCanvasProps> = ({
  placement,
  onChange,
  otherSignatures = [],
}) => {
  const { t } = useTranslation();
  const canvasRef = React.useRef<HTMLDivElement>(null);
  // Keep the freshest placement/onChange for the window listeners a drag attaches, so a drag that
  // starts mid-render never writes against a stale value.
  const stateRef = React.useRef({ placement, onChange });
  stateRef.current = { placement, onChange };

  const startDrag = (mode: DragMode, e: React.PointerEvent): void => {
    e.preventDefault();
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const start = stateRef.current.placement;
    const startX = e.clientX;
    const startY = e.clientY;

    const onMove = (ev: PointerEvent): void => {
      const dxPct = ((ev.clientX - startX) / rect.width) * 100;
      const dyPct = ((ev.clientY - startY) / rect.height) * 100;
      if (mode === 'move') {
        stateRef.current.onChange({ ...start, x: start.x + dxPct, y: start.y + dyPct });
      } else {
        stateRef.current.onChange({ ...start, width: start.width + dxPct, height: start.height + dyPct });
      }
    };
    const onUp = (): void => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };

  const onBoxKeyDown = (e: React.KeyboardEvent): void => {
    const step = e.shiftKey ? 5 : 1;
    const nudges: Record<string, Partial<ISignaturePlacement>> = {
      ArrowLeft: { x: placement.x - step },
      ArrowRight: { x: placement.x + step },
      ArrowUp: { y: placement.y - step },
      ArrowDown: { y: placement.y + step },
    };
    const nudge = nudges[e.key];
    if (nudge) {
      e.preventDefault();
      onChange({ ...placement, ...nudge });
    }
  };

  const changePage = (delta: number): void =>
    onChange({ ...placement, page: Math.max(1, placement.page + delta) });

  return (
    <div className={styles.wrap}>
      <div className={styles.toolbar}>
        <span className={styles.hint}>{t('createCorrespondence.approval.signaturePlacementHint')}</span>
        <div className={styles.pager}>
          <button
            type="button"
            className={styles.pagerButton}
            onClick={() => changePage(-1)}
            disabled={placement.page <= 1}
            aria-label={t('createCorrespondence.approval.previousPage')}
          >
            <ChevronLeft size={14} />
          </button>
          <span className={styles.pagerLabel}>
            {t('createCorrespondence.approval.pageN', { page: placement.page })}
          </span>
          <button
            type="button"
            className={styles.pagerButton}
            onClick={() => changePage(1)}
            aria-label={t('createCorrespondence.approval.nextPage')}
          >
            <ChevronRight size={14} />
          </button>
        </div>
      </div>

      <div className={styles.canvas} ref={canvasRef}>
        {/* Faint guide lines to read as a document page. */}
        <div className={styles.pageLines} aria-hidden="true" />
        {otherSignatures
          .filter((other) => other.placement.page === placement.page)
          .map((other, i) => (
            <div
              key={i}
              className={styles.otherSignatureBox}
              aria-hidden="true"
              style={{
                left: `${other.placement.x}%`,
                top: `${other.placement.y}%`,
                width: `${other.placement.width}%`,
                height: `${other.placement.height}%`,
              }}
            >
              {other.label}
            </div>
          ))}
        <div
          className={`${styles.signatureBox} ${
            otherSignatures.some((other) => placementsOverlap(placement, other.placement))
              ? styles.signatureBoxOverlap
              : ''
          }`}
          role="button"
          tabIndex={0}
          aria-label={t('createCorrespondence.approval.signatureBoxAria', {
            x: Math.round(placement.x),
            y: Math.round(placement.y),
          })}
          style={{
            left: `${placement.x}%`,
            top: `${placement.y}%`,
            width: `${placement.width}%`,
            height: `${placement.height}%`,
          }}
          onPointerDown={(e) => startDrag('move', e)}
          onKeyDown={onBoxKeyDown}
        >
          <span className={styles.signatureLabel}>
            <Move size={12} /> {t('createCorrespondence.approval.signatureHere')}
          </span>
          <span
            className={styles.resizeHandle}
            role="presentation"
            onPointerDown={(e) => {
              e.stopPropagation();
              startDrag('resize', e);
            }}
          />
        </div>
      </div>

      <div className={styles.readout}>
        {t('createCorrespondence.approval.signatureReadout', {
          page: placement.page,
          x: Math.round(placement.x),
          y: Math.round(placement.y),
          width: Math.round(placement.width),
          height: Math.round(placement.height),
        })}
      </div>
    </div>
  );
};
