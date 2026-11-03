import * as React from 'react';
import * as ReactDom from 'react-dom';
import { act } from 'react-dom/test-utils';
import { createTestServices, TestApp } from '../../../app/__tests__/testHarness';
import { IDelegationRecord } from '../../../services/interfaces/IDelegationService';
import { IDirectoryPerson } from '../../../models/IDelegation';

// Delegation & Reassignment Backend task Part 4 — proves DelegationView is actually wired to
// IDelegationService (listAll/create) instead of the earlier local useState<IDelegation[]> seeded
// from a static mock import. Business-rule coverage (authorization, attachment fileType
// validation, ...) already lives in DelegationServiceCore.test.ts — these are wiring-only tests.

let container: HTMLDivElement;

// jsdom has no ResizeObserver (confirmed: `typeof window.ResizeObserver === 'undefined'` under
// jest-environment-jsdom) — ag-grid v36 (DataGridTable's real AgGridReact, used by this screen's
// table-mode grids) relies on it internally even in `domLayout="autoHeight"` mode and otherwise
// never completes its render pipeline, so rows never paint even though data reaches the grid. No
// other view's tests hit this: every other screen defaults to `DataGridCards` (plain React, no
// ag-grid). A minimal observe/unobserve/disconnect stub is enough — this screen's tests only need
// ag-grid to finish laying out rows, not to react to real size changes.
class ResizeObserverStub {
  public observe(): void {}
  public unobserve(): void {}
  public disconnect(): void {}
}
(window as unknown as { ResizeObserver: typeof ResizeObserverStub }).ResizeObserver = ResizeObserverStub;

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

function findByText(selector: string, text: string): Element | undefined {
  return Array.from(container.querySelectorAll(selector)).filter((el) => (el.textContent ?? '').trim() === text)[0];
}

// CreateDelegationModal (like every Modal in this app) portals via a Fluent Layer to
// document.body, not `container`.
function findInDocByText(selector: string, text: string): Element | undefined {
  return Array.from(document.querySelectorAll(selector)).filter((el) => (el.textContent ?? '').indexOf(text) !== -1)[0];
}

function setInputValue(el: HTMLInputElement | HTMLTextAreaElement, value: string): void {
  act(() => {
    const proto = el instanceof HTMLTextAreaElement ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(proto, 'value')!.set!;
    setter.call(el, value);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

function setSelectValue(el: HTMLSelectElement, value: string): void {
  act(() => {
    const setter = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value')!.set!;
    setter.call(el, value);
    el.dispatchEvent(new Event('change', { bubbles: true }));
  });
}

function delegationRecord(overrides: Partial<IDelegationRecord>): IDelegationRecord {
  return {
    id: 'd-1',
    delegatorId: 'u-1001',
    delegatorName: 'Admin User',
    delegateId: 'u-2',
    delegateName: 'Delegate Two',
    reason: 'Annual leave',
    startDate: '2026-01-01',
    endDate: '2026-01-10',
    status: 'Active',
    createdBy: 'u-1001',
    ...overrides,
  };
}

function directoryPerson(overrides: Partial<IDirectoryPerson>): IDirectoryPerson {
  return { id: 'u-2', displayName: 'Delegate Two', team: 'Ops', clearanceTier: 3, ...overrides };
}

describe('DelegationView — Delegation & Reassignment Backend Part 4', () => {
  beforeEach(() => {
    window.location.hash = '#/delegation';
    sessionStorage.clear();
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    act(() => {
      ReactDom.unmountComponentAtNode(container);
    });
    container.remove();
    jest.restoreAllMocks();
  });

  it(
    'renders rows from delegationService.listAll (admin) rather than the old static mock import',
    async () => {
      const services = createTestServices();
      const listAllSpy = jest.fn(() => Promise.resolve([delegationRecord({ id: 'd-live', delegateName: 'Live Wired Delegate' })]));
      services.delegationService.listAll = listAllSpy;
      const listMineSpy = jest.spyOn(services.delegationService, 'listMine');

      render(services);
      // Panel A/B both mount ag-grid's real table view (this screen's own defaultViewMode, not
      // this test's choice) — slower to settle under jsdom than the cards-view grids other
      // screens' tests exercise, hence the wider budget vs. the 5000ms Jest default.
      await waitFor(() => (container.textContent ?? '').indexOf('Live Wired Delegate') !== -1, 15000);

      expect(listAllSpy).toHaveBeenCalled();
      // DelegationView gates its query on useNav()'s identityLoading (see that file's comment) so
      // isAdmin is never queried against before it's resolved — listMine is never called at all
      // for this admin scenario, not just "called with the wrong id".
      expect(listMineSpy).not.toHaveBeenCalled();
      expect(container.textContent).toContain('Live Wired Delegate');
    },
    20000
  );

  it(
    'creating a delegation calls delegationService.create with the mapped shape and refreshes the list',
    async () => {
      const services = createTestServices();
      const listAllSpy = jest.fn(() => Promise.resolve([] as IDelegationRecord[]));
      services.delegationService.listAll = listAllSpy;
      services.delegationService.listDirectory = () =>
        Promise.resolve([
          directoryPerson({ id: 'u-1001', displayName: 'Admin User', team: 'IT', clearanceTier: 5 }),
          directoryPerson({ id: 'u-2', displayName: 'Delegate Two', team: 'Ops', clearanceTier: 3 }),
        ]);
      const createSpy = jest.fn(
        (input: { delegator: string; delegate: string; reason: string; startDate: string; endDate: string }) =>
          Promise.resolve(
            delegationRecord({
              id: 'd-new',
              delegatorId: input.delegator,
              delegateId: input.delegate,
              reason: input.reason,
              startDate: input.startDate,
              endDate: input.endDate,
            })
          )
      );
      services.delegationService.create = createSpy;

      render(services);
      await waitFor(() => !!findByText('span', 'Create Delegation'), 15000);
      click(findByText('span', 'Create Delegation')?.closest('button'));
      await settle();

      const selects = Array.from(document.querySelectorAll('select')) as HTMLSelectElement[];
      // document order, not screen order: ag-grid's own "rows per page" pagination <select> (one
      // per panel — Panel A and Panel B both render one) sorts before the modal's, since the modal
      // portals to the end of document.body. The modal's own two selects (Delegate From, Delegate
      // To) are always the last two, regardless of how many grid panels precede them.
      expect(selects.length).toBeGreaterThanOrEqual(2);
      const [delegateFromSelect, delegateToSelect] = selects.slice(-2);
      setSelectValue(delegateFromSelect, 'u-1001'); // Delegate From (admin picker)
      setSelectValue(delegateToSelect, 'u-2'); // Delegate To

      const reasonInput = document.querySelector('textarea') as HTMLTextAreaElement;
      setInputValue(reasonInput, 'Covering while on leave');

      const dateInputs = Array.from(document.querySelectorAll('input[type="date"]')) as HTMLInputElement[];
      setInputValue(dateInputs[0], '2026-02-01');
      setInputValue(dateInputs[1], '2026-02-10');

      click(findInDocByText('button', 'Save Delegation'));
      await waitFor(() => createSpy.mock.calls.length > 0);

      expect(createSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          delegator: 'u-1001',
          delegate: 'u-2',
          reason: 'Covering while on leave',
          startDate: '2026-02-01',
          endDate: '2026-02-10',
          isAdmin: true,
          attachments: [],
        })
      );

      // The list is re-queried (refresh()) after a successful create — at least once more than
      // whatever ran on initial mount.
      await waitFor(() => listAllSpy.mock.calls.length > 1);
    },
    20000
  );
});
