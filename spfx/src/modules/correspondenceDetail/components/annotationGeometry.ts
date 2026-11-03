import { IAnnotationItem } from '../../../models/IGroupDocs';

export interface IAnnotationBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Keep resize targets usable without allowing them to exceed the source page. */
export const MIN_ANNOTATION_WIDTH = 28;
export const MIN_ANNOTATION_HEIGHT = 22;

/**
 * Resizes a box from its bottom-right corner in natural page pixels. The result remains within the
 * page bounds, which ensures the same geometry is valid for the visual overlay and GroupDocs API.
 */
export function resizeAnnotationBox(
  box: IAnnotationBox,
  widthDelta: number,
  heightDelta: number,
  page: { w: number; h: number }
): IAnnotationBox {
  const maxWidth = Math.max(1, page.w - box.x);
  const maxHeight = Math.max(1, page.h - box.y);
  const minWidth = Math.min(MIN_ANNOTATION_WIDTH, maxWidth);
  const minHeight = Math.min(MIN_ANNOTATION_HEIGHT, maxHeight);
  return {
    ...box,
    width: Math.min(maxWidth, Math.max(minWidth, Math.round(box.width + widthDelta))),
    height: Math.min(maxHeight, Math.max(minHeight, Math.round(box.height + heightDelta))),
  };
}

/** Only box-based annotations can be resized; freehand paths retain their original points. */
export function canResizeAnnotation(annotation: IAnnotationItem): boolean {
  return !!annotation.box && !annotation.points?.length;
}
