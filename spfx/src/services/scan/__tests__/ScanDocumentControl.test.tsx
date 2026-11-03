import * as React from 'react';
import * as ReactDom from 'react-dom';
import { act } from 'react-dom/test-utils';
import { IScannerClient, IScanQualityInfo, ScanDocumentControl } from '../ScanDocumentControl';
import { IScanPage, IScanResult } from '../dynamsoftTypes';
import { ServiceProvider } from '../../ServiceProvider';
import { createTestServices } from '../../../app/__tests__/testHarness';

// CMS-002 — "missing license key renders the documented disabled state rather than throwing", plus
// the scan -> quality gate -> persist path itself, exercised through a hand-written IScannerClient
// fake (the real DynamsoftScannerClient is browser/camera-only and is never imported by a test).
// Mounts ScanDocumentControl directly (not the whole app shell) with a ServiceProvider stub, so
// this stays a fast, targeted component test rather than a full-route render.

let container: HTMLDivElement;

function page(overrides: Partial<IScanPage> = {}): IScanPage {
  return { dpi: 600, format: 'PDF/A', contentCoverage: 0.4, blob: new Blob(), ...overrides };
}

function fakeScanner(result: IScanResult): IScannerClient {
  return { scan: jest.fn(async () => result) };
}

interface IRenderOptions {
  onScanned?: (result: IScanResult, quality: IScanQualityInfo, overrideReason?: string) => void | Promise<void>;
  scannerClient?: IScannerClient;
}

function render(services: ReturnType<typeof createTestServices>, options: IRenderOptions = {}): void {
  act(() => {
    ReactDom.render(
      <ServiceProvider services={services}>
        <ScanDocumentControl onScanned={options.onScanned ?? (() => undefined)} scannerClient={options.scannerClient}>
          {({ onClick, notConfigured, notConfiguredMessage }) => (
            <button type="button" disabled={notConfigured} onClick={onClick}>
              {notConfigured ? notConfiguredMessage : 'Scan Document'}
            </button>
          )}
        </ScanDocumentControl>
      </ServiceProvider>,
      container
    );
  });
}

function withLicenseKey(): ReturnType<typeof createTestServices> {
  const services = createTestServices();
  services.adminConfigService.getEntries = () =>
    Promise.resolve([{ key: 'Dynamsoft_License_Key', value: 'real-license-key', description: '' }]);
  return services;
}

async function clickScan(): Promise<void> {
  await act(async () => {
    container.querySelector('button')?.click();
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

async function settle(): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 250));
  });
}

describe('CMS-002 — ScanDocumentControl', () => {
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

  it('renders a disabled trigger with the not-configured message when Dynamsoft_License_Key is empty, without throwing', async () => {
    const services = createTestServices();
    services.adminConfigService.getEntries = () =>
      Promise.resolve([{ key: 'Dynamsoft_License_Key', value: '', description: '' }]);

    expect(() => render(services)).not.toThrow();
    await settle();

    const button = container.querySelector('button');
    expect(button?.disabled).toBe(true);
    expect(button?.textContent).toBeTruthy();
    expect(button?.textContent).not.toBe('Scan Document');
  });

  it('renders an enabled trigger once a license key is configured', async () => {
    render(withLicenseKey());
    await settle();

    const button = container.querySelector('button');
    expect(button?.disabled).toBe(false);
  });

  it('a scan that clears the quality gate calls onScanned with the worst-case DPI and no override reason', async () => {
    const onScanned = jest.fn();
    render(withLicenseKey(), {
      onScanned,
      scannerClient: fakeScanner({ pages: [page({ dpi: 600 }), page({ dpi: 400 })], fileName: 'scan.pdf' }),
    });
    await settle();

    await clickScan();

    expect(onScanned).toHaveBeenCalledTimes(1);
    expect(onScanned.mock.calls[0][1]).toEqual({ scannedDPI: 400, qualityPassed: true });
    expect(onScanned.mock.calls[0][2]).toBeUndefined();
  });

  it('AC8: a scan that fails the gate blocks registration until an override reason is given', async () => {
    const onScanned = jest.fn();
    render(withLicenseKey(), {
      onScanned,
      scannerClient: fakeScanner({ pages: [page({ dpi: 150 })], fileName: 'low-res.pdf' }),
    });
    await settle();

    await clickScan();

    // Blocked: the override modal is up and nothing has been handed to the persistence layer yet.
    expect(onScanned).not.toHaveBeenCalled();
    const textarea = container.ownerDocument.querySelector('textarea');
    expect(textarea).toBeTruthy();
  });

  it('a zero-page result is treated as a cancelled scan, not a vacuously passing one', async () => {
    const onScanned = jest.fn();
    render(withLicenseKey(), { onScanned, scannerClient: fakeScanner({ pages: [], fileName: 'empty.pdf' }) });
    await settle();

    await clickScan();

    expect(onScanned).not.toHaveBeenCalled();
  });

  it('a failed persist surfaces an error instead of a "Scanned successfully" toast, and never rejects unhandled', async () => {
    const unhandled: unknown[] = [];
    const onUnhandled = (event: PromiseRejectionEvent): void => {
      unhandled.push(event.reason);
    };
    window.addEventListener('unhandledrejection', onUnhandled);
    const services = withLicenseKey();
    try {
      render(services, {
        onScanned: () => Promise.reject(new Error('CORMS_Attachments write failed')),
        scannerClient: fakeScanner({ pages: [page()], fileName: 'scan.pdf' }),
      });
      await settle();

      await clickScan();
      await settle();

      const text = container.ownerDocument.body.textContent ?? '';
      expect(text).toContain('scan.persistFailed');
      expect(text).not.toContain('scan.success');
      expect(unhandled).toHaveLength(0);
    } finally {
      window.removeEventListener('unhandledrejection', onUnhandled);
    }
  });
});
