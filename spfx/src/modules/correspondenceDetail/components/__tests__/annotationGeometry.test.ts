import { canResizeAnnotation, resizeAnnotationBox } from '../annotationGeometry';

describe('resizeAnnotationBox', () => {
  it('resizes from the bottom-right corner and keeps the result inside the page', () => {
    expect(resizeAnnotationBox({ x: 70, y: 60, width: 40, height: 30 }, 80, 80, { w: 120, h: 100 })).toEqual({
      x: 70,
      y: 60,
      width: 50,
      height: 40,
    });
  });

  it('keeps a usable minimum size when resizing smaller', () => {
    expect(
      resizeAnnotationBox({ x: 10, y: 10, width: 60, height: 60 }, -100, -100, { w: 200, h: 200 })
    ).toEqual({
      x: 10,
      y: 10,
      width: 28,
      height: 22,
    });
  });

  it('never lets an edge-positioned annotation exceed the page', () => {
    expect(resizeAnnotationBox({ x: 95, y: 96, width: 4, height: 3 }, -10, -10, { w: 100, h: 100 })).toEqual({
      x: 95,
      y: 96,
      width: 5,
      height: 4,
    });
  });
});

describe('canResizeAnnotation', () => {
  it('allows box annotations but leaves freehand paths unchanged', () => {
    expect(canResizeAnnotation({ type: 'Area', box: { x: 1, y: 2, width: 3, height: 4 } })).toBe(true);
    expect(
      canResizeAnnotation({
        type: 'Polyline',
        box: { x: 1, y: 2, width: 3, height: 4 },
        points: [{ x: 1, y: 2 }],
      })
    ).toBe(false);
  });
});
