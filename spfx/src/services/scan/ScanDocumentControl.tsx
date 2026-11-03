import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { useServices } from '../ServiceProvider';
import { Modal } from '../../components/common/Modal';
import { Button } from '../../components/common/Button';
import { Spinner } from '../../components/common/Spinner';
import { DynamsoftScannerClient, IDynamsoftScanOptions } from './DynamsoftScannerClient';
import { runQualityGate, IQualityGateResult } from './scanQualityGate';
import { IScanResult } from './dynamsoftTypes';
import styles from './ScanDocumentControl.module.scss';

const DYNAMSOFT_LICENSE_KEY_ENTRY = 'Dynamsoft_License_Key';
const SUCCESS_TOAST_DURATION_MS = 3000;

export interface IScanQualityInfo {
  /** Worst-case DPI across every scanned page — one attachment row is what CMS-002's fields
   * (ScannedDPI etc.) describe, so a multi-page scan is summarized by its weakest page. */
  scannedDPI: number;
  qualityPassed: boolean;
}

export interface IScanDocumentControlRenderProps {
  onClick: () => void;
  scanning: boolean;
  /** True once the Dynamsoft license key has been confirmed empty — render a disabled/"not
   * configured" trigger rather than a clickable one (CMS-002: no throw, no silent no-op). */
  notConfigured: boolean;
  /** Translated hint text for the not-configured state — each call site places this wherever
   * fits its own layout (button tooltip, dropzone helper text, ...). */
  notConfiguredMessage: string;
}

/** The slice of DynamsoftScannerClient this component depends on — narrowed to an interface so
 * tests can substitute a hand-written fake for the browser-only SDK wrapper (same DI-by-
 * constructor/prop convention every Core class uses), without ever importing the real SDK. */
export interface IScannerClient {
  scan(options: IDynamsoftScanOptions): Promise<IScanResult>;
}

export interface IScanDocumentControlProps {
  /** Render-prop so each of the three call sites (Incoming/Outgoing compose, Supporting
   * Documents) keeps its own existing button/dropzone markup — only the click wiring, quality
   * gate, and override flow are shared, per CMS-002's "one shared component" requirement. */
  children: (state: IScanDocumentControlRenderProps) => React.ReactNode;
  /** Called once a scan is accepted — either it cleared the quality gate outright, or the user
   * explicitly overrode a failed gate (overrideReason set). The caller owns what happens to the
   * scanned bytes — in Create Correspondence that's holding them as local pending form state
   * (persistPendingAttachments.ts uploads for real only once Save Draft/Send creates the
   * correspondence item). May return a promise — it's awaited, so the "Scanned successfully" toast
   * only appears once the caller's own handling really succeeded, and a failure surfaces as an
   * error rather than an unhandled rejection. */
  onScanned: (result: IScanResult, quality: IScanQualityInfo, overrideReason?: string) => void | Promise<void>;
  /** Test seam only — production call sites omit this and get the real DynamsoftScannerClient. */
  scannerClient?: IScannerClient;
}

/**
 * Shared Scan Document control (CMS-002 AC1/AC2/AC4/AC5/AC6/AC7/AC8) — wraps the Dynamsoft
 * Document Scanner JS SDK, runs the DPI/format/completeness quality gate on the result, and
 * blocks acceptance behind an explicit override + reason when the gate fails. Reuses the shared
 * Modal/Spinner primitives; "Scanned successfully" reuses the same ad hoc inline-toast pattern
 * already used by TeamInboxView (this repo has no dedicated shared Toast component to reuse).
 */
export const ScanDocumentControl: React.FC<IScanDocumentControlProps> = ({ children, onScanned, scannerClient }) => {
  const { t } = useTranslation();
  const { adminConfigService } = useServices();

  const [licenseKey, setLicenseKey] = React.useState<string | undefined>(undefined);
  const [scanning, setScanning] = React.useState(false);
  const [successMessage, setSuccessMessage] = React.useState<string | undefined>(undefined);
  const [errorMessage, setErrorMessage] = React.useState<string | undefined>(undefined);
  const [pendingOverride, setPendingOverride] = React.useState<
    { result: IScanResult; gate: IQualityGateResult; reason: string } | undefined
  >(undefined);
  const containerRef = React.useRef<HTMLDivElement | null>(null);
  // Lazily constructed once, not per render (useRef's argument is evaluated on every render).
  const clientRef = React.useRef<IScannerClient | undefined>(undefined);
  if (!clientRef.current) clientRef.current = scannerClient ?? new DynamsoftScannerClient();

  React.useEffect(() => {
    adminConfigService
      .getEntries()
      .then((entries) => {
        setLicenseKey(entries.find((e) => e.key === DYNAMSOFT_LICENSE_KEY_ENTRY)?.value ?? '');
      })
      .catch(() => setLicenseKey(''));
  }, [adminConfigService]);

  const notConfigured = licenseKey !== undefined && licenseKey.trim().length === 0;

  // onScanned is awaited rather than fired-and-forgotten: it's what actually uploads the file and
  // writes the CORMS_Attachments row, so an unawaited call would both report "Scanned
  // successfully" for a write that failed and leave the rejection unhandled.
  const finish = async (result: IScanResult, gate: IQualityGateResult, overrideReason?: string): Promise<void> => {
    const scannedDPI = Math.min(...result.pages.map((p) => p.dpi));
    try {
      await onScanned(result, { scannedDPI, qualityPassed: gate.passed }, overrideReason);
    } catch {
      setErrorMessage(t('scan.persistFailed'));
      return;
    }
    setErrorMessage(undefined);
    setSuccessMessage(t('scan.success'));
    window.setTimeout(() => setSuccessMessage(undefined), SUCCESS_TOAST_DURATION_MS);
  };

  const handleClick = async (): Promise<void> => {
    if (!licenseKey || !containerRef.current) return;
    setScanning(true);
    setErrorMessage(undefined);
    try {
      const result = await clientRef.current!.scan({ licenseKey, container: containerRef.current });
      // A zero-page result is a cancelled/empty scan, not a passing one — runQualityGate on an
      // empty page list would vacuously "pass" (`[].some(...)` is false) and Math.min of nothing
      // is Infinity, so it's rejected up front rather than persisted as a perfect scan.
      if (result.pages.length === 0) return;
      const gate = runQualityGate(result.pages);
      if (gate.passed) {
        await finish(result, gate);
      } else {
        setPendingOverride({ result, gate, reason: '' });
      }
    } catch {
      // Scan cancelled or failed — nothing to persist, no fake success message.
    } finally {
      setScanning(false);
    }
  };

  const gateFailureSummary = (gate: IQualityGateResult): string => {
    const reasons: string[] = [];
    if (gate.dpiFailed) reasons.push(t('scan.qualityGate.dpiFailed'));
    if (gate.formatFailed) reasons.push(t('scan.qualityGate.formatFailed'));
    if (gate.completenessFlags.some((f) => f.likelyMissing)) reasons.push(t('scan.qualityGate.completenessFailed'));
    return reasons.join(' ');
  };

  return (
    <>
      {/* handleClick already swallows its own failures; the terminating .catch keeps the
          render-prop's onClick a genuine `() => void` rather than handing call sites a floating
          promise, matching this codebase's `.catch(() => undefined)` convention. */}
      {children({
        onClick: () => {
          handleClick().catch(() => undefined);
        },
        scanning,
        notConfigured,
        notConfiguredMessage: t('scan.notConfigured'),
      })}

      <div className={`${styles.scannerOverlay} ${scanning ? styles.scannerOverlayActive : ''}`}>
        <div ref={containerRef} className={styles.scannerContainer}>
          {scanning && <Spinner label={t('scan.scanning')} />}
        </div>
      </div>

      {pendingOverride && (
        <Modal
          isOpen
          onDismiss={() => setPendingOverride(undefined)}
          title={t('scan.qualityGate.title')}
          width={420}
          footer={
            <>
              <Button variant="default" text={t('common.cancel')} onClick={() => setPendingOverride(undefined)} />
              <Button
                variant="primary"
                disabled={!pendingOverride.reason.trim()}
                text={t('scan.qualityGate.registerAnyway')}
                onClick={() => {
                  const { result, gate, reason } = pendingOverride;
                  setPendingOverride(undefined);
                  // Terminated with a .catch even though finish() already swallows its own
                  // failures — an onClick must never hand React a floating promise.
                  finish(result, gate, reason.trim()).catch(() => setErrorMessage(t('scan.persistFailed')));
                }}
              />
            </>
          }
        >
          <p className={styles.gateSummary}>{gateFailureSummary(pendingOverride.gate)}</p>
          <div className={styles.field}>
            <span className={styles.label}>{t('scan.qualityGate.reason')}</span>
            <textarea
              autoFocus
              rows={3}
              className={styles.textarea}
              value={pendingOverride.reason}
              placeholder={t('scan.qualityGate.reasonPlaceholder')}
              onChange={(e) => setPendingOverride({ ...pendingOverride, reason: e.target.value })}
            />
          </div>
        </Modal>
      )}

      {successMessage && <div className={styles.toast}>{successMessage}</div>}
      {errorMessage && <div className={styles.errorToast}>{errorMessage}</div>}
    </>
  );
};
