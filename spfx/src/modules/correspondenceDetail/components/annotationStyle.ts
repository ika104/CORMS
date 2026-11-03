/**
 * CMS — annotation styling (colours + line width) for the Annotate tab. Kept as a pure, testable
 * module separate from the React tab: the GroupDocs Annotation API already accepts `penColor`,
 * `backgroundColor`, `fontColor` and `penWidth` on every AnnotationItem, so styling is purely a
 * matter of letting the user choose these values and copying them onto the annotation payload.
 */
import { IAnnotationItem } from '../../../models/IGroupDocs';

/** The user-editable colour/width style applied to annotations. A subset of IAnnotationItem — the
 * exact fields the GroupDocs Annotation API consumes for appearance. */
export interface IAnnotationStyle {
  /** Stroke colour — pen/arrow line, shape border (API `penColor`). */
  penColor: string;
  /** Fill colour — highlight/area/ellipse/sticky-note background (API `backgroundColor`). */
  backgroundColor: string;
  /** Text colour — the text of a text field / sticky note (API `fontColor`). */
  fontColor: string;
  /** Stroke width in pixels (API `penWidth`). */
  penWidth: number;
  /** Text size in pixels (API `fontSize`). Used by text fields and sticky notes. */
  fontSize: number;
}

/** The default appearance a fresh annotation is created with (the amber theme used before styling
 * was user-configurable). */
export const DEFAULT_ANNOTATION_STYLE: IAnnotationStyle = {
  penColor: '#E0A000',
  backgroundColor: '#FFF6BF',
  fontColor: '#5C4600',
  penWidth: 2,
  fontSize: 12,
};

/** Curated, high-contrast swatches offered as quick colour picks in the style bar (any colour is
 * still reachable via the native colour input). */
export const ANNOTATION_COLOR_SWATCHES: readonly string[] = [
  '#E0A000', // amber
  '#E53935', // red
  '#8E24AA', // purple
  '#1E88E5', // blue
  '#43A047', // green
  '#00897B', // teal
  '#000000', // black
  '#FFFFFF', // white
];

/** Selectable stroke widths (px). */
export const ANNOTATION_PEN_WIDTHS: readonly number[] = [1, 2, 3, 5, 8];

/** Text sizes offered in the annotation toolbar. */
export const ANNOTATION_FONT_SIZES: readonly number[] = [8, 10, 12, 14, 16, 18, 20, 24, 28, 32, 36, 48];

/** Normalises a colour to a lower-case 6-digit hex string, or returns the fallback for anything
 * that is not a #rgb / #rrggbb value (a native colour input only ever emits valid hex, but stored
 * annotations read back from the API may carry other/absent values). */
export function normalizeHexColor(value: string | undefined, fallback: string): string {
  const v = (value ?? '').trim();
  if (/^#[0-9a-fA-F]{6}$/.test(v)) return v.toLowerCase();
  if (/^#[0-9a-fA-F]{3}$/.test(v)) {
    const [r, g, b] = [v[1], v[2], v[3]];
    return `#${r}${r}${g}${g}${b}${b}`.toLowerCase();
  }
  return fallback;
}

/** Clamps a chosen pen width into the supported range. */
export function clampPenWidth(width: number | undefined): number {
  const w = Number(width);
  if (!Number.isFinite(w)) return DEFAULT_ANNOTATION_STYLE.penWidth;
  return Math.min(20, Math.max(1, Math.round(w)));
}

/** Clamps text size into a legible range accepted by the annotation API. */
export function clampFontSize(size: number | undefined): number {
  const value = Number(size);
  if (!Number.isFinite(value)) return DEFAULT_ANNOTATION_STYLE.fontSize;
  return Math.min(72, Math.max(8, Math.round(value)));
}

/** Reads the editable style fields off an annotation (used to seed the style bar when an existing
 * annotation is selected for re-colouring), falling back to `fallback` for absent fields. */
export function styleFromAnnotation(
  annotation: IAnnotationItem,
  fallback: IAnnotationStyle = DEFAULT_ANNOTATION_STYLE
): IAnnotationStyle {
  return {
    penColor: normalizeHexColor(annotation.penColor, fallback.penColor),
    backgroundColor: normalizeHexColor(annotation.backgroundColor, fallback.backgroundColor),
    fontColor: normalizeHexColor(annotation.fontColor, fallback.fontColor),
    penWidth: clampPenWidth(annotation.penWidth ?? fallback.penWidth),
    fontSize: clampFontSize(annotation.fontSize ?? fallback.fontSize),
  };
}

/** Returns a copy of the annotation with the style's colour/width fields applied — used both when
 * creating a new annotation and when re-colouring an existing one. */
export function applyAnnotationStyle<T extends IAnnotationItem>(annotation: T, style: IAnnotationStyle): T {
  return {
    ...annotation,
    penColor: style.penColor,
    backgroundColor: style.backgroundColor,
    fontColor: style.fontColor,
    penWidth: style.penWidth,
    fontSize: style.fontSize,
  };
}
