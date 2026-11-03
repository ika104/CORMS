import * as React from 'react';
import * as ReactDom from 'react-dom';
import { act } from 'react-dom/test-utils';
import { createTestServices, TestApp } from '../../../../app/__tests__/testHarness';
import { SCHEMAS } from '../../../../provisioning/listSchemas';
import { IListStatus, IProvisionEvent } from '../../../../services/interfaces/IProvisioningService';

// Smoke coverage for the Sprint 1 "Provision Lists" admin screen: role gating, the summary
// table's not-created/exists/fields-incomplete states, and the live log + tally after a run.

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

function click(element?: Element): void {
  act(() => {
    element?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
}

function findByText(selector: string, text: string): Element | undefined {
  return Array.from(container.querySelectorAll(selector)).filter(
    (el) => (el.textContent ?? '').indexOf(text) !== -1
  )[0];
}

// ConfirmDialog wraps Fluent UI's Modal, which portals via a Fluent Layer to document.body, not
// `container` — used for the Seed Sample Tasks confirmation dialog below.
function findInDocByText(selector: string, text: string): Element | undefined {
  return Array.from(document.querySelectorAll(selector)).filter(
    (el) => (el.textContent ?? '').indexOf(text) !== -1
  )[0];
}

describe('Provision Lists panel', () => {
  beforeEach(() => {
    window.location.hash = '';
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

  it('renders the schema summary table with a Not Created badge before anything is provisioned', async () => {
    const services = createTestServices();
    services.provisioningService.getStatus = () =>
      Promise.resolve(
        SCHEMAS.map((schema): IListStatus => ({
          schemaTitle: schema.title,
          resolvedTitle: schema.title,
          exists: false,
          fieldCount: 0,
          expectedFieldCount: schema.fields.length,
        }))
      );

    window.location.hash = '#/administration/provision-lists';
    render(services);
    await waitFor(() => (container.textContent ?? '').indexOf('CORMS_AdminConfig') !== -1);

    expect(container.textContent).toContain('Provision SharePoint Lists');
    expect(container.textContent).toContain('CORMS_Correspondence');
    expect(findByText('span', 'Not Created')).toBeDefined();
  });

  it('streams a live log and shows the final tally after Create / Update All Lists', async () => {
    const services = createTestServices();
    services.provisioningService.getStatus = () =>
      Promise.resolve(
        SCHEMAS.map((schema): IListStatus => ({
          schemaTitle: schema.title,
          resolvedTitle: schema.title,
          exists: false,
          fieldCount: 0,
          expectedFieldCount: schema.fields.length,
        }))
      );
    services.provisioningService.provisionAll = (schemas, onEvent: (event: IProvisionEvent) => void) => {
      schemas.forEach((schema) =>
        onEvent({ schemaTitle: schema.title, step: 'list', detail: schema.title, status: 'created' })
      );
      return Promise.resolve({ created: schemas.length, exists: 0, removed: 0, errors: 0 });
    };

    window.location.hash = '#/administration/provision-lists';
    render(services);
    await waitFor(() => (container.textContent ?? '').indexOf('CORMS_AdminConfig') !== -1);

    click(findByText('button', 'Create / Update All Lists'));
    await settle();

    expect(container.textContent).toContain('CORMS_Correspondence — created');
    expect(container.textContent).toContain(`Created: ${SCHEMAS.length}`);
  });

  it('renders an access-denied state for a user without the Administrator role', async () => {
    const services = createTestServices();
    services.recordsHubService.getCurrentUser = () =>
      Promise.resolve({ id: 'u-2', displayName: 'No Roles', email: 'x@y.z', roles: [] });

    window.location.hash = '#/administration/provision-lists';
    render(services);
    await waitFor(() => (container.textContent ?? '').indexOf('Provisioning is only available') !== -1);

    expect(container.textContent).toContain('Provisioning is only available');
    expect(findByText('button', 'Create / Update All Lists')).toBeUndefined();
  });

  // Part 5 — "Seed Sample Tasks" is a distinct action from "Create / Update All Lists": its own
  // button, its own confirmation copy, gated by the same Administrator-only screen access above.
  describe('Part 5 — Seed Sample Tasks', () => {
    it('is a distinct button from Create / Update All Lists, and does not run provisioning', async () => {
      const services = createTestServices();
      const provisionAllSpy = jest.fn(() =>
        Promise.resolve({ created: 0, exists: 0, removed: 0, errors: 0 })
      );
      services.provisioningService.provisionAll = provisionAllSpy;
      const seedSpy = jest.fn(() => Promise.resolve({ inserted: 8, skippedExisting: 0, total: 8 }));
      services.seedTasksService.run = seedSpy;

      window.location.hash = '#/administration/provision-lists';
      render(services);
      await waitFor(() => (container.textContent ?? '').indexOf('Seed Sample Tasks') !== -1);

      expect(findByText('button', 'Seed Sample Tasks')).toBeDefined();
      expect(findByText('button', 'Create / Update All Lists')).toBeDefined();

      click(findByText('button', 'Seed Sample Tasks'));
      await settle();

      expect(provisionAllSpy).not.toHaveBeenCalled();
    });

    it('shows a confirmation dialog before running, and only calls seedTasksService.run() after confirming', async () => {
      const services = createTestServices();
      const seedSpy = jest.fn(() => Promise.resolve({ inserted: 8, skippedExisting: 0, total: 8 }));
      services.seedTasksService.run = seedSpy;

      window.location.hash = '#/administration/provision-lists';
      render(services);
      await waitFor(() => (container.textContent ?? '').indexOf('Seed Sample Tasks') !== -1);

      click(findByText('button', 'Seed Sample Tasks'));
      await settle();

      // ConfirmDialog wraps Fluent UI's Modal, which portals to document.body, not `container`.
      expect(document.body.textContent).toContain('This adds sample task data for testing');
      expect(seedSpy).not.toHaveBeenCalled();

      click(findInDocByText('button', 'Add Sample Tasks'));
      await waitFor(() => seedSpy.mock.calls.length > 0);

      expect(seedSpy).toHaveBeenCalledTimes(1);
      await settle();
      expect(container.textContent).toContain('Added 8 sample task');
    });

    it('cancelling the confirmation dialog never calls seedTasksService.run()', async () => {
      const services = createTestServices();
      const seedSpy = jest.fn(() => Promise.resolve({ inserted: 8, skippedExisting: 0, total: 8 }));
      services.seedTasksService.run = seedSpy;

      window.location.hash = '#/administration/provision-lists';
      render(services);
      await waitFor(() => (container.textContent ?? '').indexOf('Seed Sample Tasks') !== -1);

      click(findByText('button', 'Seed Sample Tasks'));
      await settle();
      click(findInDocByText('button', 'Cancel'));
      await settle();

      expect(seedSpy).not.toHaveBeenCalled();
    });

    it('surfaces a clear error when the seed run fails (e.g. the schema-confirmation check rejects)', async () => {
      const services = createTestServices();
      services.seedTasksService.run = () =>
        Promise.reject(new Error('CORMS_Tasks is missing 1 expected column'));

      window.location.hash = '#/administration/provision-lists';
      render(services);
      await waitFor(() => (container.textContent ?? '').indexOf('Seed Sample Tasks') !== -1);

      click(findByText('button', 'Seed Sample Tasks'));
      await settle();
      click(findInDocByText('button', 'Add Sample Tasks'));
      await waitFor(() => (container.textContent ?? '').indexOf("Couldn't seed sample tasks") !== -1);

      expect(container.textContent).toContain('CORMS_Tasks is missing 1 expected column');
    });
  });
});
