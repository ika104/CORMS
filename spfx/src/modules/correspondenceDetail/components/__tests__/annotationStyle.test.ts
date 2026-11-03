import { IAnnotationItem } from '../../../../models/IGroupDocs';
import {
  DEFAULT_ANNOTATION_STYLE,
  IAnnotationStyle,
  applyAnnotationStyle,
  clampFontSize,
  clampPenWidth,
  normalizeHexColor,
  styleFromAnnotation,
} from '../annotationStyle';

describe('normalizeHexColor', () => {
  it('lower-cases valid 6-digit hex', () => {
    expect(normalizeHexColor('#AABBCC', '#000000')).toBe('#aabbcc');
  });
  it('expands 3-digit shorthand hex', () => {
    expect(normalizeHexColor('#0AF', '#000000')).toBe('#00aaff');
  });
  it('falls back for missing or non-hex values (named colours, rgb(), empty)', () => {
    expect(normalizeHexColor(undefined, '#123456')).toBe('#123456');
    expect(normalizeHexColor('red', '#123456')).toBe('#123456');
    expect(normalizeHexColor('rgb(1,2,3)', '#123456')).toBe('#123456');
    expect(normalizeHexColor('', '#123456')).toBe('#123456');
  });
});

describe('clampPenWidth', () => {
  it('rounds and clamps into [1, 20]', () => {
    expect(clampPenWidth(0)).toBe(1);
    expect(clampPenWidth(2.4)).toBe(2);
    expect(clampPenWidth(99)).toBe(20);
  });
  it('defaults for non-finite input', () => {
    expect(clampPenWidth(undefined)).toBe(DEFAULT_ANNOTATION_STYLE.penWidth);
    expect(clampPenWidth(NaN)).toBe(DEFAULT_ANNOTATION_STYLE.penWidth);
  });
});

describe('clampFontSize', () => {
  it('rounds and clamps into [8, 72]', () => {
    expect(clampFontSize(2)).toBe(8);
    expect(clampFontSize(14.6)).toBe(15);
    expect(clampFontSize(99)).toBe(72);
  });
  it('defaults for non-finite input', () => {
    expect(clampFontSize(undefined)).toBe(DEFAULT_ANNOTATION_STYLE.fontSize);
    expect(clampFontSize(NaN)).toBe(DEFAULT_ANNOTATION_STYLE.fontSize);
  });
});

describe('styleFromAnnotation', () => {
  it('reads the style fields, normalizing colours', () => {
    const a: IAnnotationItem = {
      type: 'Area',
      penColor: '#FFF',
      backgroundColor: '#123456',
      fontColor: '#abcdef',
      penWidth: 5,
      fontSize: 24,
    };
    expect(styleFromAnnotation(a)).toEqual({
      penColor: '#ffffff',
      backgroundColor: '#123456',
      fontColor: '#abcdef',
      penWidth: 5,
      fontSize: 24,
    });
  });
  it('falls back to the given style for absent fields', () => {
    const fallback: IAnnotationStyle = {
      penColor: '#111111',
      backgroundColor: '#222222',
      fontColor: '#333333',
      penWidth: 3,
      fontSize: 18,
    };
    expect(styleFromAnnotation({ type: 'Point' }, fallback)).toEqual(fallback);
  });
});

describe('applyAnnotationStyle', () => {
  it('sets only the colour/width fields and preserves everything else', () => {
    const a: IAnnotationItem = {
      type: 'Area',
      pageNumber: 2,
      text: 'hi',
      box: { x: 1, y: 2, width: 3, height: 4 },
    };
    const style: IAnnotationStyle = {
      penColor: '#e53935',
      backgroundColor: '#ffeb3b',
      fontColor: '#000000',
      penWidth: 3,
      fontSize: 18,
    };
    const out = applyAnnotationStyle(a, style);
    expect(out).toEqual({
      type: 'Area',
      pageNumber: 2,
      text: 'hi',
      box: { x: 1, y: 2, width: 3, height: 4 },
      penColor: '#e53935',
      backgroundColor: '#ffeb3b',
      fontColor: '#000000',
      penWidth: 3,
      fontSize: 18,
    });
    // original is not mutated
    expect(a.penColor).toBeUndefined();
  });
});
