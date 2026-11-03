import { IAnnotationItem, IWatermarkItem } from '../../models/IGroupDocs';

export interface IDocumentPreviewService {
  /**
   * POSTs the document's URL to the configured GroupDoc viewdoc service and returns one data-URI
   * image (data:image/png;base64,…) per rendered page. Pass `watermarks` to have them burned into
   * the returned images (Swagger: ViewDocs.includeWatermarks/watermarks). Returns `undefined` when
   * no viewer URL is configured in Admin Config, so the caller can fall back to the built-in
   * DocumentViewer. Rejects on a network/HTTP error.
   */
  getPreviewImages(fileUrl: string, watermarks?: IWatermarkItem[]): Promise<string[] | undefined>;

  /** Reads the annotations currently stored for the document (Swagger: /api/Annotation/get).
   * Returns `undefined` when no viewer URL is configured; [] when there are none.
   *
   * NOTE (CMS-024): GroupDocs does not persist annotations across sessions, so on a fresh load this
   * does NOT return previously saved annotations — those live in CORMS_Correspondence.AnnotationsJson
   * and are read via ICorrespondenceDetailService.getAnnotations. This remains the read side of the
   * add→get round trip used by addAndReadBackAnnotations. */
  getAnnotations(fileUrl: string): Promise<IAnnotationItem[] | undefined>;

  /** Adds annotations to the document (Swagger: /api/Annotation/add). No-op (resolves false) when no
   * viewer URL is configured. `saveToSharePoint` maps to the GroupDocs flag but RecordsHub confirmed
   * it does not save an annotated document — CORMS persists the annotations itself (see
   * addAndReadBackAnnotations + ICorrespondenceDetailService.saveAnnotations). */
  addAnnotations(fileUrl: string, annotations: IAnnotationItem[], saveToSharePoint?: boolean): Promise<boolean>;

  /** CMS-024 — the create-then-read-back step RecordsHub prescribed: POST the annotations to
   * /api/Annotation/add, then GET them back so the caller can persist the server's canonical form
   * (ids, normalised geometry) into CORMS. Returns the read-back set, falling back to the annotations
   * just sent when the GET comes back empty (GroupDocs holds them only transiently), so persistence
   * always reflects what the user drew. Resolves `undefined` when no viewer URL is configured. */
  addAndReadBackAnnotations(fileUrl: string, annotations: IAnnotationItem[]): Promise<IAnnotationItem[] | undefined>;

  /** Removes annotations by id, or all of them (Swagger: /api/Annotation/remove). No-op (resolves
   * false) when no viewer URL is configured. */
  removeAnnotations(fileUrl: string, opts: { annotationIds?: number[]; removeAll?: boolean }): Promise<boolean>;
}
