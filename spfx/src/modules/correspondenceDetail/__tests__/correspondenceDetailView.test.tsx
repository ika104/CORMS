import * as React from 'react';
import * as ReactDom from 'react-dom';
import { act } from 'react-dom/test-utils';
import { createTestServices, TestApp } from '../../../app/__tests__/testHarness';
import { RoleServiceMock } from '../../../services/role/RoleService.mock';

// Smoke coverage for the consolidated correspondence detail screen (CMS-040 and friends):
// entry-point tab selection, conditional Thread/Reminder tabs, per-tab audit logging, and the
// clearance-gated access-denied state.

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
  return Array.from(container.querySelectorAll(selector)).filter((el) => (el.textContent ?? '').indexOf(text) !== -1)[0];
}

describe('Correspondence detail view', () => {
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

  it('opens a standalone incoming item on the Details tab without Thread/Reminder tabs', async () => {
    window.location.hash = '#/correspondence/C-2024-002';
    render();
    await waitFor(() => (container.textContent ?? '').indexOf('Contract Renewal Request') !== -1);

    // Standalone item (no chainId) and incoming (not sent) — Thread and Reminder are absent.
    expect(findByText('button', 'Thread')).toBeUndefined();
    expect(findByText('button', 'Reminder')).toBeUndefined();
    expect(findByText('button', 'Details')).toBeDefined();
    expect(findByText('button', 'Files')).toBeDefined();

    // Files tab shows the mocked attachment.
    click(findByText('button', 'Files'));
    await settle();
    expect(container.textContent).toContain('contract_renewal_request.pdf');
    expect(container.textContent).toContain('Main');
  });

  it('shows Thread and Reminder tabs for a sent item that belongs to a chain', async () => {
    window.location.hash = '#/correspondence/C-2024-001';
    render();
    await waitFor(() => (container.textContent ?? '').indexOf('Annual Report Submission to Board') !== -1);
    await waitFor(() => findByText('button', 'Thread') !== undefined);

    expect(findByText('button', 'Thread')).toBeDefined();
    expect(findByText('button', 'Reminder')).toBeDefined();

    click(findByText('button', 'Thread'));
    await settle();
    expect(container.textContent).toContain('CHN-2026-1234');
    expect(container.textContent).toContain('RE: Annual Report Submission to Board');
  });

  it('logs a mock audit row for every tab switch', async () => {
    window.location.hash = '#/correspondence/C-2024-002';
    render();
    await waitFor(() => (container.textContent ?? '').indexOf('Contract Renewal Request') !== -1);

    click(findByText('button', 'Files'));
    await settle();
    click(findByText('button', 'Audit'));
    await settle();

    expect(container.textContent).toContain('Viewed Correspondence');
    expect(container.textContent).toContain('Viewed Attachments');
    expect(container.textContent).toContain('Viewed Audit');
  });

  it('shows the watermark toggle on Preview, and keeps file-plan context in its own File Plan tab (CMS-027)', async () => {
    window.location.hash = '#/correspondence/C-2024-002';
    render();
    await waitFor(() => (container.textContent ?? '').indexOf('Contract Renewal Request') !== -1);

    // Preview is the default landing tab. CMS-051: C-2024-002 is a received (incoming) Secret-tier
    // item, so the confidentiality watermark is applied by default (AC1) and locked on because its
    // classification doesn't permit removing it (AC5) — the control reads "Required by classification".
    expect(container.textContent).toContain('Required by classification');
    expect(container.textContent).toContain('Open Document');

    // The Details tab shows the classification value but NOT the file-plan panel (CMS-027 AC3 puts
    // the enclosing File + file-plan position in its own tab, not inline under Details).
    click(findByText('button', 'Details'));
    await settle();
    expect(container.textContent).not.toContain('File-plan position');

    // The dedicated File Plan tab shows the enclosing business-activity File and its position.
    click(findByText('button', 'File Plan'));
    await settle();
    expect(container.textContent).toContain('File-plan position');
    expect(container.textContent).toContain('Vendor Contracts');
  });

  it('AC9: renders an access-denied state instead of tabs, and leaks no item content, when clearance is insufficient', async () => {
    const services = createTestServices();
    services.recordsHubService.getCurrentUser = () =>
      Promise.resolve({ id: 'u-low', displayName: 'Low Clearance', email: 'x@y.z', roles: [], clearanceTier: 1 });
    // A genuinely low-clearance viewer must be a NON-admin: a SystemAdministrator resolves to the
    // maximum clearance tier (useNav.withResolvedAdminRole, matching the CORMS services), so the
    // access-denied scenario only holds for a lower CORMS role.
    services.roleService = new RoleServiceMock({
      role: 'Recipient',
      isProvisioned: true,
      department: 'Records',
      isSiteOwner: false,
      clearanceTier: 1,
    });

    // C-2024-001 is Top Secret (tier 5) — well above this user's clearance.
    window.location.hash = '#/correspondence/C-2024-001';
    render(services);
    await waitFor(() => (container.textContent ?? '').indexOf('Access Denied') !== -1);

    expect(container.textContent).toContain('Access Denied');
    expect(findByText('button', 'Details')).toBeUndefined();

    // CMS-040 AC9 is "an access-denied state and no content" — the header used to render above
    // the denial panel, putting a Top Secret item's subject and reference number into the DOM of
    // a tier-1 viewer. No tab strip and no grouped actions menu either.
    const rendered = container.textContent ?? '';
    expect(rendered).not.toContain('Annual Report Submission to Board');
    expect(rendered).not.toContain('OQ8-OPS-RPT-25-001');
    expect(container.querySelector('h1')).toBeNull();
    expect(findByText('button', 'Preview')).toBeUndefined();
    expect(findByText('button', 'Timeline')).toBeUndefined();
    expect(container.querySelector('[aria-label="Item actions"]')).toBeNull();
  });
});
