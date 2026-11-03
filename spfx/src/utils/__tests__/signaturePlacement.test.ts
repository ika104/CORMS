import { ISignaturePlacement } from '../../models/IApprovalChain';
import {
  findFreePlacement,
  overlappingIndexes,
  placementsOverlap,
  spreadPlacements,
} from '../signaturePlacement';

const box = (x: number, y: number, page = 1): ISignaturePlacement => ({ page, x, y, width: 20, height: 8 });

describe('signature placements', () => {
  it('overlap only when the boxes intersect on the same page', () => {
    expect(placementsOverlap(box(70, 85), box(75, 88))).toBe(true);
    expect(placementsOverlap(box(70, 85), box(40, 85))).toBe(false);
    expect(placementsOverlap(box(70, 85), box(70, 85, 2))).toBe(false);
  });

  it('keeps a free preferred placement and otherwise moves to the next free column', () => {
    expect(findFreePlacement(box(70, 85), [])).toEqual(box(70, 85));
    expect(findFreePlacement(box(70, 85), [box(70, 85)])).toEqual(box(40, 85));
    expect(findFreePlacement(box(70, 85), [box(70, 85), box(40, 85), box(10, 85)])).toEqual(box(70, 75));
  });

  it('spreads identical defaults into separate slots', () => {
    const spread = spreadPlacements([box(70, 85), box(70, 85), box(70, 85)]);
    expect(spread).toEqual([box(70, 85), box(40, 85), box(10, 85)]);
    expect(overlappingIndexes(spread)).toEqual([]);
  });

  it('avoids placements already used by signers in the existing chain', () => {
    expect(spreadPlacements([box(70, 85)], [box(70, 85)])).toEqual([box(40, 85)]);
  });

  it('reports every placement that clashes', () => {
    expect(overlappingIndexes([box(70, 85), box(72, 86), box(10, 10)])).toEqual([0, 1]);
    expect(overlappingIndexes([box(10, 10)], [box(12, 12)])).toEqual([0]);
  });
});
