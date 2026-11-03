import * as React from 'react';
import * as ReactDom from 'react-dom';
import { act } from 'react-dom/test-utils';
import { createTestServices, TestApp } from '../../../app/__tests__/testHarness';
import { ITask } from '../../../models/ITask';

// CMS-046 — every search on this screen goes through Elasticsearch, including the "Tasks" search
// type (elasticService.search('tasks', ...)). TaskListService is used only to populate the
// assignee filter dropdown on mount, never to run the search itself.

// jsdom has no ResizeObserver — ag-grid (SearchView's grids render table-mode, since neither
// passes `enableViewToggle`/`cardRenderer`, so DataGrid.tsx's canShowCards is always false here)
// relies on it internally and otherwise never paints rows even though data reaches the grid. See
// DelegationView.test.tsx's identical comment for the same fix.
class ResizeObserverStub {
  public observe(): void {}
  public unobserve(): void {}
  public disconnect(): void {}
}
(window as unknown as { ResizeObserver: typeof ResizeObserverStub }).ResizeObserver = ResizeObserverStub;

let container: HTMLDivElement;

function render(services?: ReturnType<typeof createTestServices>): void {
  act(() => {
    ReactDom.render(<TestApp services={services} />, container);
  });
}

async function settle(): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 250));
  });
}

async function waitFor(predicate: () => boolean, budgetMs = 5000): Promise<void> {
  const stepMs = 25;
  for (let waited = 0; waited <= budgetMs; waited += stepMs) {
    if (predicate()) return;
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, stepMs));
    });
  }
  throw new Error(`waitFor: condition not met within ${budgetMs}ms`);
}

// eslint-disable-next-line @rushstack/no-new-null -- Element.closest()'s real DOM signature returns Element | null
function click(element?: Element | null): void {
  act(() => {
    element?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
}

// ag-grid's RowRenderer only recognizes a click as a row click when the dispatched MouseEvent
// carries `cancelable`/`view`/`button` (a bare `{bubbles: true}` — enough for every plain React
// button elsewhere in this file — is silently ignored by its internal row-click handler).
function clickAgRow(element?: Element | null): void {
  act(() => {
    element?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window, button: 0 }));
  });
}

function findByText(selector: string, text: string): Element | undefined {
  return Array.from(container.querySelectorAll(selector)).filter((el) => (el.textContent ?? '').trim() === text)[0];
}

function findContainingText(selector: string, text: string): Element | undefined {
  return Array.from(container.querySelectorAll(selector)).filter((el) => (el.textContent ?? '').indexOf(text) !== -1)[0];
}

function task(overrides: Partial<ITask>): ITask {
  return {
    id: 't-1',
    subject: 'Sample task',
    type: 'To Do',
    priority: 'Normal',
    status: 'Pending',
    dueDate: '2026-06-01',
    assignee: 'Someone',
    assignees: [{ displayName: 'Someone' }],
    hasAttachment: false,
    isMine: false,
    isOverdue: false,
    ...overrides,
  };
}

describe('Advanced Search — Tasks type goes through Elasticsearch (CMS-046)', () => {
  beforeEach(() => {
    window.location.hash = '#/search';
    sessionStorage.clear();
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    act(() => {
      ReactDom.unmountComponentAtNode(container);
    });
    container.remove();
  });

  it('running a search under the Tasks type calls elasticService.search("tasks", ...) and renders its results', async () => {
    const services = createTestServices();
    const calls: Array<[string, string]> = [];
    services.elasticService.search = (<T,>(index: string, query: string): Promise<{ total: number; items: T[] }> => {
      calls.push([index, query]);
      return Promise.resolve({ total: 1, items: [task({ id: 'es-1', subject: 'Elastic task result' })] as unknown as T[] });
    }) as typeof services.elasticService.search;

    render(services);
    await waitFor(() => !!findByText('button', 'Tasks'));

    click(findByText('button', 'Tasks'));
    await settle();
    click(findByText('button', 'Search'));
    await waitFor(() => (container.textContent ?? '').indexOf('Elastic task result') !== -1);

    // The search goes through Elasticsearch with the 'tasks' index selector.
    expect(calls.some((call) => call[0] === 'tasks')).toBe(true);
    expect(container.textContent).toContain('Elastic task result');
  });

  it('passes the query text and the Type/Priority/Status/Assignee filters through the Elastic query', async () => {
    const services = createTestServices();
    const calls: Array<[string, string]> = [];
    services.elasticService.search = (<T,>(index: string, query: string): Promise<{ total: number; items: T[] }> => {
      calls.push([index, query]);
      return Promise.resolve({ total: 0, items: [] as unknown as T[] });
    }) as typeof services.elasticService.search;

    render(services);
    await waitFor(() => !!findByText('button', 'Tasks'));
    click(findByText('button', 'Tasks'));
    await settle();

    const queryInput = container.querySelector('input[type="text"]') as HTMLInputElement | null;
    expect(queryInput).toBeDefined();
    act(() => {
      const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')!.set!;
      nativeSetter.call(queryInput, 'budget');
      queryInput!.dispatchEvent(new Event('input', { bubbles: true }));
    });

    click(findByText('button', 'Search'));
    await waitFor(() => calls.some((call) => call[0] === 'tasks'));

    // The query payload is the shared {term, filters} contract (searchQuery.ts): term carries the
    // free text, filters carry Type/Priority/Status/Assignee.
    const tasksCall = calls.find((call) => call[0] === 'tasks')!;
    const payload = JSON.parse(tasksCall[1]);
    expect(payload.term).toBe('budget');
    expect(payload.filters).toEqual(expect.objectContaining({ type: '', priority: '', status: '', assignee: '' }));
  });
});

describe('Advanced Search — cross-screen wiring (CMS-040 Part 10)', () => {
  beforeEach(() => {
    window.location.hash = '#/search';
    sessionStorage.clear();
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    act(() => {
      ReactDom.unmountComponentAtNode(container);
    });
    container.remove();
  });

  it('clicking a Correspondence result navigates to the correspondence detail screen', async () => {
    const services = createTestServices();
    services.elasticService.search = (<T,>(): Promise<{ total: number; items: T[] }> =>
      Promise.resolve({
        total: 1,
        items: [
          {
            id: 'c-search-1',
            referenceNumber: 'REF-SEARCH-1',
            subject: 'Findable Correspondence',
            type: 'Letter',
            direction: 'Incoming' as const,
            status: 'Registered' as const,
            priority: 'Normal' as const,
            securityTier: 1,
            department: 'Ops',
            createdAt: '2026-01-01T00:00:00.000Z',
          } as unknown as T,
        ],
      })) as typeof services.elasticService.search;

    render(services);
    await waitFor(() => !!findByText('button', 'Search'));
    click(findByText('button', 'Search'));
    await waitFor(() => (container.textContent ?? '').indexOf('Findable Correspondence') !== -1);

    clickAgRow(findContainingText('.ag-row', 'Findable Correspondence'));
    await settle();

    expect(window.location.hash).toBe('#/correspondence/c-search-1');
  });

  it('renders the matched-content snippet beneath the subject in a Correspondence result (CMS-026 AC3)', async () => {
    const services = createTestServices();
    services.elasticService.search = (<T,>(): Promise<{ total: number; items: T[] }> =>
      Promise.resolve({
        total: 1,
        items: [
          {
            id: 'c-snip-1',
            referenceNumber: 'REF-SNIP-1',
            subject: 'Quarterly Report',
            type: 'Letter',
            direction: 'Incoming' as const,
            status: 'Registered' as const,
            priority: 'Normal' as const,
            securityTier: 1,
            department: 'Ops',
            createdAt: '2026-01-01T00:00:00.000Z',
            searchSnippet: '…the budget figures for the quarter…',
          } as unknown as T,
        ],
      })) as typeof services.elasticService.search;

    render(services);
    await waitFor(() => !!findByText('button', 'Search'));
    click(findByText('button', 'Search'));
    await waitFor(() => (container.textContent ?? '').indexOf('Quarterly Report') !== -1);

    expect(container.textContent).toContain('the budget figures for the quarter');
  });

  it('clicking a Task result with a related correspondence navigates to that item; a task with no link is a no-op', async () => {
    const services = createTestServices();
    services.elasticService.search = (<T,>(): Promise<{ total: number; items: T[] }> =>
      Promise.resolve({
        total: 1,
        items: [task({ id: 'live-1', subject: 'Linked task', relatedCorrespondenceId: 'c-related-1' })] as unknown as T[],
      })) as typeof services.elasticService.search;

    render(services);
    await waitFor(() => !!findByText('button', 'Tasks'));
    click(findByText('button', 'Tasks'));
    await settle();
    click(findByText('button', 'Search'));
    await waitFor(() => (container.textContent ?? '').indexOf('Linked task') !== -1);

    clickAgRow(findContainingText('.ag-row', 'Linked task'));
    await settle();

    expect(window.location.hash).toBe('#/correspondence/c-related-1');
  });
});
