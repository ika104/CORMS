import * as React from 'react';
import * as ReactDom from 'react-dom';
import { act } from 'react-dom/test-utils';
import { createTestServices, TestApp } from '../../../app/__tests__/testHarness';
import { ITeamInboxQueryItem } from '../../../models/ITeamInbox';
import { IDirectoryPerson } from '../../../models/IDelegation';
import { IReassignInput } from '../../../services/interfaces/IReassignmentService';

// Delegation & Reassignment Backend task Part 4 — proves TeamInboxView is actually wired to
// ISubordinateInboxService (getTeamInbox), IOrgHierarchyService (getDirectReports), and
// IReassignmentService (reassign) instead of the earlier hard-coded CURRENT_SUPERVISOR_ID /
// getSubordinates() mock helpers and local useState<ITeamInboxItem[]>. Business-rule coverage
// (clearance trimming, both-direct-reports validation, ...) already lives in
// SubordinateInboxServiceCore.test.ts / ReassignmentServiceCore.test.ts — these are wiring-only
// tests.

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

// eslint-disable-next-line @rushstack/no-new-null -- Element.querySelector()'s real DOM signature returns Element | null
function click(element?: Element | null): void {
  act(() => {
    element?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
}

// ReassignModal (like every Modal in this app) portals via a Fluent Layer to document.body, and
// the Team Inbox row's ActionsMenu is a Fluent Callout — neither lives inside `container`.
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

function queryItem(overrides: Partial<ITeamInboxQueryItem>): ITeamInboxQueryItem {
  return {
    id: 'c-1',
    referenceNumber: 'REF-001',
    subject: 'Live Wired Correspondence',
    type: 'Letter',
    direction: 'Incoming',
    status: 'Registered',
    priority: 'Normal',
    securityTier: 2,
    department: 'Ops',
    assignedTo: 'u-owner',
    createdAt: '2026-01-01T00:00:00.000Z',
    ownerId: 'u-owner',
    displayStatus: 'New',
    ...overrides,
  };
}

function directoryPerson(overrides: Partial<IDirectoryPerson>): IDirectoryPerson {
  return { id: 'u-owner', displayName: 'Owner Person', team: 'Ops', clearanceTier: 3, ...overrides };
}

describe('TeamInboxView — Delegation & Reassignment Backend Part 4', () => {
  beforeEach(() => {
    window.location.hash = '#/team-inbox';
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
    'renders rows from subordinateInboxService.getTeamInbox',
    async () => {
      const services = createTestServices();
      services.orgHierarchyService.getDirectReports = jest.fn(() =>
        Promise.resolve([
          directoryPerson({ id: 'u-owner', displayName: 'Owner Person', clearanceTier: 3 }),
          directoryPerson({ id: 'u-target', displayName: 'Target Person', clearanceTier: 4 }),
        ])
      );
      const getTeamInboxSpy = jest.fn(() => Promise.resolve([queryItem({})]));
      services.subordinateInboxService.getTeamInbox = getTeamInboxSpy;

      render(services);
      // getTeamInbox takes no arguments — the acting supervisor is resolved server-side (see
      // ISubordinateInboxService.getTeamInbox) — so there's no identity race to wait out here;
      // just wait for the row to render.
      await waitFor(() => (container.textContent ?? '').indexOf('Live Wired Correspondence') !== -1);

      expect(getTeamInboxSpy).toHaveBeenCalledWith();
      expect(container.textContent).toContain('Live Wired Correspondence');
      // ownerName resolved via orgHierarchyService.getDirectReports, not a mockData directory lookup.
      expect(container.textContent).toContain('Owner Person');
    },
    20000
  );

  it(
    'confirming a reassign calls reassignmentService.reassign with the expected IReassignInput shape',
    async () => {
      const services = createTestServices();
      services.orgHierarchyService.getDirectReports = jest.fn(() =>
        Promise.resolve([
          directoryPerson({ id: 'u-owner', displayName: 'Owner Person', clearanceTier: 3 }),
          directoryPerson({ id: 'u-target', displayName: 'Target Person', clearanceTier: 4 }),
        ])
      );
      const getTeamInboxSpy = jest.fn(() => Promise.resolve([queryItem({})]));
      services.subordinateInboxService.getTeamInbox = getTeamInboxSpy;
      const reassignSpy = jest.fn((_input: IReassignInput) => Promise.resolve());
      services.reassignmentService.reassign = reassignSpy;

      render(services);
      await waitFor(() => (container.textContent ?? '').indexOf('Live Wired Correspondence') !== -1);

      const actionsTrigger = container.querySelector('[aria-label="Item actions"]');
      expect(actionsTrigger).toBeTruthy();
      click(actionsTrigger);
      await settle();

      click(findInDocByText('[role="menuitem"]', 'Reassign'));
      await waitFor(() => !!findInDocByText('div', 'Reassign Correspondence'));

      const selects = Array.from(document.querySelectorAll('select')) as HTMLSelectElement[];
      // The last <select> in document order is the modal's "Reassign To" picker (the page's own
      // "Viewing" select is mounted first; the modal portals to the end of document.body).
      const reassignToSelect = selects[selects.length - 1];
      setSelectValue(reassignToSelect, 'u-target');

      const reasonInput = document.querySelector('textarea') as HTMLTextAreaElement;
      setInputValue(reasonInput, 'Handing off while OOO');

      click(findInDocByText('button', 'Reassign'));
      await waitFor(() => reassignSpy.mock.calls.length > 0);

      const [input] = reassignSpy.mock.calls[0];
      // No supervisorId: the acting supervisor is resolved server-side (see IReassignmentService).
      expect(input).toEqual({
        correspondenceId: 'c-1',
        fromUserId: 'u-owner',
        toUserId: 'u-target',
        reason: 'Handing off while OOO',
      });
    },
    20000
  );

  it(
    'CMS-040 Part 10: clicking a row navigates to the correspondence detail screen',
    async () => {
      const services = createTestServices();
      services.orgHierarchyService.getDirectReports = jest.fn(() => Promise.resolve([directoryPerson({})]));
      services.subordinateInboxService.getTeamInbox = jest.fn(() => Promise.resolve([queryItem({})]));

      render(services);
      await waitFor(() => (container.textContent ?? '').indexOf('Live Wired Correspondence') !== -1);

      click(container.querySelector('[role="button"]'));

      expect(window.location.hash).toBe('#/correspondence/c-1');
    },
    20000
  );
});
