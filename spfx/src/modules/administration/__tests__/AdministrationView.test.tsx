import * as React from 'react';
import * as ReactDom from 'react-dom';
import { act } from 'react-dom/test-utils';
import { createTestServices, TestApp } from '../../../app/__tests__/testHarness';
import { IServiceContainer } from '../../../services/ServiceProvider';

let container: HTMLDivElement;

function renderApp(services: IServiceContainer): void {
  act(() => {
    ReactDom.render(<TestApp services={services} />, container);
  });
}

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

const has = (text: string): boolean => (container.textContent ?? '').indexOf(text) !== -1;

// Regression: assigning a CORMS_UserRoles 'SystemAdministrator' turns off the site-owner bootstrap
// (which only covers users with no role row), so admin panels must trust that role directly rather
// than only the legacy currentUser.roles: ['Administrator'] literal.
describe('AdministrationView — SystemAdministrator role unlocks the admin panels', () => {
  it('renders Provision Lists for a SystemAdministrator even when currentUser.roles is empty', async () => {
    const services = createTestServices();
    services.recordsHubService.getCurrentUser = () =>
      Promise.resolve({ id: 'u-1', displayName: 'Admin', email: 'a@b.c', roles: [] });
    services.roleService.getCurrentUserRole = () =>
      Promise.resolve({ role: 'SystemAdministrator', isProvisioned: true, isSiteOwner: false });

    window.location.hash = '#/administration/provision-lists';
    renderApp(services);

    await waitFor(() => has('Seed Sample Tasks'));
    expect(has('Provisioning is only available to System Administrators')).toBe(false);
  });

  it('denies Provision Lists for a non-admin role with no legacy Administrator literal', async () => {
    const services = createTestServices();
    services.recordsHubService.getCurrentUser = () =>
      Promise.resolve({ id: 'u-2', displayName: 'User', email: 'x@y.z', roles: [] });
    services.roleService.getCurrentUserRole = () =>
      Promise.resolve({ role: 'Recipient', isProvisioned: true, isSiteOwner: false });

    window.location.hash = '#/administration/provision-lists';
    renderApp(services);

    await waitFor(() => has('Provisioning is only available to System Administrators'));
    expect(has('Seed Sample Tasks')).toBe(false);
  });
});
