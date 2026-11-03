import * as React from 'react';
import * as ReactDom from 'react-dom';
import { act } from 'react-dom/test-utils';
import { SummaryTile } from '../SummaryTile';

let container: HTMLDivElement;

describe('SummaryTile', () => {
  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    act(() => {
      ReactDom.unmountComponentAtNode(container);
    });
    container.remove();
  });

  it('colours the icon with the accent via CSS color + currentColor (so a theme var resolves and stays reactive)', () => {
    const themeColor = 'var(--corms-toolbar-primary)';

    act(() => {
      ReactDom.render(
        <SummaryTile label="All correspondence" value={4} color={themeColor} iconName="users" />,
        container
      );
    });

    const icon = container.querySelector('svg');
    // The wrapper carries the accent as a CSS `color` (a var() resolves here, unlike an SVG attr)…
    expect(icon?.parentElement?.getAttribute('style')).toContain(`color: ${themeColor}`);
    // …and the Lucide glyph strokes with currentColor (no hard-coded fill/stroke that would ignore it).
    expect(icon?.getAttribute('stroke')).toBe('currentColor');
    expect(icon?.getAttribute('fill')).toBe('none');
  });
});
