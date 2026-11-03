import { IAnnotationItem, IWatermarkItem } from '../../models/IGroupDocs';

/**
 * Pure request/response helpers for the GroupDoc API — endpoint URLs, the Graph share-URL encoding
 * the server downloads through, request bodies, and defensive response parsing. Kept free of any
 * network/browser dependency so they can be unit-tested; DocumentPreviewService is the thin fetch
 * wrapper around them.
 */

function base64Encode(value: string): string {
  // Unicode-safe base64 for both the SPFx browser (btoa) and Jest/Node (Buffer).
  if (typeof btoa === 'function') {
    return btoa(unescape(encodeURIComponent(value)));
  }
  return Buffer.from(value, 'utf-8').toString('base64');
}

/**
 * Converts an absolute SharePoint file URL into a Microsoft Graph `shares` content URL. The
 * GroupDoc server downloads the file via Graph (app-only), not by hitting the raw SharePoint URL.
 */
export function toGraphShareContentUrl(absoluteFileUrl: string): string {
  const encoded = `u!${base64Encode(absoluteFileUrl).replace(/=+$/, '').replace(/\//g, '_').replace(/\+/g, '-')}`;
  return `https://graph.microsoft.com/v1.0/shares/${encoded}/driveItem/content`;
}

/** Resolves a possibly server-relative file URL to the Graph-addressable filePath the API expects.
 * Already-Graph URLs pass through unchanged. `origin` is injected for testability. */
export function resolveApiFilePath(fileUrl: string, origin: string): string {
  const absolute = /^https?:\/\//i.test(fileUrl) ? fileUrl : `${origin}${fileUrl}`;
  return /graph\.microsoft\.com/i.test(absolute) ? absolute : toGraphShareContentUrl(absolute);
}

/**
 * Derives the GroupDoc API base (scheme + host[:port]) from the configured viewdoc URL, so the
 * Watermark / Annotation endpoints can be built from the one URL the admin configures. Strips
 * everything from `/api/` onward; falls back to the trimmed input if there's no `/api/` segment.
 */
export function groupDocsBaseUrl(viewerUrl: string): string {
  const idx = viewerUrl.toLowerCase().indexOf('/api/');
  return (idx !== -1 ? viewerUrl.slice(0, idx) : viewerUrl.replace(/\/+$/, '')).replace(/\/+$/, '');
}

export function annotationEndpoint(viewerUrl: string, action: 'get' | 'add' | 'remove'): string {
  return `${groupDocsBaseUrl(viewerUrl)}/api/Annotation/${action}`;
}

/** viewdoc body (Swagger: ViewDocs). `filePath` is case-insensitively bound by the server; sending
 * watermarks with includeWatermarks burns them into the returned page images. */
export function buildViewDocBody(filePath: string, watermarks?: IWatermarkItem[]): Record<string, unknown> {
  const hasWatermarks = !!watermarks && watermarks.length > 0;
  return {
    filePath,
    includeWatermarks: hasWatermarks,
    watermarks: hasWatermarks ? watermarks : [],
  };
}

/** 1×1 fully-transparent PNG. The server's model validation marks WatermarkItem.imageContent as
 * required even for text watermarks (contradicting the Swagger `nullable`), so a text watermark
 * must still carry a non-empty imageContent — this harmless transparent pixel satisfies it. */
const TRANSPARENT_PIXEL_PNG =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR4nGNgAAIAAAUAAen63NgAAAAASUVORK5CYII=';

/** A diagonal, semi-transparent text watermark (e.g. the security classification) centred on each
 * page — the burn-in equivalent of the old CSS overlay. */
export function buildTextWatermark(text: string): IWatermarkItem {
  return {
    type: 'text',
    text,
    imageContent: TRANSPARENT_PIXEL_PNG,
    fontFamily: 'Arial',
    fontSize: 48,
    foregroundColor: '#FF0000',
    opacity: 0.3,
    rotateAngle: -45,
    isBackground: false,
    horizontalAlignment: 'Center',
    verticalAlignment: 'Center',
  };
}

// CMS-051 AC2 — a repeating diagonal watermark. The GroupDocs WatermarkItem model has no native
// tile/repeat flag, so we emit one diagonal text item per cell of the 3×3 alignment grid
// (Left/Center/Right × Top/Center/Bottom). Anchoring by alignment (not absolute x/y pixels) keeps
// the pattern page-size-independent, so it covers the whole page whatever its rendered dimensions.
// Reduced opacity keeps the underlying document legible (AC2); each cell is rotated -45°.
const WATERMARK_H_ALIGN = ['Left', 'Center', 'Right'];
const WATERMARK_V_ALIGN = ['Top', 'Center', 'Bottom'];

// CMS-051 AC5 — on the ascending 1=Unclassified..5=Top Secret clearance scale, the confidentiality
// watermark is mandatory (cannot be toggled off) at Confidential and above: the item's classification
// does not permit removing its handling marking. Below this tier the watermark still defaults on for
// received items (AC1) but authorised viewers may toggle it off.
export const WATERMARK_MANDATORY_TIER = 3;

/** The correspondence preview always starts with the confidentiality watermark enabled. Whether
 * the viewer can change that preference is an administrator permission handled by PreviewTab. */
export function watermarkOnByDefault(_direction: string): boolean {
  // Watermarking is the safe default for every document. Permission controls whether an
  // administrator may change the preference; direction must never weaken confidentiality.
  return true;
}

/** CMS-051 AC5 — true when the item's classification requires the watermark and forbids toggling it
 * off (a classified received item). */
export function isWatermarkMandatory(direction: string, securityTier: number): boolean {
  return direction === 'Incoming' && securityTier >= WATERMARK_MANDATORY_TIER;
}

export function buildRepeatingTextWatermarks(text: string): IWatermarkItem[] {
  const items: IWatermarkItem[] = [];
  WATERMARK_V_ALIGN.forEach((verticalAlignment) => {
    WATERMARK_H_ALIGN.forEach((horizontalAlignment) => {
      items.push({
        type: 'text',
        text,
        imageContent: TRANSPARENT_PIXEL_PNG,
        fontFamily: 'Arial',
        fontSize: 36,
        foregroundColor: '#FF0000',
        opacity: 0.22,
        rotateAngle: -45,
        isBackground: false,
        horizontalAlignment,
        verticalAlignment,
      });
    });
  });
  return items;
}

export function buildGetAnnotationsBody(filePath: string): Record<string, unknown> {
  return { filePath };
}

// The exact fields the AnnotationItem swagger model accepts on /api/Annotation/add. Anything else
// (our local-only `key`/`saved`, the read-back `id`, or client extras like `points`/`creatorName`/
// `createdOn` that the model has no slot for) is stripped: the server's strict model binding can
// reject an annotation — or the whole array — when it carries members it doesn't recognise.
const API_ANNOTATION_FIELDS: (keyof IAnnotationItem)[] = [
  'type',
  'pageNumber',
  'message',
  'box',
  'opacity',
  'penColor',
  'penWidth',
  'backgroundColor',
  'text',
  'fontFamily',
  'fontSize',
  'fontColor',
  'angle',
];

/** True for the freehand/polyline family, whose shape is a point path rather than just a box. */
function isPolylineType(type: string | undefined): boolean {
  const t = (type ?? '').toLowerCase();
  return t.indexOf('polyline') !== -1 || t.indexOf('distance') !== -1;
}

/** Serialises a freehand point set to a GroupDocs polyline `svgPath` string (`M x,y L x,y …`). */
export function pointsToSvgPath(points: { x: number; y: number }[]): string {
  return points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x},${p.y}`).join(' ');
}

/** Parses a polyline `svgPath` (`M x,y L x,y …`) back into a point set for the overlay. */
export function svgPathToPoints(svgPath: string): { x: number; y: number }[] {
  const points: { x: number; y: number }[] = [];
  const re = /[MLml]\s*(-?\d+(?:\.\d+)?)[ ,]\s*(-?\d+(?:\.\d+)?)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(svgPath)) !== null) points.push({ x: parseFloat(m[1]), y: parseFloat(m[2]) });
  return points;
}

/** Projects a client annotation onto exactly the swagger AnnotationItem model (dropping local-only
 * and unsupported fields), and normalises `box` to its four model properties. Freehand strokes are
 * carried as `svgPath` (built from `points`) — the model's geometry field for a polyline. */
export function toApiAnnotation(a: IAnnotationItem): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  API_ANNOTATION_FIELDS.forEach((k) => {
    const v = a[k];
    if (v === undefined) return;
    if (k === 'box' && v && typeof v === 'object') {
      const b = v as IAnnotationItem['box'];
      out.box = { x: b!.x, y: b!.y, width: b!.width, height: b!.height };
    } else {
      out[k] = v;
    }
  });
  if (isPolylineType(a.type) && a.points && a.points.length > 1) {
    out.svgPath = pointsToSvgPath(a.points);
  } else if (a.svgPath) {
    out.svgPath = a.svgPath;
  }
  return out;
}

export function buildAddAnnotationsBody(
  filePath: string,
  annotations: IAnnotationItem[],
  saveToSharePoint: boolean
): Record<string, unknown> {
  return { filePath, annotations: annotations.map(toApiAnnotation), saveToSharePoint };
}

// The Annotate tab works in the preview PNG's pixel space (that's where clicks land), but the
// GroupDocs annotation `box` is in document points (1/72"), top-left origin — so a box sent in
// pixels is read as points and lands far to the right/bottom, scaled by the render DPI. We convert
// both ways around the wire: pixels → points before /add (factor 72/DPI), points → pixels after
// /get (factor DPI/72). The factor is DPI-only and page-size-independent, so one tenant DPI value
// (Admin Config) covers every page size. penColor/pen points are scaled too for symmetry.
export function scaleAnnotationBoxes(annotations: IAnnotationItem[], factor: number): IAnnotationItem[] {
  if (!factor || factor === 1) return annotations;
  return annotations.map((a) => {
    const next: IAnnotationItem = { ...a };
    if (a.box) {
      next.box = {
        x: a.box.x * factor,
        y: a.box.y * factor,
        width: a.box.width * factor,
        height: a.box.height * factor,
      };
    }
    if (a.points) next.points = a.points.map((p) => ({ x: p.x * factor, y: p.y * factor }));
    return next;
  });
}

/** px → points factor for the given render DPI (used before /add). */
export function pixelsToPointsFactor(dpi: number): number {
  return dpi > 0 ? 72 / dpi : 1;
}

/** points → px factor for the given render DPI (used after /get, to place overlays). */
export function pointsToPixelsFactor(dpi: number): number {
  return dpi > 0 ? dpi / 72 : 1;
}

export function buildRemoveAnnotationsBody(
  filePath: string,
  opts: { annotationIds?: number[]; removeAll?: boolean }
): Record<string, unknown> {
  return {
    filePath,
    annotationIds: opts.annotationIds ?? [],
    removeAll: !!opts.removeAll,
  };
}

/**
 * Parses the /api/Annotation/get response into an annotation array. The endpoint's success shape
 * isn't pinned by Swagger, so accept the common wrappers: a bare array, `{ annotations }`,
 * `{ data }`, or `{ data: { annotations } }`. Returns [] for anything unrecognised.
 */
export function parseAnnotationsResponse(body: unknown): IAnnotationItem[] {
  const pick = (v: unknown): unknown => {
    if (Array.isArray(v)) return v;
    if (v && typeof v === 'object') {
      const o = v as Record<string, unknown>;
      if (Array.isArray(o.annotations)) return o.annotations;
      if (Array.isArray(o.data)) return o.data;
      if (
        o.data &&
        typeof o.data === 'object' &&
        Array.isArray((o.data as Record<string, unknown>).annotations)
      ) {
        return (o.data as Record<string, unknown>).annotations;
      }
    }
    return [];
  };
  const arr = pick(body);
  return (arr as unknown[])
    .filter((a): a is IAnnotationItem => !!a && typeof a === 'object' && !!(a as IAnnotationItem).type)
    .map((a) => (!a.points && a.svgPath ? { ...a, points: svgPathToPoints(a.svgPath) } : a));
}
