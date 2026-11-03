import { IDocumentPreviewService } from '../interfaces/IDocumentPreviewService';
import { IDevSettingsService } from '../interfaces/IDevSettingsService';
import { readAdminConfigValues } from '../recordsHubConfig/recordsHubConfig';
import { IAnnotationItem, IWatermarkItem } from '../../models/IGroupDocs';
import {
  annotationEndpoint,
  buildAddAnnotationsBody,
  buildGetAnnotationsBody,
  buildRemoveAnnotationsBody,
  buildViewDocBody,
  parseAnnotationsResponse,
  pixelsToPointsFactor,
  pointsToPixelsFactor,
  resolveApiFilePath,
  scaleAnnotationBoxes,
  toGraphShareContentUrl,
} from './groupDocsRequests';

/** CORMS_AdminConfig key holding the full GroupDoc viewdoc endpoint URL (e.g.
 * https://host:9220/api/Groupdoc/viewdoc). The Watermark / Annotation endpoints are derived from
 * its host, so one Admin Config edit retargets the whole GroupDoc integration. */
export const DOC_VIEWER_URL_KEY = 'integration.docViewerUrl';

/** CORMS_AdminConfig key holding the DPI the GroupDoc viewdoc renders page PNGs at. The annotation
 * API stores `box` in document points (1/72"), so this converts the preview-pixel coordinates the
 * Annotate tab works in to/from points. Defaults to 150 (the observed tenant render resolution). */
export const DOC_VIEWER_DPI_KEY = 'integration.docViewerDpi';
const DEFAULT_VIEWER_DPI = 150;

// Re-exported for existing importers/tests.
export { toGraphShareContentUrl };

interface IViewDocResponse {
  images?: string[];
}

/**
 * Backs the Correspondence Detail → Preview and Annotate tabs via the GroupDoc API. The server runs
 * on the client's own host (there is no browser-embeddable GroupDoc SDK): it fetches the file (via
 * a Graph share URL — see groupDocsRequests.ts), renders one base64 PNG per page, and stores
 * annotations/watermarks.
 *
 * Uses `window.fetch` (not spHttpClient): the endpoint is an arbitrary external host needing no
 * SharePoint auth, which also keeps this class free of the @microsoft/sp-http import so it's
 * unit-testable. All request/response shaping lives in the pure groupDocsRequests module.
 */
export class DocumentPreviewService implements IDocumentPreviewService {
  constructor(private readonly devSettings: IDevSettingsService) {}

  private async viewerUrl(): Promise<string> {
    const values = await readAdminConfigValues(this.devSettings);
    return (values[DOC_VIEWER_URL_KEY] ?? '').trim();
  }

  private async dpi(): Promise<number> {
    const values = await readAdminConfigValues(this.devSettings);
    const raw = parseFloat((values[DOC_VIEWER_DPI_KEY] ?? '').trim());
    return Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_VIEWER_DPI;
  }

  private filePath(fileUrl: string): string {
    const origin = typeof window !== 'undefined' ? window.location.origin : '';
    return resolveApiFilePath(fileUrl, origin);
  }

  private async postJson(url: string, body: unknown): Promise<Response> {
    return fetch(url, {
      method: 'POST',
      headers: { Accept: '*/*', 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      mode: 'cors',
      credentials: 'omit',
    });
  }

  public async getPreviewImages(fileUrl: string, watermarks?: IWatermarkItem[]): Promise<string[] | undefined> {
    const viewerUrl = await this.viewerUrl();
    if (!viewerUrl || !fileUrl) return undefined;
    const response = await this.postJson(viewerUrl, buildViewDocBody(this.filePath(fileUrl), watermarks));
    if (!response.ok) {
      throw new Error(`Document viewer returned ${response.status} ${response.statusText}`);
    }
    const body = (await response.json()) as IViewDocResponse;
    return Array.isArray(body.images) ? body.images : [];
  }

  public async getAnnotations(fileUrl: string): Promise<IAnnotationItem[] | undefined> {
    const viewerUrl = await this.viewerUrl();
    if (!viewerUrl || !fileUrl) return undefined;
    const response = await this.postJson(
      annotationEndpoint(viewerUrl, 'get'),
      buildGetAnnotationsBody(this.filePath(fileUrl))
    );
    if (!response.ok) {
      throw new Error(`Annotation get returned ${response.status} ${response.statusText}`);
    }
    const parsed = parseAnnotationsResponse(await response.json().catch(() => undefined));
    // Stored boxes are in document points; scale up to the preview-pixel space the overlay uses.
    return scaleAnnotationBoxes(parsed, pointsToPixelsFactor(await this.dpi()));
  }

  public async addAnnotations(fileUrl: string, annotations: IAnnotationItem[], saveToSharePoint = true): Promise<boolean> {
    const viewerUrl = await this.viewerUrl();
    if (!viewerUrl || !fileUrl) return false;
    // The overlay produces boxes in preview pixels; convert to the points the annotation store uses.
    const inPoints = scaleAnnotationBoxes(annotations, pixelsToPointsFactor(await this.dpi()));
    const response = await this.postJson(
      annotationEndpoint(viewerUrl, 'add'),
      buildAddAnnotationsBody(this.filePath(fileUrl), inPoints, saveToSharePoint)
    );
    if (!response.ok) {
      throw new Error(`Annotation add returned ${response.status} ${response.statusText}`);
    }
    return true;
  }

  public async addAndReadBackAnnotations(
    fileUrl: string,
    annotations: IAnnotationItem[]
  ): Promise<IAnnotationItem[] | undefined> {
    const viewerUrl = await this.viewerUrl();
    if (!viewerUrl || !fileUrl) return undefined;
    // CMS-024 — create, then read the canonical set back so the caller can persist it in CORMS
    // (RecordsHub does not store annotations itself). If the read-back is empty — GroupDocs only
    // holds the just-added annotations transiently — fall back to what we sent, so the persisted
    // set always reflects what the user drew rather than silently losing it.
    await this.addAnnotations(fileUrl, annotations, true);
    const readBack = await this.getAnnotations(fileUrl).catch(() => undefined);
    return readBack && readBack.length ? readBack : annotations;
  }

  public async removeAnnotations(
    fileUrl: string,
    opts: { annotationIds?: number[]; removeAll?: boolean }
  ): Promise<boolean> {
    const viewerUrl = await this.viewerUrl();
    if (!viewerUrl || !fileUrl) return false;
    const response = await this.postJson(
      annotationEndpoint(viewerUrl, 'remove'),
      buildRemoveAnnotationsBody(this.filePath(fileUrl), opts)
    );
    if (!response.ok) {
      throw new Error(`Annotation remove returned ${response.status} ${response.statusText}`);
    }
    return true;
  }
}
