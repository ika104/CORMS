import { IAnnotationItem } from '../../../models/IGroupDocs';
import {
  ANNOTATIONS_ENVELOPE_VERSION,
  parseStoredAnnotations,
  serializeAnnotations,
} from '../annotationStore';

describe('CMS-024 annotationStore — the CORMS-side persistence format', () => {
  const note: IAnnotationItem = {
    type: 'Area',
    pageNumber: 0,
    text: 'Review this',
    box: { x: 10, y: 20, width: 100, height: 40 },
    creatorName: 'Alice',
    createdOn: '2026-09-08T10:00:00.000Z',
  };

  it('serialises to a versioned envelope', () => {
    const json = serializeAnnotations([note]);
    const parsed = JSON.parse(json);
    expect(parsed.v).toBe(ANNOTATIONS_ENVELOPE_VERSION);
    expect(parsed.annotations).toHaveLength(1);
    expect(parsed.annotations[0].text).toBe('Review this');
  });

  it('round-trips annotations through serialize → parse', () => {
    const restored = parseStoredAnnotations(serializeAnnotations([note]));
    expect(restored).toHaveLength(1);
    expect(restored[0].box).toEqual({ x: 10, y: 20, width: 100, height: 40 });
    expect(restored[0].creatorName).toBe('Alice');
  });

  it('strips the local-only bookkeeping fields (key/saved) so they never reach the column', () => {
    const local = { ...note, key: 'a-1', saved: true } as unknown as IAnnotationItem;
    const parsed = JSON.parse(serializeAnnotations([local]));
    expect('key' in parsed.annotations[0]).toBe(false);
    expect('saved' in parsed.annotations[0]).toBe(false);
    expect(parsed.annotations[0].type).toBe('Area');
  });

  it('serialises an empty set as an explicit empty-annotations envelope, not a blank string', () => {
    const json = serializeAnnotations([]);
    expect(json).not.toBe('');
    expect(JSON.parse(json).annotations).toEqual([]);
  });

  it('parses a never-set (blank/undefined/null) column as no annotations', () => {
    expect(parseStoredAnnotations(undefined)).toEqual([]);
    // Legacy rows can read back as null at runtime even though the column type is string|undefined.
    expect(parseStoredAnnotations(null as unknown as string | undefined)).toEqual([]);
    expect(parseStoredAnnotations('')).toEqual([]);
    expect(parseStoredAnnotations('   ')).toEqual([]);
  });

  it('parses malformed JSON as no annotations rather than throwing', () => {
    expect(parseStoredAnnotations('{ not json')).toEqual([]);
  });

  it('tolerates a bare-array payload and rebuilds points from a polyline svgPath', () => {
    const restored = parseStoredAnnotations(JSON.stringify([{ type: 'Polyline', svgPath: 'M0,0 L5,5 L10,2' }]));
    expect(restored).toHaveLength(1);
    expect(restored[0].points).toEqual([
      { x: 0, y: 0 },
      { x: 5, y: 5 },
      { x: 10, y: 2 },
    ]);
  });
});
