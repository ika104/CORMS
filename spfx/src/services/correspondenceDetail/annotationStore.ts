import { IAnnotationItem } from '../../models/IGroupDocs';
import { parseAnnotationsResponse } from '../documentPreview/groupDocsRequests';

/**
 * CMS-024 — the on-column persistence format for correspondence annotations.
 *
 * RecordsHub/GroupDocs does NOT persist annotations or store an annotated copy of the document: the
 * Annotate tab creates annotations via /api/Annotation/add, reads the canonical set back via
 * /api/Annotation/get, and CORMS is responsible for keeping them. This module is the pure (de)serializer
 * for the JSON blob CORMS stores in CORMS_Correspondence.AnnotationsJson and reloads to redraw the
 * annotations over the plain document preview.
 *
 * Coordinates are stored exactly as the overlay consumes them — the tenant's fixed render-DPI pixel
 * space that DocumentPreviewService already converts to/from document points around the GroupDocs
 * wire. One tenant DPI (Admin Config) is assumed stable, the same assumption the get/add round trip
 * already makes; changing the render DPI would require re-annotating (documented on the column).
 */

export const ANNOTATIONS_ENVELOPE_VERSION = 1;

interface IAnnotationsEnvelope {
  v: number;
  annotations: IAnnotationItem[];
}

// Local-only bookkeeping the Annotate tab hangs off each annotation (the React key, the saved flag).
// Never persisted — stripped here so the stored blob is exactly the model the overlay reads back.
const LOCAL_ONLY_FIELDS = ['key', 'saved'];

function stripLocalFields(annotation: IAnnotationItem): IAnnotationItem {
  const source = annotation as unknown as Record<string, unknown>;
  const clean: Record<string, unknown> = {};
  Object.keys(source).forEach((k) => {
    if (LOCAL_ONLY_FIELDS.indexOf(k) === -1) clean[k] = source[k];
  });
  return clean as unknown as IAnnotationItem;
}

/** Serialises the current annotation set to the JSON string stored in the column. An empty set is
 * written as an empty-annotations envelope (not an empty string) so a cleared document is an
 * explicit, unambiguous "no annotations" rather than "never annotated". */
export function serializeAnnotations(annotations: IAnnotationItem[]): string {
  const envelope: IAnnotationsEnvelope = {
    v: ANNOTATIONS_ENVELOPE_VERSION,
    annotations: annotations.map(stripLocalFields),
  };
  return JSON.stringify(envelope);
}

/** Parses the stored JSON back into an annotation array for the overlay. Tolerant of a blank/never-set
 * column (→ []), malformed JSON (→ []), and both the enveloped `{ v, annotations }` form and a bare
 * array (via parseAnnotationsResponse, which also rebuilds `points` from a polyline `svgPath`). */
export function parseStoredAnnotations(json: string | undefined): IAnnotationItem[] {
  // A SharePoint Note column reads back as undefined (or, on legacy rows, null) when never set —
  // the falsy guard covers both before any string method is called.
  if (!json || !json.trim()) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return [];
  }
  return parseAnnotationsResponse(parsed);
}
