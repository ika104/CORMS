import * as React from 'react';
import * as ReactDom from 'react-dom';
import { act } from 'react-dom/test-utils';
import { CollapsibleSection } from '../CollapsibleSection';

describe('CollapsibleSection validation reveal', () => {
  let container: HTMLDivElement;

  function render(openRequest?: number): void {
    act(() => {
      ReactDom.render(
        <CollapsibleSection number={1} title="Core Metadata" defaultOpen={false} openRequest={openRequest}>
          <input data-validation-field="subject" />
        </CollapsibleSection>,
        container
      );
    });
  }

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

  it('reopens a collapsed section when a validation-focus request arrives', () => {
    render();
    expect(container.querySelector('button')?.getAttribute('aria-expanded')).toBe('false');
    expect(container.querySelector('[data-validation-field="subject"]')).toBeNull();

    render(1);
    expect(container.querySelector('button')?.getAttribute('aria-expanded')).toBe('true');
    expect(container.querySelector('[data-validation-field="subject"]')).not.toBeNull();
  });
});
