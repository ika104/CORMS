/**
 * CMS-006 — pure helpers for the approval chain: clearance eligibility (AC5), signature-placement
 * geometry (AC16), and serialising the ordered chain into the payload the SharePoint Task workflow
 * (orchestrated by Power Automate) consumes to create one Task per participant (AC9/AC12). Kept
 * free of React/DOM so they can be unit-tested on their own.
 */

import { IApprovalChainStep } from '../../../models/IApprovalChain';
import { ApprovalStep, IGroupStep, ISignaturePlacement } from './types';
import { overlappingIndexes, spreadPlacements } from '../../../utils/signaturePlacement';

export type {
  IApprovalChainStep,
  IApprovalChainParticipant,
  ApprovalStepType,
} from '../../../models/IApprovalChain';

/**
 * CMS-006 AC5 — a candidate may be added to an approval step only when their clearance is >= the
 * correspondence's security level. An unknown clearance (undefined — the live directory doesn't
 * expose one yet) is treated as eligible so real picking isn't blocked; only a *known* clearance
 * below the level is rejected.
 */
export function isEligibleForStep(
  candidateClearanceTier: number | undefined,
  securityTier: number | undefined
): boolean {
  if (candidateClearanceTier === undefined) return true;
  if (!securityTier) return true;
  return candidateClearanceTier >= securityTier;
}

/** Adds the person to the group, or removes them when they are already a member. */
export function toggleGroupMember(step: IGroupStep, memberId: string, memberName: string): IGroupStep {
  const index = step.memberIds.indexOf(memberId);
  if (index === -1) {
    return {
      ...step,
      memberIds: [...step.memberIds, memberId],
      memberNames: [...step.memberNames, memberName],
    };
  }
  return {
    ...step,
    memberIds: step.memberIds.filter((_, i) => i !== index),
    memberNames: step.memberNames.filter((_, i) => i !== index),
  };
}

/** A group step is added empty and filled afterwards; routing needs at least one member in each. */
export function hasEmptyGroup(steps: ApprovalStep[]): boolean {
  return steps.some((step) => step.kind === 'group' && step.memberIds.length === 0);
}

/** A signer already placed on the document (e.g. an existing approval step), which new steps avoid. */
export interface IPlacedSignature {
  label: string;
  placement: ISignaturePlacement;
}

export function stepDisplayName(step: ApprovalStep): string {
  return step.kind === 'reviewer'
    ? step.userName
    : step.kind === 'department'
      ? step.departmentName
      : step.groupName;
}

/** Ids of signature steps whose box overlaps another signature (all signers sign one document). */
export function overlappingSignatureStepIds(
  steps: ApprovalStep[],
  reserved: IPlacedSignature[] = []
): string[] {
  const signing = steps.filter((step) => step.requireSignature);
  return overlappingIndexes(
    signing.map((step) => step.signaturePlacement),
    reserved.map((r) => r.placement)
  ).map((i) => signing[i].id);
}

/** Moves signature steps that would share a box (e.g. a saved workflow's defaults) into free slots. */
export function spreadSignatureSteps(
  steps: ApprovalStep[],
  reserved: IPlacedSignature[] = []
): ApprovalStep[] {
  const signing = steps.filter((step) => step.requireSignature);
  const spread = spreadPlacements(
    signing.map((step) => step.signaturePlacement),
    reserved.map((r) => r.placement)
  );
  return steps.map((step) =>
    step.requireSignature ? { ...step, signaturePlacement: spread[signing.indexOf(step)] } : step
  );
}

/** Smallest box the signature-placement canvas allows, as a % of the page (AC16). */
export const MIN_SIGNATURE_SIZE_PCT = 5;

/**
 * CMS-006 AC16 — keeps the draggable/resizable signature box fully on the page canvas: width/height
 * are clamped to [MIN_SIGNATURE_SIZE_PCT, 100], then x/y to [0, 100 - size] so the box never spills
 * off any edge. Values are percentages of the page; `page` is passed through (>= 1). Coordinates are
 * rounded to whole percents so the persisted placement is stable and readable.
 */
export function clampSignaturePlacement(placement: ISignaturePlacement): ISignaturePlacement {
  const width = clamp(Math.round(placement.width), MIN_SIGNATURE_SIZE_PCT, 100);
  const height = clamp(Math.round(placement.height), MIN_SIGNATURE_SIZE_PCT, 100);
  return {
    page: Math.max(1, Math.round(placement.page) || 1),
    width,
    height,
    x: clamp(Math.round(placement.x), 0, 100 - width),
    y: clamp(Math.round(placement.y), 0, 100 - height),
  };
}

function clamp(value: number, min: number, max: number): number {
  if (Number.isNaN(value)) return min;
  return Math.min(max, Math.max(min, value));
}

/**
 * CMS-006 AC9/AC12 — serialises the builder's ordered steps into the workflow contract. Signature
 * placement is only emitted for signature-enabled steps, and each step is stamped with its execution
 * order so the routing runs in the built sequence. `firstOrder` places steps a requestor adds later
 * after the correspondence's existing ones.
 */
export function buildApprovalChainPayload(steps: ApprovalStep[], firstOrder = 1): IApprovalChainStep[] {
  return steps.map((step, index) => {
    const base = {
      order: firstOrder + index,
      requireSignature: step.requireSignature,
      ...(step.requireSignature ? { signaturePlacement: step.signaturePlacement } : {}),
    };
    if (step.kind === 'reviewer') {
      return {
        ...base,
        type: 'Reviewer' as const,
        name: step.userName,
        participants: [{ id: step.userId, name: step.userName }],
      };
    }
    if (step.kind === 'department') {
      return {
        ...base,
        type: 'Department' as const,
        name: step.departmentName,
        mode: step.mode === 'all' ? 'All' : 'Any',
        participants: [],
        departmentId: step.departmentId,
      };
    }
    return {
      ...base,
      type: 'Group' as const,
      name: step.groupName,
      mode: step.mode === 'all' ? 'All' : 'Any',
      participants: step.memberIds.map((id, i) => ({ id, name: step.memberNames[i] ?? id })),
    };
  });
}
