import * as React from 'react';
import * as ReactDom from 'react-dom';
import { act } from 'react-dom/test-utils';
import { ServiceProvider, IServiceContainer } from '../../../services/ServiceProvider';
import { createTestServices } from '../../../app/__tests__/testHarness';
import { AppShellProvider } from '../../AppShellContext';
import { ICurrentUserRole } from '../../../models/ICormsRole';
import { IUser } from '../../../models/IUser';
import { useNav, IUseNavResult } from '../useNav';

let container: HTMLDivElement;

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
});

afterEach(() => {
  ReactDom.unmountComponentAtNode(container);
  container.remove();
});

const BASE_USER: IUser = { id: '1', displayName: 'Test User', email: 't@example.com', roles: [] };

function stubRecordsHubService(user: IUser): IServiceContainer['recordsHubService'] {
  return {
    getNavConfig: () => Promise.resolve({ groups: [] }),
    getCurrentUser: () => Promise.resolve(user),
    getMyCorrespondence: () => Promise.resolve([]),
  };
}

function renderUseNav(resultRef: { current: IUseNavResult | undefined }, services: IServiceContainer): void {
  const Harness: React.FC = () => {
    const result = useNav();
    resultRef.current = result;
    return null;
  };
  act(() => {
    ReactDom.render(
      <ServiceProvider services={services}>
        <AppShellProvider>
          <Harness />
        </AppShellProvider>
      </ServiceProvider>,
      container
    );
  });
}

// NavigationServiceMock.getMenuTree() (used unmodified by every test below via
// createTestServices()) has a real 150ms simulated-latency setTimeout — a microtask-only flush
// isn't enough to let useNav()'s Promise.all resolve.
async function flush(): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 250));
  });
}

function servicesWithRole(role: ICurrentUserRole): IServiceContainer {
  const base = createTestServices();
  return {
    ...base,
    recordsHubService: stubRecordsHubService({ ...BASE_USER }),
    roleService: { getCurrentUserRole: () => Promise.resolve(role) },
  };
}

describe('useNav — bootstrap admin door onto a live tenant with no CORMS_UserRoles rows yet', () => {
  it('grants Administrator when the resolved role is SystemAdministrator', async () => {
    const resultRef: { current: IUseNavResult | undefined } = { current: undefined };
    renderUseNav(
      resultRef,
      servicesWithRole({ role: 'SystemAdministrator', isProvisioned: true, isSiteOwner: false })
    );

    await flush();

    expect(resultRef.current?.currentUser?.roles).toContain('Administrator');
  });

  it('grants Administrator to an unprovisioned SharePoint Owners-group member (fresh tenant bootstrap)', async () => {
    const resultRef: { current: IUseNavResult | undefined } = { current: undefined };
    renderUseNav(resultRef, servicesWithRole({ role: 'Recipient', isProvisioned: false, isSiteOwner: true }));

    await flush();

    expect(resultRef.current?.currentUser?.roles).toContain('Administrator');
  });

  it('does not grant Administrator to a non-owner with no CORMS_UserRoles row', async () => {
    const resultRef: { current: IUseNavResult | undefined } = { current: undefined };
    renderUseNav(resultRef, servicesWithRole({ role: 'Recipient', isProvisioned: false, isSiteOwner: false }));

    await flush();

    expect(resultRef.current?.currentUser?.roles).not.toContain('Administrator');
  });

  it('a deliberately-assigned non-admin role wins over leftover owner-group membership', async () => {
    const resultRef: { current: IUseNavResult | undefined } = { current: undefined };
    renderUseNav(resultRef, servicesWithRole({ role: 'Reviewer', isProvisioned: true, isSiteOwner: true }));

    await flush();

    expect(resultRef.current?.currentUser?.roles).not.toContain('Administrator');
  });

  it('does not duplicate Administrator when RecordsHub identity already carries it', async () => {
    const resultRef: { current: IUseNavResult | undefined } = { current: undefined };
    const base = createTestServices();
    const services: IServiceContainer = {
      ...base,
      recordsHubService: stubRecordsHubService({ ...BASE_USER, roles: ['Administrator'] }),
      roleService: { getCurrentUserRole: () => Promise.resolve({ role: 'SystemAdministrator', isProvisioned: true, isSiteOwner: false }) },
    };
    renderUseNav(resultRef, services);

    await flush();

    expect(resultRef.current?.currentUser?.roles).toEqual(['Administrator']);
  });

  // The real ssloman failure: CORMS_NavigationMenu doesn't exist yet on a fresh tenant, so
  // getMenuTree() rejects. Identity + role resolution must survive that (they used to be sunk by a
  // shared Promise.all), so the site owner still gets 'Administrator' and can reach Administration
  // to provision the missing lists in the first place.
  it('still grants the site owner Administrator when getMenuTree() rejects (nav list not provisioned)', async () => {
    const resultRef: { current: IUseNavResult | undefined } = { current: undefined };
    const base = createTestServices();
    const services: IServiceContainer = {
      ...base,
      navigationService: {
        ...base.navigationService,
        getMenuTree: () => Promise.reject(new Error('404 — CORMS_NavigationMenu not provisioned')),
      },
      recordsHubService: stubRecordsHubService({ ...BASE_USER }),
      roleService: { getCurrentUserRole: () => Promise.resolve({ role: 'Recipient', isProvisioned: false, isSiteOwner: true }) },
    };
    renderUseNav(resultRef, services);

    await flush();

    // The nav rejection no longer sinks identity + admin reconciliation — the site owner still
    // gets 'Administrator' (so NavRail's defaultNavConfig fallback shows Administration) and the
    // hook settles rather than hanging in a loading state.
    expect(resultRef.current?.currentUser?.roles).toContain('Administrator');
    expect(resultRef.current?.currentRole).toBe('Recipient');
    expect(resultRef.current?.isLoading).toBe(false);
  });
});
