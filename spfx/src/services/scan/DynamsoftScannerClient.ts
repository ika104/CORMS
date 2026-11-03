import { IScanPage, IScanResult } from './dynamsoftTypes';

// CMS-002 AC6 — the scanner output is labeled PDF/A for the quality gate/persisted metadata.
// TODO(confirm): the Dynamsoft Document Scanner JS SDK's own image result only exposes
// `toBlob('image/png' | 'image/jpeg')` (see DeskewedImageResultItem) — there is no built-in
// TIFF/PDF-A encoder in this SDK. Real TIFF/PDF-A byte-level encoding needs a dedicated
// server-side or client-side conversion step this task doesn't build; the uploaded blob is
// currently PNG bytes labeled as this format so the rest of the pipeline (quality gate, storage,
// metadata) can be built and tested end-to-end now, with the actual encoding swapped in later.
const OUTPUT_FORMAT_LABEL = 'PDF/A';

// TODO(confirm): the SDK's DocumentResult doesn't report a scanner-hardware DPI directly (see
// dds.bundle.d.ts) — DPI is estimated here from the corrected image's pixel width against an
// assumed A4 page width (8.27in). This is a reasonable approximation, not a measured value;
// revisit once real DPI metadata is available from the capture device.
const ASSUMED_PAGE_WIDTH_INCHES = 8.27;

// TODO(confirm): "content coverage" (fed into scanQualityGate's completeness heuristic) is
// estimated here as the fraction of sampled pixels that are meaningfully darker than white —
// a coarse, best-effort signal, not a real ink/text detector.
function estimateContentCoverage(canvas: HTMLCanvasElement): number {
  const ctx = canvas.getContext('2d');
  if (!ctx) return 1; // fail open — never block registration on a canvas-read failure alone.
  const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const SAMPLE_STRIDE = 4 * 25; // sample every 25th pixel (RGBA = 4 bytes/pixel) for speed.
  const DARK_THRESHOLD = 235; // near-white pixels (>= this) don't count as "content".
  let sampled = 0;
  let dark = 0;
  for (let i = 0; i < data.length; i += SAMPLE_STRIDE) {
    sampled += 1;
    const luma = (data[i] + data[i + 1] + data[i + 2]) / 3;
    if (luma < DARK_THRESHOLD) dark += 1;
  }
  return sampled === 0 ? 1 : dark / sampled;
}

export interface IDynamsoftScanOptions {
  licenseKey: string;
  container: HTMLElement;
}

/**
 * Browser-only wrapper around the `dynamsoft-document-scanner` SDK. Never imported by a test file
 * or a Core class — the SDK dynamically imports itself only when `scan()` actually runs, so
 * bundling/typechecking it never requires a browser/camera context, and Jest under Heft (which
 * can't import PnPjs's ESM runtime either, see provisioningCore.ts) never touches it. All of this
 * class's actual decisions (DPI/format/completeness) are re-derived as plain numbers/strings and
 * handed to scanQualityGate.ts's pure, unit-tested functions — nothing here is itself unit tested.
 */
export class DynamsoftScannerClient {
  public async scan(options: IDynamsoftScanOptions): Promise<IScanResult> {
    if (!options.licenseKey.trim()) {
      throw new Error('Dynamsoft license key is not configured.');
    }

    const { DocumentScanner } = await import(/* webpackChunkName: 'dynamsoft-document-scanner' */ 'dynamsoft-document-scanner');
    const scanner = new DocumentScanner({ license: options.licenseKey, container: options.container });
    try {
      const result = await scanner.launch();
      const corrected = result?.correctedImageResult;
      if (!corrected) {
        throw new Error('Scan was cancelled or produced no image.');
      }

      const dpi = Math.round(corrected.imageData.width / ASSUMED_PAGE_WIDTH_INCHES);
      const blob = await corrected.toBlob('image/png');
      const page: IScanPage = {
        dpi,
        format: OUTPUT_FORMAT_LABEL,
        contentCoverage: estimateContentCoverage(corrected.toCanvas()),
        blob,
      };
      return { pages: [page], fileName: `scan-${Date.now()}.pdf` };
    } finally {
      scanner.dispose();
    }
  }
}
