import * as React from 'react';
import * as ReactDom from 'react-dom';
import { act } from 'react-dom/test-utils';
import {
  draftSignature,
  hasAutosaveableContent,
  useDraftAutosave,
  IUseDraftAutosaveParams,
} from '../useDraftAutosave';
import { createInitialFormState, ICreateCorrespondenceFormState } from '../types';

function state(overrides: Partial<ICreateCorrespondenceFormState> = {}): ICreateCorrespondenceFormState {
  return { ...createInitialFormState('Alice'), ...overrides };
}

describe('CMS-005 AC8 — autosave gating helpers', () => {
  it('hasAutosaveableContent is false for a blank form and true once there is content', () => {
    expect(hasAutosaveableContent(state())).toBe(false);
    expect(hasAutosaveableContent(state({ subject: 'Hi' }))).toBe(true);
    expect(hasAutosaveableContent(state({ bodyHtml: '<p>x</p>' }))).toBe(true);
    expect(hasAutosaveableContent(state({ uploadedDocumentName: 'a.pdf' }))).toBe(true);
    expect(hasAutosaveableContent(state({ selectedTemplateId: 'tpl-1' }))).toBe(true);
  });

  it('draftSignature changes when a watched field changes, and is stable otherwise', () => {
    const base = draftSignature(state({ subject: 'A' }));
    expect(draftSignature(state({ subject: 'A' }))).toBe(base);
    expect(draftSignature(state({ subject: 'B' }))).not.toBe(base);
    // existingId is not a watched field — persisting the row must not itself re-trigger autosave.
    expect(draftSignature(state({ subject: 'A', existingId: 'row-1' }))).toBe(base);
  });
});

describe('CMS-005 AC8 — useDraftAutosave debounce/save', () => {
  let container: HTMLDivElement;

  beforeEach(() => {
    jest.useFakeTimers();
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    ReactDom.unmountComponentAtNode(container);
    container.remove();
    jest.useRealTimers();
  });

  const Harness: React.FC<IUseDraftAutosaveParams> = (params) => {
    useDraftAutosave(params);
    return null;
  };

  function render(params: IUseDraftAutosaveParams): void {
    act(() => {
      ReactDom.render(<Harness {...params} />, container);
    });
  }

  it('does not save when disabled, even after content changes', () => {
    const save = jest.fn(() => Promise.resolve());
    render({ state: state(), enabled: false, save, delayMs: 1000 });
    render({ state: state({ subject: 'Hi' }), enabled: false, save, delayMs: 1000 });
    act(() => {
      jest.advanceTimersByTime(2000);
    });
    expect(save).not.toHaveBeenCalled();
  });

  it('does not save while the form stays empty', () => {
    const save = jest.fn(() => Promise.resolve());
    render({ state: state(), enabled: true, save, delayMs: 1000 });
    render({ state: state({ comments: '' }), enabled: true, save, delayMs: 1000 });
    act(() => {
      jest.advanceTimersByTime(2000);
    });
    expect(save).not.toHaveBeenCalled();
  });

  it('saves once, after the debounce window, when content changes from the mount baseline', () => {
    const save = jest.fn(() => Promise.resolve());
    // Mount baseline is a blank form; typing a subject then triggers a debounced save.
    render({ state: state(), enabled: true, save, delayMs: 1000 });
    render({ state: state({ subject: 'Budget' }), enabled: true, save, delayMs: 1000 });
    expect(save).not.toHaveBeenCalled();
    act(() => {
      jest.advanceTimersByTime(1000);
    });
    expect(save).toHaveBeenCalledTimes(1);
  });

  it('does not fire before the debounce window elapses', () => {
    const save = jest.fn(() => Promise.resolve());
    render({ state: state(), enabled: true, save, delayMs: 1000 });
    render({ state: state({ subject: 'Budget' }), enabled: true, save, delayMs: 1000 });
    act(() => {
      jest.advanceTimersByTime(500);
    });
    expect(save).not.toHaveBeenCalled();
  });
});
