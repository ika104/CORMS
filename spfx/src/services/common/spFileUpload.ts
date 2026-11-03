/**
 * The two PnPjs primitives every document-library upload surface in this app needs. Both
 * AttachmentStorageService.live.ts (CORMS_Attachments, foldered) and DelegationService.live.ts
 * (CORMS_DelegationAttachments, flat root) implement their own narrow, deliberately different
 * upload interface — but the *mechanics* below are identical in both, so they live here once
 * rather than being copied per library.
 */

/** Server-relative root path of a document library on the given site, e.g.
 * "/sites/CORMS-DEV/CORMS_Attachments". Collapses any duplicate slashes a joined path introduces. */
export function libraryRootServerRelativePath(siteUrl: string, libraryTitle: string): string {
  return `${new URL(siteUrl).pathname}/${libraryTitle}`.replace(/\/+/g, '/');
}

/**
 * PnPjs 4.20's `addChunked()` converts its `content` argument to a ReadableStream internally
 * (`sourceToReadableStream` in @pnp/sp/files/types.js) and only recognizes Blob/Buffer/stream
 * shapes — a raw ArrayBuffer matches none of its checks and is returned unconverted, so the
 * following `.getReader()` call throws "contentStream.getReader is not a function" (found via
 * manual testing against a real tenant). Normalizing to a real Blob here sidesteps that gap
 * regardless of which shape a caller passes.
 */
export function toUploadBlob(content: Blob | ArrayBuffer): Blob {
  return content instanceof Blob ? content : new Blob([content]);
}
