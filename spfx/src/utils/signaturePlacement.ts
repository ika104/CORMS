import { ISignaturePlacement } from '../models/IApprovalChain';

/**
 * Every signer signs the same document, so no two signature boxes may overlap. Placements are
 * percentages of the page (see SignaturePlacementCanvas); these helpers keep them apart.
 */

/** Space kept between neighbouring boxes, in % of the page. */
const GAP = 2;
/** Column positions tried, right to left, for the signature block at the foot of the page. */
const COLUMN_XS = [70, 40, 10];

export function placementsOverlap(a: ISignaturePlacement, b: ISignaturePlacement): boolean {
  return (
    a.page === b.page &&
    a.x < b.x + b.width &&
    b.x < a.x + a.width &&
    a.y < b.y + b.height &&
    b.y < a.y + a.height
  );
}

/**
 * The preferred placement when it is free; otherwise the nearest free slot on the same page, trying
 * the preferred column first and then the others, moving up one box at a time. Falls back to the
 * preferred placement when the page is full.
 */
export function findFreePlacement(
  preferred: ISignaturePlacement,
  taken: ISignaturePlacement[]
): ISignaturePlacement {
  const isFree = (candidate: ISignaturePlacement): boolean =>
    !taken.some((other) => placementsOverlap(candidate, other));
  if (isFree(preferred)) return preferred;
  const columns = [preferred.x].concat(
    COLUMN_XS.filter((x) => x !== preferred.x && x + preferred.width <= 100)
  );
  for (let y = preferred.y; y >= 0; y -= preferred.height + GAP) {
    for (const x of columns) {
      const candidate = { ...preferred, x, y };
      if (isFree(candidate)) return candidate;
    }
  }
  return preferred;
}

/** Gives each signature, in order, a placement that avoids the reserved ones and those before it. */
export function spreadPlacements(
  placements: ISignaturePlacement[],
  reserved: ISignaturePlacement[] = []
): ISignaturePlacement[] {
  const taken = reserved.slice();
  return placements.map((placement) => {
    const free = findFreePlacement(placement, taken);
    taken.push(free);
    return free;
  });
}

/** Indexes of placements that overlap a reserved one or another in the list. */
export function overlappingIndexes(
  placements: ISignaturePlacement[],
  reserved: ISignaturePlacement[] = []
): number[] {
  return placements
    .map((placement, i) =>
      reserved.some((other) => placementsOverlap(placement, other)) ||
      placements.some((other, j) => j !== i && placementsOverlap(placement, other))
        ? i
        : -1
    )
    .filter((i) => i !== -1);
}
