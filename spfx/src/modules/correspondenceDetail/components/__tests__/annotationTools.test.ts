import { ANNOTATION_TOOLS, isEditableNote, renderKindForType } from '../annotationTools';

describe('CMS-024 — annotation toolset', () => {
  it('AC3: offers freehand pen, text, sticky note, highlight, rectangle, ellipse, arrow, and eraser', () => {
    expect(ANNOTATION_TOOLS.map((t) => t.id)).toEqual([
      'pen',
      'text',
      'sticky',
      'highlight',
      'rect',
      'circle',
      'arrow',
      'eraser',
    ]);
  });

  it('AC11: each drawing tool maps to a real GroupDocs AnnotationType (eraser creates nothing)', () => {
    const byId = Object.fromEntries(ANNOTATION_TOOLS.map((t) => [t.id, t.apiType]));
    expect(byId).toMatchObject({
      pen: 'Polyline',
      text: 'TextField',
      sticky: 'Point',
      // Highlight persists as a translucent Area (the box model can't carry TextHighlight geometry).
      highlight: 'Area',
      rect: 'Area',
      circle: 'Ellipse',
      arrow: 'Arrow',
      eraser: '',
    });
  });

  it('every tool has an icon and a label key', () => {
    ANNOTATION_TOOLS.forEach((t) => {
      expect(t.iconName).toBeTruthy();
      expect(t.labelKey).toMatch(/^correspondenceDetail\.annotate\.tool\./);
    });
  });
});

describe('renderKindForType', () => {
  it('maps stored GroupDocs types onto how they are drawn (case-insensitive)', () => {
    expect(renderKindForType('Polyline')).toBe('polyline');
    expect(renderKindForType('Ellipse')).toBe('ellipse');
    expect(renderKindForType('Arrow')).toBe('arrow');
    expect(renderKindForType('TextHighlight')).toBe('highlight');
    expect(renderKindForType('Point')).toBe('note');
    expect(renderKindForType('TextField')).toBe('note');
    expect(renderKindForType('Area')).toBe('area');
  });

  it('falls back to an area box for an unknown type rather than not rendering', () => {
    expect(renderKindForType('SomethingNew')).toBe('area');
    expect(renderKindForType(undefined)).toBe('area');
  });
});

describe('isEditableNote', () => {
  it('only note/text kinds carry an editable message', () => {
    expect(isEditableNote('Point')).toBe(true);
    expect(isEditableNote('TextField')).toBe(true);
    expect(isEditableNote('Area')).toBe(false);
    expect(isEditableNote('Arrow')).toBe(false);
    expect(isEditableNote('Polyline')).toBe(false);
  });
});
