import * as React from 'react';
import { useTranslation } from 'react-i18next';
import {
  ANNOTATION_COLOR_SWATCHES,
  ANNOTATION_FONT_SIZES,
  ANNOTATION_PEN_WIDTHS,
  IAnnotationStyle,
  clampFontSize,
  clampPenWidth,
  normalizeHexColor,
} from './annotationStyle';
import styles from './AnnotationStyleBar.module.scss';

export interface IAnnotationStyleBarProps {
  /** The style currently in effect — the new-annotation style, or the selected annotation's style. */
  style: IAnnotationStyle;
  /** Emits the changed field(s); the parent updates the new-annotation style and, when an annotation
   * is selected, that annotation too. */
  onChange: (patch: Partial<IAnnotationStyle>) => void;
  /** True when the controls are editing a currently-selected annotation (vs the new-annotation
   * default) — surfaced as a hint so the user understands what a change will affect. */
  editingSelection?: boolean;
  /** Show font size only when the active or selected tool produces editable note text. */
  showFontSize?: boolean;
}

interface IColorControlProps {
  label: string;
  value: string;
  onChange: (color: string) => void;
}

/** One labelled colour control: a native colour input plus quick-pick swatches. */
const ColorControl: React.FC<IColorControlProps> = ({ label, value, onChange }) => {
  const current = normalizeHexColor(value, '#000000');
  return (
    <div className={styles.control}>
      <span className={styles.label}>{label}</span>
      <div className={styles.colorRow}>
        <label className={styles.colorWell} style={{ background: current }} title={label}>
          <input
            type="color"
            className={styles.colorInput}
            value={current}
            onChange={(e) => onChange(e.target.value)}
            aria-label={label}
          />
        </label>
        <div className={styles.swatches}>
          {ANNOTATION_COLOR_SWATCHES.map((swatch) => {
            const isActive = normalizeHexColor(swatch, '') === current;
            return (
              <button
                key={swatch}
                type="button"
                className={`${styles.swatch} ${isActive ? styles.swatchActive : ''}`}
                style={{ background: swatch }}
                onClick={() => onChange(swatch)}
                aria-label={swatch}
                aria-pressed={isActive}
                title={swatch}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
};

/**
 * The Annotate tab's styling controls — stroke / fill / text colour, line width and, for notes,
 * text size. Applies to the next annotation drawn, or (when one is selected) restyles it in place.
 * Purely presentational: all state lives in the parent tab; the pure helpers/palette live in
 * annotationStyle.ts.
 */
export const AnnotationStyleBar: React.FC<IAnnotationStyleBarProps> = ({
  style,
  onChange,
  editingSelection,
  showFontSize = false,
}) => {
  const { t } = useTranslation();
  return (
    <div className={styles.bar} role="group" aria-label={t('correspondenceDetail.annotate.style.group')}>
      <ColorControl
        label={t('correspondenceDetail.annotate.style.stroke')}
        value={style.penColor}
        onChange={(penColor) => onChange({ penColor })}
      />
      <ColorControl
        label={t('correspondenceDetail.annotate.style.fill')}
        value={style.backgroundColor}
        onChange={(backgroundColor) => onChange({ backgroundColor })}
      />
      <ColorControl
        label={t('correspondenceDetail.annotate.style.text')}
        value={style.fontColor}
        onChange={(fontColor) => onChange({ fontColor })}
      />
      <div className={styles.control}>
        <span className={styles.label}>{t('correspondenceDetail.annotate.style.width')}</span>
        <select
          className={styles.widthSelect}
          value={clampPenWidth(style.penWidth)}
          onChange={(e) => onChange({ penWidth: clampPenWidth(Number(e.target.value)) })}
          aria-label={t('correspondenceDetail.annotate.style.width')}
        >
          {ANNOTATION_PEN_WIDTHS.map((w) => (
            <option key={w} value={w}>
              {t('correspondenceDetail.annotate.style.widthValue', { width: w })}
            </option>
          ))}
        </select>
      </div>
      {showFontSize && (
        <div className={styles.control}>
          <span className={styles.label}>{t('correspondenceDetail.annotate.style.fontSize')}</span>
          <select
            className={styles.widthSelect}
            value={clampFontSize(style.fontSize)}
            onChange={(e) => onChange({ fontSize: clampFontSize(Number(e.target.value)) })}
            aria-label={t('correspondenceDetail.annotate.style.fontSize')}
          >
            {ANNOTATION_FONT_SIZES.map((size) => (
              <option key={size} value={size}>
                {t('correspondenceDetail.annotate.style.fontSizeValue', { size })}
              </option>
            ))}
          </select>
        </div>
      )}
      {editingSelection && (
        <span className={styles.selectionHint}>
          {t('correspondenceDetail.annotate.style.editingSelection')}
        </span>
      )}
    </div>
  );
};
