import * as React from 'react';
import * as ReactDom from 'react-dom';
import { act } from 'react-dom/test-utils';
import { createTestServices, TestApp } from './testHarness';
import { CACHE_VERSION } from '../../services/cache/CacheService';

// Smoke coverage for the TASK-01 acceptance criteria that can be asserted headlessly:
// routing, nav rail behaviour, i18n + RTL, and theming via CSS custom properties.
// Feature behaviour lands with the feature tasks.

let container: HTMLDivElement;

function render(): void {
  act(() => {
    ReactDom.render(<TestApp />, container);
  });
}

/** Flushes the mock services' simulated latency plus the resulting state updates. */
async function settle(): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 250));
  });
}

/**
 * Polls until `predicate` holds, flushing timers and microtasks between attempts.
 *
 * Routes are lazy-loaded and My Correspondence pulls in AG Grid, so its chunk resolves
 * on its own schedule — a single fixed sleep is flaky here in a way polling is not.
 */
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

/** Resolves once the My Correspondence dashboard has replaced its loading state. */
function dashboardReady(text: string): () => boolean {
  return () => (container.textContent ?? '').indexOf(text) !== -1;
}

function click(element?: Element): void {
  act(() => {
    element?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
}

/** Rail controls are icon-only when collapsed, so they are addressed by aria-label. */
function byLabel(label: string): Element | undefined {
  return container.querySelector(`[aria-label="${label}"]`) ?? undefined;
}

function findByText(selector: string, text: string): Element | undefined {
  return Array.from(container.querySelectorAll(selector)).filter(
    (el) => (el.textContent ?? '').indexOf(text) !== -1
  )[0];
}

describe('CORMS application shell', () => {
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

  it('redirects the root route to My Correspondence and renders the dashboard', async () => {
    render();
    await waitFor(dashboardReady('MASTER CORRESPONDENCE LOG'));

    expect(window.location.hash).toBe('#/my-correspondence');
    expect(container.textContent).toContain('MASTER CORRESPONDENCE LOG');
  });

  it('renders an unknown route as NotFound without reloading', async () => {
    window.location.hash = '#/does-not-exist';
    render();
    await settle();

    expect(container.textContent).toContain('Page not found');
  });

  it('renders nav items with expandable children', async () => {
    render();
    await settle();

    expect(container.textContent).toContain('My Correspondence');
    expect(container.textContent).toContain('My Tasks');

    // "Inbox / Sent" is a parent with collapsible children.
    const inboxParent = findByText('button', 'Inbox / Sent');
    expect(inboxParent).toBeDefined();

    // Expand children.
    click(inboxParent);
    expect(inboxParent?.getAttribute('aria-expanded')).toBe('true');
    expect(container.textContent).toContain('Drafts');

    // Collapse children.
    click(inboxParent);
    expect(inboxParent?.getAttribute('aria-expanded')).toBe('false');
    expect(findByText('a', 'Drafts')).toBeUndefined();
  });

  it('opens Delegation at its first accessible child destination', async () => {
    render();
    await settle();

    // Delegation has no route of its own, so selecting its parent takes the user to its
    // first accessible destination and leaves that nested item visible and active.
    const delegationParent = findByText('button', 'Delegation');
    expect(delegationParent).toBeDefined();
    expect(delegationParent?.querySelector('.chevron')?.textContent).toBe('▸');
    expect(findByText('a', 'Team Inbox')).toBeUndefined();

    click(delegationParent);
    expect(delegationParent?.getAttribute('aria-expanded')).toBe('true');
    expect(window.location.hash).toBe('#/delegation');
    expect(container.textContent).toContain('Delegation Management');
    expect(container.textContent).toContain('Team Inbox');
    expect(findByText('a', 'Delegation Management')?.className).toContain('active');
  });

  it('hides nav entries the mock role cannot access', async () => {
    render();
    await settle();
    // The mock user is an Administrator, so both role-gated entries are present.
    expect(container.textContent).toContain('Administration');
    expect(container.textContent).toContain('Audit Trail');

    // An empty role set must remove them entirely. Both role signals useNav() reconciles have to
    // say "not an admin" — RecordsHub's legacy roles array, and the CORMS_UserRoles-backed
    // CormsRole (RoleService), whose default mock is SystemAdministrator and would otherwise
    // re-grant 'Administrator' via useNav()'s bootstrap-admin reconciliation (see useNav.ts).
    sessionStorage.clear();
    act(() => {
      ReactDom.unmountComponentAtNode(container);
    });
    const services = createTestServices();
    services.recordsHubService.getCurrentUser = () =>
      Promise.resolve({ id: 'u-2', displayName: 'No Roles', email: 'x@y.z', roles: [] });
    services.roleService.getCurrentUserRole = () =>
      Promise.resolve({ role: 'Recipient', isProvisioned: true, isSiteOwner: false });
    act(() => {
      ReactDom.render(<TestApp services={services} />, container);
    });
    await settle();
    expect(container.textContent).not.toContain('Audit Trail');
  });

  it('pins and unpins the rail', async () => {
    render();
    await settle();

    // Rail starts expanded and pinned.
    const unpinBtn = byLabel('Unpin navigation');
    expect(unpinBtn?.getAttribute('aria-pressed')).toBe('true');

    // Unpin collapses the rail.
    click(unpinBtn);
    expect(byLabel('Expand navigation')).toBeDefined();
  });

  it('hover-expands while unpinned and collapses on pointer-leave', async () => {
    render();
    await settle();

    const rail = container.querySelector('nav') as HTMLElement;
    // Unpinning restores the collapsed, icons-only state.
    click(byLabel('Unpin navigation'));
    expect(findByText('a', 'My Correspondence')).toBeUndefined();

    // React 17 delegates onMouseEnter/onMouseLeave to mouseover/mouseout.
    act(() => {
      rail.dispatchEvent(new MouseEvent('mouseover', { bubbles: true, relatedTarget: document.body }));
    });
    expect(findByText('a', 'My Correspondence')).toBeDefined();

    act(() => {
      rail.dispatchEvent(new MouseEvent('mouseout', { bubbles: true, relatedTarget: document.body }));
    });
    expect(findByText('a', 'My Correspondence')).toBeUndefined();
  });

  it('switches language and direction at runtime and persists the choice', async () => {
    render();
    await settle();

    const appRoot = container.firstElementChild as HTMLElement;
    expect(appRoot.getAttribute('dir')).toBe('ltr');
    // The SPA must not flip the direction of the hosting SharePoint page.
    expect(document.documentElement.getAttribute('dir')).toBeNull();

    click(byLabel('Switch language'));
    await waitFor(dashboardReady('سجل المراسلات الرئيسي'));

    expect((container.firstElementChild as HTMLElement).getAttribute('dir')).toBe('rtl');
    expect(container.textContent).toContain('سجل المراسلات الرئيسي');
    expect(sessionStorage.getItem(`corms:${CACHE_VERSION}:corms.locale:language`)).toBe('"ar"');
  });

  it('publishes theme tokens as CSS custom properties', async () => {
    render();
    await settle();

    const root = document.documentElement;
    expect(root.style.getPropertyValue('--corms-brand-navy')).toBe('#1F3864');
    expect(root.style.getPropertyValue('--corms-rail-background')).toBe('#F3F2F1');
  });

  it('does not expose a dark-mode toggle in the nav rail', async () => {
    render();
    await settle();

    expect(byLabel('Switch theme')).toBeUndefined();
  });

  it('caches the nav config for the session so it is not refetched', async () => {
    render();
    await settle();

    expect(sessionStorage.getItem(`corms:${CACHE_VERSION}:corms.nav:navConfig`)).toContain(
      'nav.myCorrespondence'
    );

    const services = createTestServices();
    const getNavConfig = jest.fn(services.recordsHubService.getNavConfig);
    services.recordsHubService.getNavConfig = getNavConfig;

    act(() => {
      ReactDom.unmountComponentAtNode(container);
      ReactDom.render(<TestApp services={services} />, container);
    });
    await settle();

    expect(getNavConfig).not.toHaveBeenCalled();
  });
});
