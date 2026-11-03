/**
 * Types for the GroupDoc API (viewdoc / Watermark / Annotation), mirroring the service's Swagger
 * schemas. Shared by the DocumentPreviewService transport and the Preview / Annotate tabs.
 */

/** A watermark to burn into the rendered preview (Swagger: WatermarkItem). */
export interface IWatermarkItem {
  type: string; // required — 'text' | 'image'
  text?: string;
  imageContent?: string;
  fontFamily?: string;
  fontSize?: number;
  foregroundColor?: string;
  opacity?: number;
  rotateAngle?: number;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  isBackground?: boolean;
  horizontalAlignment?: string;
  verticalAlignment?: string;
}

/** Annotation bounding box in the page's rendered-pixel space (Swagger: AnnotationBox). */
export interface IAnnotationBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** One annotation (Swagger: AnnotationItem). `id` is present on annotations read back from the
 * service (used by remove); it isn't part of the add payload. */
export interface IAnnotationItem {
  id?: number;
  type: string; // required — 'Area' | 'Point' | 'Ellipse' | 'Arrow' | 'Polyline' | 'TextHighlight' | …
  pageNumber?: number;
  message?: string;
  box?: IAnnotationBox;
  opacity?: number;
  penColor?: string;
  penWidth?: number;
  backgroundColor?: string;
  text?: string;
  fontFamily?: string;
  fontSize?: number;
  fontColor?: string;
  angle?: number;
  /** CMS-024 AC7 — the authoring user and the moment the annotation was created; carried on the
   * payload so the GroupDocs store attributes each annotation. Present on annotations read back too. */
  creatorName?: string;
  createdOn?: string;
  /** CMS-024 — vertices of a freehand pen (Polyline) stroke, in the page's natural-pixel space.
   * Local geometry: serialized to/from `svgPath` on the wire (the model's polyline geometry). */
  points?: { x: number; y: number }[];
  /** CMS-024 — GroupDocs polyline geometry (`M x,y L x,y …`), the on-wire form of `points`. */
  svgPath?: string;
}
