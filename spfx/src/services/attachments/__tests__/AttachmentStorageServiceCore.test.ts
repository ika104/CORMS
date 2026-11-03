import {
  AttachmentStorageServiceCore,
  IFolderFileSurface,
  IStoredFile,
} from '../AttachmentStorageServiceCore';

/** Narrow hand-written fake for IFolderFileSurface — fakeSp.ts intentionally only models list
 * items (see that file's comment), so folder/file behavior is faked here instead, scoped to this
 * one test file rather than growing the shared utility every other Core test depends on. */
function createFakeSurface(): IFolderFileSurface & { folders: Record<string, IStoredFile[]> } {
  const folders: Record<string, IStoredFile[]> = {};

  return {
    folders,
    ensureFolder: jest.fn(async (folderPath: string) => {
      if (!folders[folderPath]) folders[folderPath] = [];
    }),
    uploadFile: jest.fn(async (folderPath: string, fileName: string) => {
      const file: IStoredFile = {
        fileName,
        serverRelativeUrl: `/sites/CORMS/CORMS_Attachments/${folderPath}/${fileName}`,
      };
      folders[folderPath] = [...(folders[folderPath] ?? []), file];
      return file;
    }),
    listFiles: jest.fn(async (folderPath: string) => folders[folderPath] ?? []),
    replaceFile: jest.fn(async () => undefined),
  };
}

describe('CMS-002 Part 2 — attachment storage (upload-at-submit-time, no Drafts staging)', () => {
  it('uploadFile writes into a folder keyed by the real correspondence id', async () => {
    const surface = createFakeSurface();
    const core = new AttachmentStorageServiceCore(surface);

    await core.uploadFile('42', 'scan.pdf', new Blob());

    expect(surface.folders['42']).toHaveLength(1);
    expect(surface.folders['42'][0].fileName).toBe('scan.pdf');
    expect(surface.ensureFolder).toHaveBeenCalledWith('42');
  });

  it('two files for the same correspondence land in the same folder', async () => {
    const surface = createFakeSurface();
    const core = new AttachmentStorageServiceCore(surface);

    await core.uploadFile('42', 'main.pdf', new Blob());
    await core.uploadFile('42', 'annex.pdf', new Blob());

    expect(surface.folders['42']).toHaveLength(2);
  });
});

describe('CMS-040 Part 2 — listFiles (Files tab URL resolution)', () => {
  it('resolves the real serverRelativeUrl for every file uploaded for a correspondence', async () => {
    const surface = createFakeSurface();
    const core = new AttachmentStorageServiceCore(surface);
    await core.uploadFile('42', 'scan.pdf', new Blob());

    const files = await core.listFiles('42');

    expect(files).toHaveLength(1);
    expect(files[0].fileName).toBe('scan.pdf');
    expect(files[0].serverRelativeUrl).toContain('/42/');
  });

  it('returns an empty array (not an error) for a correspondence with no id', async () => {
    const surface = createFakeSurface();
    const core = new AttachmentStorageServiceCore(surface);

    expect(await core.listFiles('')).toEqual([]);
  });

  it('returns an empty array when nothing was ever uploaded for that correspondence', async () => {
    const surface = createFakeSurface();
    const core = new AttachmentStorageServiceCore(surface);

    expect(await core.listFiles('999')).toEqual([]);
  });
});
