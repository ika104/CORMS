import { DocumentPreviewService, DOC_VIEWER_URL_KEY, toGraphShareContentUrl } from '../DocumentPreviewService';
import { IDevSettingsService } from '../../interfaces/IDevSettingsService';
import { IDevSettingRow } from '../../dataSource/devSettingsMapping';

function devSettings(rows: IDevSettingRow[]): IDevSettingsService {
  return { getSettings: () => Promise.resolve(rows), saveSettings: () => Promise.resolve() };
}

const VIEWER_URL = 'https://host:9220/api/Groupdoc/viewdoc';
const originalFetch = global.fetch;

afterEach(() => {
  global.fetch = originalFetch;
});

describe('DocumentPreviewService', () => {
  it('returns undefined (→ caller falls back) when no viewer URL is configured', async () => {
    const fetchSpy = jest.fn();
    global.fetch = fetchSpy as unknown as typeof fetch;
    const svc = new DocumentPreviewService(devSettings([]));

    expect(await svc.getPreviewImages('https://t/doc.pdf')).toBeUndefined();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('POSTs a Graph shares content URL (server downloads via Graph) and returns the page images', async () => {
    const images = ['data:image/png;base64,AAA', 'data:image/png;base64,BBB'];
    const fetchSpy = jest.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve({ images }) });
    global.fetch = fetchSpy as unknown as typeof fetch;
    const svc = new DocumentPreviewService(devSettings([{ key: DOC_VIEWER_URL_KEY, value: VIEWER_URL }]));

    const result = await svc.getPreviewImages('https://t.sharepoint.com/sites/CORMS/doc.pdf');

    expect(result).toEqual(images);
    const [url, init] = fetchSpy.mock.calls[0];
    expect(url).toBe(VIEWER_URL);
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body)).toEqual({
      filePath: toGraphShareContentUrl('https://t.sharepoint.com/sites/CORMS/doc.pdf'),
      includeWatermarks: false,
      watermarks: [],
    });
  });

  it('resolves a server-relative file URL against the current origin, then Graph-encodes it', async () => {
    const fetchSpy = jest.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve({ images: [] }) });
    global.fetch = fetchSpy as unknown as typeof fetch;
    const svc = new DocumentPreviewService(devSettings([{ key: DOC_VIEWER_URL_KEY, value: VIEWER_URL }]));

    await svc.getPreviewImages('/sites/CORMS/Shared Documents/doc.pdf');

    const body = JSON.parse(fetchSpy.mock.calls[0][1].body);
    expect(body.filePath).toBe(toGraphShareContentUrl(`${window.location.origin}/sites/CORMS/Shared Documents/doc.pdf`));
  });

  it('passes an already-Graph URL through unchanged', async () => {
    const fetchSpy = jest.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve({ images: [] }) });
    global.fetch = fetchSpy as unknown as typeof fetch;
    const graphUrl = 'https://graph.microsoft.com/v1.0/drives/abc/items/xyz/content';
    const svc = new DocumentPreviewService(devSettings([{ key: DOC_VIEWER_URL_KEY, value: VIEWER_URL }]));

    await svc.getPreviewImages(graphUrl);

    expect(JSON.parse(fetchSpy.mock.calls[0][1].body)).toEqual({ filePath: graphUrl, includeWatermarks: false, watermarks: [] });
  });

  it('sends watermarks with includeWatermarks=true when provided', async () => {
    const fetchSpy = jest.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve({ images: [] }) });
    global.fetch = fetchSpy as unknown as typeof fetch;
    const svc = new DocumentPreviewService(devSettings([{ key: DOC_VIEWER_URL_KEY, value: VIEWER_URL }]));

    await svc.getPreviewImages('https://t/doc.pdf', [{ type: 'text', text: 'Secret' }]);

    const body = JSON.parse(fetchSpy.mock.calls[0][1].body);
    expect(body.includeWatermarks).toBe(true);
    expect(body.watermarks).toEqual([{ type: 'text', text: 'Secret' }]);
  });

  it('Graph-encodes a URL as u! + base64url', () => {
    // Known Graph "encodeSharingUrl" transform.
    expect(toGraphShareContentUrl('https://x/doc.pdf')).toContain('/shares/u!');
    expect(toGraphShareContentUrl('https://x/doc.pdf')).toMatch(/\/driveItem\/content$/);
  });

  it('addAndReadBackAnnotations POSTs /add then /get and returns the canonical read-back set (CMS-024)', async () => {
    // /add ok, then /get returns one canonical annotation (box in document points → scaled to pixels).
    const fetchSpy = jest
      .fn()
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({}) })
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ annotations: [{ id: 7, type: 'Area', box: { x: 24, y: 24, width: 48, height: 24 } }] }),
      });
    global.fetch = fetchSpy as unknown as typeof fetch;
    const svc = new DocumentPreviewService(devSettings([{ key: DOC_VIEWER_URL_KEY, value: VIEWER_URL }]));

    const result = await svc.addAndReadBackAnnotations('https://t/doc.pdf', [
      { type: 'Area', box: { x: 50, y: 50, width: 100, height: 50 } },
    ]);

    const addUrl = fetchSpy.mock.calls[0][0];
    const getUrl = fetchSpy.mock.calls[1][0];
    expect(addUrl).toBe('https://host:9220/api/Annotation/add');
    expect(getUrl).toBe('https://host:9220/api/Annotation/get');
    expect(result).toHaveLength(1);
    expect(result![0].id).toBe(7);
    // Default 150 DPI → points→pixels factor 150/72; x 24pt → 50px.
    expect(result![0].box).toEqual({ x: 50, y: 50, width: 100, height: 50 });
  });

  it('addAndReadBackAnnotations falls back to what was sent when the read-back is empty (CMS-024)', async () => {
    const fetchSpy = jest
      .fn()
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({}) })
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ annotations: [] }) });
    global.fetch = fetchSpy as unknown as typeof fetch;
    const svc = new DocumentPreviewService(devSettings([{ key: DOC_VIEWER_URL_KEY, value: VIEWER_URL }]));

    const sent = [{ type: 'Point', box: { x: 5, y: 5, width: 10, height: 10 } }];
    const result = await svc.addAndReadBackAnnotations('https://t/doc.pdf', sent);

    expect(result).toEqual(sent);
  });

  it('addAndReadBackAnnotations resolves undefined when no viewer URL is configured (CMS-024)', async () => {
    const fetchSpy = jest.fn();
    global.fetch = fetchSpy as unknown as typeof fetch;
    const svc = new DocumentPreviewService(devSettings([]));

    expect(await svc.addAndReadBackAnnotations('https://t/doc.pdf', [{ type: 'Area' }])).toBeUndefined();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('rejects on a non-OK response', async () => {
    global.fetch = jest
      .fn()
      .mockResolvedValue({ ok: false, status: 500, statusText: 'Server Error' }) as unknown as typeof fetch;
    const svc = new DocumentPreviewService(devSettings([{ key: DOC_VIEWER_URL_KEY, value: VIEWER_URL }]));

    await expect(svc.getPreviewImages('https://t/doc.pdf')).rejects.toThrow(/500/);
  });
});
