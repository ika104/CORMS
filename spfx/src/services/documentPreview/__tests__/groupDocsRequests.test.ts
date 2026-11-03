import {
  groupDocsBaseUrl,
  annotationEndpoint,
  buildViewDocBody,
  buildTextWatermark,
  buildRepeatingTextWatermarks,
  isWatermarkMandatory,
  watermarkOnByDefault,
  buildAddAnnotationsBody,
  buildRemoveAnnotationsBody,
  scaleAnnotationBoxes,
  pixelsToPointsFactor,
  pointsToPixelsFactor,
  pointsToSvgPath,
  svgPathToPoints,
  toApiAnnotation,
  parseAnnotationsResponse,
  resolveApiFilePath,
  toGraphShareContentUrl,
} from '../groupDocsRequests';

describe('groupDocsBaseUrl / annotationEndpoint', () => {
  it('derives the host base from the viewdoc URL', () => {
    expect(groupDocsBaseUrl('https://host:9220/api/Groupdoc/viewdoc')).toBe('https://host:9220');
    expect(groupDocsBaseUrl('https://host:9220/')).toBe('https://host:9220');
  });
  it('builds the Annotation endpoints from the viewdoc URL', () => {
    expect(annotationEndpoint('https://host:9220/api/Groupdoc/viewdoc', 'get')).toBe('https://host:9220/api/Annotation/get');
    expect(annotationEndpoint('https://host:9220/api/Groupdoc/viewdoc', 'remove')).toBe('https://host:9220/api/Annotation/remove');
  });
});

describe('buildViewDocBody', () => {
  it('omits watermarks when none provided', () => {
    expect(buildViewDocBody('graph://x')).toEqual({ filePath: 'graph://x', includeWatermarks: false, watermarks: [] });
  });
  it('includes watermarks when provided', () => {
    const wm = buildTextWatermark('Top Secret');
    const body = buildViewDocBody('graph://x', [wm]);
    expect(body.includeWatermarks).toBe(true);
    expect(body.watermarks).toEqual([wm]);
    expect(wm).toMatchObject({ type: 'text', text: 'Top Secret', rotateAngle: -45 });
  });
});

describe('CMS-051 — buildRepeatingTextWatermarks', () => {
  it('AC2: tiles the classification text diagonally across the page at reduced opacity', () => {
    const items = buildRepeatingTextWatermarks('Confidential');
    // A 3×3 alignment grid covers the whole page independent of its rendered size.
    expect(items).toHaveLength(9);
    items.forEach((wm) => {
      expect(wm).toMatchObject({ type: 'text', text: 'Confidential', rotateAngle: -45 });
      expect(wm.opacity).toBeLessThan(0.5); // reduced opacity keeps the document legible
    });
    // Every alignment cell is distinct, so the text repeats across the page rather than stacking.
    const cells = new Set(items.map((wm) => `${wm.horizontalAlignment}/${wm.verticalAlignment}`));
    expect(cells.size).toBe(9);
  });

  it('AC3/AC6: the tiled watermarks feed the GroupDocs viewdoc burn-in body', () => {
    const items = buildRepeatingTextWatermarks('Secret');
    const body = buildViewDocBody('graph://x', items);
    expect(body.includeWatermarks).toBe(true);
    expect(body.watermarks).toEqual(items);
  });
});

describe('CMS-051 — watermark policy', () => {
  it('starts with the watermark enabled for every correspondence direction', () => {
    expect(watermarkOnByDefault('Incoming')).toBe(true);
    expect(watermarkOnByDefault('Outgoing')).toBe(true);
    expect(watermarkOnByDefault('External')).toBe(true);
  });

  it('AC5: mandatory (non-toggleable) for classified received items — Confidential and above', () => {
    // Ascending scale: 1 Unclassified, 2 Restricted, 3 Confidential, 4 Secret, 5 Top Secret.
    expect(isWatermarkMandatory('Incoming', 3)).toBe(true);
    expect(isWatermarkMandatory('Incoming', 5)).toBe(true);
    // Below Confidential a received item still defaults on but may be toggled off.
    expect(isWatermarkMandatory('Incoming', 2)).toBe(false);
    expect(isWatermarkMandatory('Incoming', 1)).toBe(false);
    // Never mandatory on sent items regardless of tier.
    expect(isWatermarkMandatory('Outgoing', 5)).toBe(false);
  });
});

describe('annotation bodies', () => {
  it('builds add + remove bodies', () => {
    expect(buildAddAnnotationsBody('f', [{ type: 'text', text: 'hi' }], true)).toEqual({
      filePath: 'f',
      annotations: [{ type: 'text', text: 'hi' }],
      saveToSharePoint: true,
    });
    expect(buildRemoveAnnotationsBody('f', { removeAll: true })).toEqual({ filePath: 'f', annotationIds: [], removeAll: true });
  });

  it('strips local-only + unsupported fields and keeps only the swagger model fields', () => {
    const body = buildAddAnnotationsBody(
      'f',
      [
        {
          type: 'Polyline',
          pageNumber: 0,
          box: { x: 1, y: 2, width: 3, height: 4 },
          text: 'hi',
          // Fields the AnnotationItem model has no slot for — must not reach the wire.
          id: 99,
          points: [{ x: 1, y: 2 }],
          creatorName: 'Zeyad',
          createdOn: '2026-09-05T00:00:00.000Z',
          // Local-only bookkeeping, if it ever leaks through.
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } as any,
      ],
      true
    );
    expect(body).toEqual({
      filePath: 'f',
      saveToSharePoint: true,
      annotations: [{ type: 'Polyline', pageNumber: 0, box: { x: 1, y: 2, width: 3, height: 4 }, text: 'hi' }],
    });
    expect(buildRemoveAnnotationsBody('f', { annotationIds: [1, 2] })).toEqual({ filePath: 'f', annotationIds: [1, 2], removeAll: false });
  });
});

describe('CMS-024 — freehand pen (polyline) geometry', () => {
  const pts = [
    { x: 10, y: 20 },
    { x: 30, y: 40 },
    { x: 55, y: 12 },
  ];

  it('serialises pen points to an svgPath and back', () => {
    const path = pointsToSvgPath(pts);
    expect(path).toBe('M10,20 L30,40 L55,12');
    expect(svgPathToPoints(path)).toEqual(pts);
  });

  it('sends a Polyline as svgPath (its geometry field), not a stripped points array', () => {
    const wire = toApiAnnotation({ type: 'Polyline', box: { x: 10, y: 12, width: 45, height: 28 }, points: pts });
    expect(wire.svgPath).toBe('M10,20 L30,40 L55,12');
    expect(wire.points).toBeUndefined(); // points isn't a model field
    expect(wire.box).toEqual({ x: 10, y: 12, width: 45, height: 28 });
  });

  it('restores points from svgPath when reading annotations back', () => {
    const [a] = parseAnnotationsResponse({ annotations: [{ type: 'Polyline', svgPath: 'M10,20 L30,40 L55,12' }] });
    expect(a.points).toEqual(pts);
  });
});

describe('CMS-024 — pixel⇄point scaling', () => {
  it('converts preview pixels to points at 150 DPI (the wire units the box store expects)', () => {
    // A box at ~37% across a 1239px A4 page (150 DPI) must land at ~37% of the 595pt page, not 77%.
    const f = pixelsToPointsFactor(150); // 0.48
    const [scaled] = scaleAnnotationBoxes([{ type: 'TextField', box: { x: 458.88, y: 20.31, width: 220, height: 44 } }], f);
    expect(scaled.box!.x).toBeCloseTo(220.26, 1); // 220.26pt / 595pt ≈ 37%
    expect(scaled.box!.width).toBeCloseTo(105.6, 1); // 105.6pt / 595pt ≈ 17.7%, not 37%
  });

  it('round-trips pixels → points → pixels', () => {
    const box = { x: 458.88, y: 20.31, width: 220, height: 44 };
    const [toPt] = scaleAnnotationBoxes([{ type: 'Area', box }], pixelsToPointsFactor(150));
    const [backToPx] = scaleAnnotationBoxes([toPt], pointsToPixelsFactor(150));
    expect(backToPx.box!.x).toBeCloseTo(box.x, 5);
    expect(backToPx.box!.width).toBeCloseTo(box.width, 5);
  });

  it('scales pen points too and is a no-op at factor 1 / bad DPI', () => {
    const [scaled] = scaleAnnotationBoxes([{ type: 'Polyline', points: [{ x: 10, y: 20 }] }], 2);
    expect(scaled.points).toEqual([{ x: 20, y: 40 }]);
    const same = [{ type: 'Area', box: { x: 1, y: 2, width: 3, height: 4 } }];
    expect(scaleAnnotationBoxes(same, 1)).toBe(same);
    expect(pixelsToPointsFactor(0)).toBe(1);
  });
});

describe('parseAnnotationsResponse', () => {
  const a = { type: 'text', text: 'x' };
  it('accepts a bare array, {annotations}, {data}, and {data:{annotations}}', () => {
    expect(parseAnnotationsResponse([a])).toEqual([a]);
    expect(parseAnnotationsResponse({ annotations: [a] })).toEqual([a]);
    expect(parseAnnotationsResponse({ data: [a] })).toEqual([a]);
    expect(parseAnnotationsResponse({ data: { annotations: [a] } })).toEqual([a]);
  });
  it('drops entries without a type and returns [] for junk', () => {
    expect(parseAnnotationsResponse({ annotations: [a, { message: 'no type' }] })).toEqual([a]);
    expect(parseAnnotationsResponse(undefined)).toEqual([]);
    expect(parseAnnotationsResponse('nope')).toEqual([]);
  });
});

describe('resolveApiFilePath', () => {
  it('resolves relative URLs against origin and Graph-encodes them', () => {
    expect(resolveApiFilePath('/sites/CORMS/doc.pdf', 'https://t.sharepoint.com')).toBe(
      toGraphShareContentUrl('https://t.sharepoint.com/sites/CORMS/doc.pdf')
    );
  });
  it('passes an already-Graph URL through unchanged', () => {
    const g = 'https://graph.microsoft.com/v1.0/shares/u!abc/driveItem/content';
    expect(resolveApiFilePath(g, 'https://t')).toBe(g);
  });
});
