/**
 * CMS-024 — the annotation toolset offered by the Annotate tab and the mapping from each tool to a
 * GroupDocs AnnotationType (Swagger). Kept as pure data + helpers, separate from the React tab, so
 * the tool set and the type/render mapping are unit-testable without rendering the document surface.
 *
 * AC3 requires: freehand pen, text, sticky note, highlight, rectangle, ellipse, arrow, and eraser.
 */

export type AnnotationToolId = 'pen' | 'text' | 'sticky' | 'highlight' | 'rect' | 'circle' | 'arrow' | 'eraser';

/** How an annotation is drawn on the page overlay — derived from its GroupDocs type so annotations
 * read back from the store render correctly too, not only the ones this session created. */
export type AnnotationRenderKind = 'note' | 'highlight' | 'area' | 'ellipse' | 'arrow' | 'polyline';

export interface IAnnotationTool {
  id: AnnotationToolId;
  labelKey: string;
  iconName: string;
  /** The GroupDocs AnnotationType this tool creates ('' for the eraser, which creates nothing). */
  apiType: string;
  renderKind: AnnotationRenderKind | 'eraser';
}

export const ANNOTATION_TOOLS: IAnnotationTool[] = [
  { id: 'pen', labelKey: 'correspondenceDetail.annotate.tool.pen', iconName: 'pen', apiType: 'Polyline', renderKind: 'polyline' },
  { id: 'text', labelKey: 'correspondenceDetail.annotate.tool.text', iconName: 'annotType', apiType: 'TextField', renderKind: 'note' },
  { id: 'sticky', labelKey: 'correspondenceDetail.annotate.tool.sticky', iconName: 'stickyNote', apiType: 'Point', renderKind: 'note' },
  // Highlight is an `Area` with a translucent fill, not `TextHighlight`: TextHighlight is a
  // text-markup type needing the underlying text's quad geometry, which the flat AnnotationItem
  // model (box only) can't carry, so it renders wrong. A translucent Area box is what the model
  // supports and reads visually as a highlight.
  { id: 'highlight', labelKey: 'correspondenceDetail.annotate.tool.highlight', iconName: 'highlighter', apiType: 'Area', renderKind: 'highlight' },
  { id: 'rect', labelKey: 'correspondenceDetail.annotate.tool.rect', iconName: 'square', apiType: 'Area', renderKind: 'area' },
  { id: 'circle', labelKey: 'correspondenceDetail.annotate.tool.circle', iconName: 'circle', apiType: 'Ellipse', renderKind: 'ellipse' },
  { id: 'arrow', labelKey: 'correspondenceDetail.annotate.tool.arrow', iconName: 'arrow', apiType: 'Arrow', renderKind: 'arrow' },
  { id: 'eraser', labelKey: 'correspondenceDetail.annotate.tool.eraser', iconName: 'eraser', apiType: '', renderKind: 'eraser' },
];

/** Maps a stored/created GroupDocs annotation type onto how it should be drawn. Case-insensitive and
 * defensive: an unrecognized type falls back to a plain area box rather than not rendering. */
export function renderKindForType(type: string | undefined): AnnotationRenderKind {
  const t = (type ?? '').toLowerCase();
  if (t.indexOf('polyline') !== -1 || t.indexOf('distance') !== -1) return 'polyline';
  if (t.indexOf('ellipse') !== -1) return 'ellipse';
  if (t.indexOf('arrow') !== -1) return 'arrow';
  if (t.indexOf('highlight') !== -1) return 'highlight';
  if (t.indexOf('point') !== -1 || t === 'text' || t.indexOf('textfield') !== -1) return 'note';
  return 'area';
}

/** A note-kind annotation carries an editable text/message (text tool, sticky note). Shapes
 * (area, ellipse, arrow, highlight, polyline) don't open a text editor. */
export function isEditableNote(type: string | undefined): boolean {
  return renderKindForType(type) === 'note';
}
