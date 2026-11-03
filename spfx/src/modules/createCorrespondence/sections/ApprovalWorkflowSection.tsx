import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { Check, ChevronDown, ChevronUp, ClipboardList, ShieldAlert, UserRound, X } from 'lucide-react';
import { useServices } from '../../../services/ServiceProvider';
import { IRecipient, IDestinationDepartment } from '../../../models/ICorrespondenceMetadata';
import { SECURITY_TIERS } from '../../../models/ICorrespondence';
import { IUseCreateCorrespondenceForm } from '../state/useCreateCorrespondenceForm';
import {
  IPlacedSignature,
  isEligibleForStep,
  overlappingSignatureStepIds,
  spreadSignatureSteps,
  stepDisplayName,
} from '../state/approvalChain';
import { findFreePlacement } from '../../../utils/signaturePlacement';
import { getInitials } from '../../../utils/getInitials';
import { SignaturePlacementCanvas } from '../components/SignaturePlacementCanvas';
import { PickerPopover } from '../components/PickerPopover';
import { ApprovalStep } from '../state/types';
import {
  APPROVAL_WORKFLOWS_CONFIG_KEY,
  IApprovalWorkflow,
  parseApprovalWorkflowsJson,
} from '../state/approvalWorkflows';
import styles from './ApprovalWorkflowSection.module.scss';

export interface IApprovalWorkflowSectionProps {
  form: IUseCreateCorrespondenceForm;
  /** The administrator editor reuses the step builder but does not need a second preset chooser. */
  showPresets?: boolean;
  /** Signers already on the document (the existing approval chain), whose boxes new steps avoid. */
  reservedSignatures?: IPlacedSignature[];
}

type PickerKind = 'reviewer' | 'department' | 'group' | undefined;

/** Planned height of a search picker, so it opens on the side where its results will fit. */
const SEARCH_PICKER_HEIGHT = 300;

const NO_RESERVED_SIGNATURES: IPlacedSignature[] = [];

export const ApprovalWorkflowSection: React.FC<IApprovalWorkflowSectionProps> = ({
  form,
  showPresets = true,
  reservedSignatures = NO_RESERVED_SIGNATURES,
}) => {
  const { t } = useTranslation();
  const { metadataService, sharePointService, adminConfigService } = useServices();
  const {
    state,
    replaceApprovalSteps,
    addReviewerStep,
    addDepartmentStep,
    addGroupStep,
    toggleGroupMember,
    removeApprovalStep,
    moveApprovalStep,
    toggleStepSignature,
    setStepSignaturePlacement,
    setStepApprovalMode,
  } = form;

  const [openPicker, setOpenPicker] = React.useState<PickerKind>(undefined);
  // The group step whose "+ Add" member picker is open.
  const [memberPickerStepId, setMemberPickerStepId] = React.useState<string | undefined>(undefined);
  const [recipients, setRecipients] = React.useState<IRecipient[]>([]);
  const [departments, setDepartments] = React.useState<IDestinationDepartment[]>([]);
  const [expandedSignatureStepId, setExpandedSignatureStepId] = React.useState<string | undefined>(undefined);
  // What the user typed into the open picker's search box. Reviewers/group members search live
  // SharePoint users (same source as the Sender/Recipient fields), Departments filter RH_OrgSecurity.
  const [query, setQuery] = React.useState('');
  const [workflows, setWorkflows] = React.useState<IApprovalWorkflow[]>(() =>
    parseApprovalWorkflowsJson(undefined)
  );

  // Definitions are read fresh when the section opens. They live in CORMS_AdminConfig as JSON so
  // an administrator's saved changes are immediately available to the next correspondence.
  React.useEffect(() => {
    if (!showPresets) return undefined;
    let cancelled = false;
    adminConfigService
      .getEntries()
      .then((entries) => {
        const raw = entries.find((entry) => entry.key === APPROVAL_WORKFLOWS_CONFIG_KEY)?.value;
        if (!cancelled) setWorkflows(parseApprovalWorkflowsJson(raw));
      })
      .catch(() => {
        if (!cancelled) setWorkflows(parseApprovalWorkflowsJson(undefined));
      });
    return () => {
      cancelled = true;
    };
  }, [adminConfigService, showPresets]);

  // CMS-006 AC5 — only staff whose clearance is >= the correspondence's security level may be added
  // to a step. An unknown clearance (live data has none yet) stays eligible; a known-lower one is
  // shown disabled with the reason, so the rule is visible rather than silently hiding people.
  const securityTier = state.securityTier;
  const securityLevelName = SECURITY_TIERS.find((tier) => tier.tier === securityTier)?.name;
  const isEligible = (recipient: IRecipient): boolean =>
    isEligibleForStep(recipient.clearanceTier, securityTier);

  const searchSource: 'people' | 'department' | undefined =
    openPicker === 'reviewer' || memberPickerStepId
      ? 'people'
      : openPicker === 'department'
        ? 'department'
        : undefined;

  // Debounced live fetch driven by the open picker + the search box. An empty query is a valid
  // search (shows the default suggestions the source returns for it).
  React.useEffect(() => {
    if (!searchSource) return undefined;
    let cancelled = false;
    const handle = window.setTimeout(() => {
      if (searchSource === 'people') {
        sharePointService
          .searchPeople(query)
          .then((people) => {
            if (!cancelled)
              setRecipients(people.map((p) => ({ id: p.id, name: p.name, department: p.email })));
          })
          .catch(() => {
            if (!cancelled) setRecipients([]);
          });
      } else {
        metadataService
          .getDestinationDepartments(query)
          .then((depts) => {
            if (!cancelled) setDepartments(depts);
          })
          .catch(() => {
            if (!cancelled) setDepartments([]);
          });
      }
    }, 200);
    return () => {
      cancelled = true;
      window.clearTimeout(handle);
    };
  }, [searchSource, query, sharePointService, metadataService]);

  // Only one picker is open at a time, and each opens with a fresh search box.
  const closePicker = React.useCallback((): void => {
    setOpenPicker(undefined);
    setMemberPickerStepId(undefined);
    setQuery('');
  }, []);

  const togglePicker = (kind: Exclude<PickerKind, undefined>): void => {
    const opening = openPicker !== kind;
    closePicker();
    if (opening) setOpenPicker(kind);
  };

  const toggleMemberPicker = (stepId: string): void => {
    const opening = memberPickerStepId !== stepId;
    closePicker();
    if (opening) setMemberPickerStepId(stepId);
  };

  const addNewGroup = (): void => {
    addGroupStep(t('createCorrespondence.approval.groupReviewers'), [], []);
    closePicker();
  };

  const searchBox = (placeholder: string): React.ReactNode => (
    <>
      <input
        type="text"
        className={styles.pickerInput}
        placeholder={placeholder}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        autoFocus
      />
      {searchSource === 'people' && securityLevelName && (
        <div className={styles.clearanceNote}>
          {t('createCorrespondence.approval.clearanceNote', { level: securityLevelName })}
        </div>
      )}
    </>
  );

  // A person row for the reviewer and group-member pickers. `selected` marks a current group member.
  const personOption = (recipient: IRecipient, onPick: () => void, selected = false): React.ReactNode => {
    const eligible = isEligible(recipient);
    return (
      <button
        key={recipient.id}
        type="button"
        className={`${styles.pickerOption} ${selected ? styles.pickerOptionSelected : ''} ${eligible ? '' : styles.pickerOptionDisabled}`}
        disabled={!eligible}
        aria-pressed={selected}
        title={eligible ? undefined : t('createCorrespondence.approval.clearanceTooLow')}
        onClick={onPick}
      >
        <span>
          {recipient.name} {recipient.department && `(${recipient.department})`}
        </span>
        {selected && <Check size={14} className={styles.selectedMark} />}
        {!eligible && (
          <span className={styles.clearanceFlag}>
            <ShieldAlert size={12} /> {t('createCorrespondence.approval.clearanceTooLow')}
          </span>
        )}
      </button>
    );
  };

  // Every signer signs the same document, so each box is placed against all the others.
  const otherSignatures = (stepId: string): IPlacedSignature[] =>
    state.approvalSteps
      .filter((other) => other.requireSignature && other.id !== stepId)
      .map((other) => ({ label: stepDisplayName(other), placement: other.signaturePlacement }))
      .concat(reservedSignatures);
  const overlapping = new Set(overlappingSignatureStepIds(state.approvalSteps, reservedSignatures));

  const renderStepIdentity = (step: ApprovalStep): React.ReactNode => {
    if (step.kind === 'reviewer') {
      return (
        <>
          <span className={styles.avatar}>{getInitials(step.userName)}</span>
          <div className={styles.stepInfo}>
            <div className={styles.stepName}>{step.userName}</div>
            {step.department && <div className={styles.stepMeta}>{step.department}</div>}
          </div>
        </>
      );
    }
    if (step.kind === 'department') {
      return (
        <>
          <span className={`${styles.iconTile} ${styles.iconTileDepartment}`}>
            <ClipboardList size={18} />
          </span>
          <div className={styles.stepInfo}>
            <div className={styles.stepKicker}>{t('createCorrespondence.approval.departmentRouting')}</div>
            <div className={styles.stepTitleRow}>
              <span className={styles.stepName}>{step.departmentName}</span>
              <span className={styles.stepMetaInline}>
                {t(
                  step.mode === 'all'
                    ? 'createCorrespondence.approval.departmentAllDisclaimer'
                    : 'createCorrespondence.approval.departmentAnyDisclaimer'
                )}
              </span>
            </div>
          </div>
        </>
      );
    }
    const count = step.memberIds.length;
    return (
      <>
        <span className={`${styles.iconTile} ${styles.iconTileGroup}`}>
          <UserRound size={18} />
        </span>
        <div className={styles.stepInfo}>
          <div className={styles.stepTitleRow}>
            <span className={styles.stepName}>
              {t('createCorrespondence.approval.groupTitle', { count })}
            </span>
            <span className={styles.stepMetaInline}>
              {t(
                step.mode === 'all'
                  ? 'createCorrespondence.approval.groupAllDisclaimer'
                  : 'createCorrespondence.approval.groupAnyDisclaimer',
                { count: count || '—' }
              )}
            </span>
          </div>
          <div className={styles.memberChips}>
            {step.memberIds.map((memberId, i) => (
              <span key={memberId} className={styles.memberChip}>
                {step.memberNames[i] ?? memberId}
                <button
                  type="button"
                  className={styles.memberChipRemove}
                  onClick={() => toggleGroupMember(step.id, memberId, step.memberNames[i] ?? memberId)}
                  aria-label={t('createCorrespondence.approval.removeMember', {
                    name: step.memberNames[i] ?? memberId,
                  })}
                >
                  <X size={12} />
                </button>
              </span>
            ))}
            <PickerPopover
              open={memberPickerStepId === step.id}
              onClose={closePicker}
              reserveHeight={SEARCH_PICKER_HEIGHT}
              popoverClassName={styles.searchPopover}
              trigger={
                <button
                  type="button"
                  className={styles.addMemberChip}
                  data-validation-field={count === 0 ? 'approvalWorkflow' : undefined}
                  onClick={() => toggleMemberPicker(step.id)}
                >
                  + {t('createCorrespondence.approval.addMember')}
                </button>
              }
            >
              {searchBox(t('createCorrespondence.approval.searchReviewer'))}
              <div className={styles.pickerList}>
                {recipients.map((r) =>
                  personOption(
                    r,
                    () => toggleGroupMember(step.id, r.id, r.name),
                    step.memberIds.indexOf(r.id) !== -1
                  )
                )}
              </div>
            </PickerPopover>
          </div>
          {count === 0 && (
            <div className={styles.memberHint}>{t('createCorrespondence.approval.groupMembersRequired')}</div>
          )}
        </div>
      </>
    );
  };

  return (
    <>
      {showPresets && (
        <div className={styles.presetRow}>
          {workflows.map((workflow) => (
            <button
              type="button"
              key={workflow.id}
              className={styles.presetCard}
              onClick={() => replaceApprovalSteps(spreadSignatureSteps(workflow.steps, reservedSignatures))}
            >
              <div className={styles.presetTitle}>{workflow.name}</div>
              <div className={styles.presetSteps}>
                {t('createCorrespondence.approval.stepsCount', { count: workflow.steps.length })}
              </div>
            </button>
          ))}
        </div>
      )}

      {state.approvalSteps.length === 0 ? (
        <div className={styles.emptyState}>{t('createCorrespondence.approval.emptyState')}</div>
      ) : (
        <div className={styles.stepList}>
          {state.approvalSteps.map((step, index) => (
            <div key={step.id} className={styles.stepCard}>
              <div className={styles.stepRow}>
                <div className={styles.reorderCol}>
                  <button
                    type="button"
                    className={styles.reorderButton}
                    disabled={index === 0}
                    onClick={() => moveApprovalStep(step.id, 'up')}
                    aria-label="Move up"
                  >
                    <ChevronUp size={14} />
                  </button>
                  <button
                    type="button"
                    className={styles.reorderButton}
                    disabled={index === state.approvalSteps.length - 1}
                    onClick={() => moveApprovalStep(step.id, 'down')}
                    aria-label="Move down"
                  >
                    <ChevronDown size={14} />
                  </button>
                </div>
                <span className={styles.stepNumber}>{index + 1}</span>
                {renderStepIdentity(step)}
                <label className={styles.signatureLabel}>
                  <input
                    type="checkbox"
                    checked={step.requireSignature}
                    onChange={(e) => {
                      toggleStepSignature(step.id, e.target.checked);
                      // A new signature starts in the next free slot, clear of every other signer.
                      if (e.target.checked) {
                        const taken = otherSignatures(step.id).map((other) => other.placement);
                        setStepSignaturePlacement(step.id, findFreePlacement(step.signaturePlacement, taken));
                      }
                      setExpandedSignatureStepId(e.target.checked ? step.id : undefined);
                    }}
                  />
                  {t('createCorrespondence.approval.requireSignature')}
                </label>
                {step.requireSignature && (
                  <button
                    type="button"
                    className={`${styles.positionLink} ${overlapping.has(step.id) ? styles.positionLinkError : ''}`}
                    onClick={() =>
                      setExpandedSignatureStepId((current) => (current === step.id ? undefined : step.id))
                    }
                  >
                    {overlapping.has(step.id)
                      ? t('createCorrespondence.approval.signatureOverlap')
                      : t('createCorrespondence.approval.editSignaturePosition')}
                  </button>
                )}
                {(step.kind === 'department' || step.kind === 'group') && (
                  <div className={styles.modeControl}>
                    <span className={styles.modeControlLabel}>
                      {t('createCorrespondence.approval.approvalMode')}
                    </span>
                    <div className={styles.modeSegmented}>
                      <button
                        type="button"
                        className={`${styles.modeSegmentButton} ${step.mode === 'any' ? styles.modeSegmentButtonActive : ''}`}
                        onClick={() => setStepApprovalMode(step.id, 'any')}
                      >
                        {t('createCorrespondence.approval.singleAny')}
                      </button>
                      <button
                        type="button"
                        className={`${styles.modeSegmentButton} ${step.mode === 'all' ? styles.modeSegmentButtonActive : ''}`}
                        onClick={() => setStepApprovalMode(step.id, 'all')}
                      >
                        {t('createCorrespondence.approval.all')}
                      </button>
                    </div>
                  </div>
                )}
                <button
                  type="button"
                  className={styles.removeButton}
                  onClick={() => removeApprovalStep(step.id)}
                  aria-label="Remove step"
                >
                  <X size={16} />
                </button>
              </div>

              {/* CMS-006 AC16 — drag-and-drop, resizable signature-placement preview on a page
                  canvas; records the chosen position + page for the signing stamp. */}
              {step.requireSignature && expandedSignatureStepId === step.id && (
                <div className={styles.signaturePanel}>
                  <SignaturePlacementCanvas
                    placement={step.signaturePlacement}
                    onChange={(placement) => setStepSignaturePlacement(step.id, placement)}
                    otherSignatures={otherSignatures(step.id)}
                  />
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <div className={styles.builderRow}>
        <PickerPopover
          open={openPicker === 'reviewer'}
          onClose={closePicker}
          reserveHeight={SEARCH_PICKER_HEIGHT}
          popoverClassName={styles.searchPopover}
          trigger={
            <button
              type="button"
              className={`${styles.builderButton} ${styles.builderButtonReviewer}`}
              onClick={() => togglePicker('reviewer')}
            >
              {openPicker === 'reviewer'
                ? t('createCorrespondence.approval.closePicker')
                : `+ ${t('createCorrespondence.approval.addReviewer')}`}
            </button>
          }
        >
          {searchBox(t('createCorrespondence.approval.searchReviewer'))}
          <div className={styles.pickerList}>
            {recipients.map((r) =>
              personOption(r, () => {
                addReviewerStep(r.id, r.name, r.department);
                closePicker();
              })
            )}
          </div>
        </PickerPopover>

        <PickerPopover
          open={openPicker === 'department'}
          onClose={closePicker}
          reserveHeight={SEARCH_PICKER_HEIGHT}
          popoverClassName={styles.searchPopover}
          trigger={
            <button
              type="button"
              className={`${styles.builderButton} ${styles.builderButtonDepartment}`}
              onClick={() => togglePicker('department')}
            >
              {openPicker === 'department'
                ? t('createCorrespondence.approval.closePicker')
                : `+ ${t('createCorrespondence.approval.addDepartment')}`}
            </button>
          }
        >
          {searchBox(t('createCorrespondence.approval.searchDepartment'))}
          <div className={styles.pickerList}>
            {departments.map((d) => (
              <button
                key={d.id}
                type="button"
                className={styles.pickerOption}
                onClick={() => {
                  addDepartmentStep(d.id, d.name);
                  closePicker();
                }}
              >
                {d.name}
              </button>
            ))}
          </div>
        </PickerPopover>

        <PickerPopover
          open={openPicker === 'group'}
          onClose={closePicker}
          trigger={
            <button
              type="button"
              className={`${styles.builderButton} ${styles.builderButtonGroup}`}
              onClick={() => togglePicker('group')}
            >
              {openPicker === 'group'
                ? t('createCorrespondence.approval.closePicker')
                : `+ ${t('createCorrespondence.approval.addGroup')}`}
            </button>
          }
        >
          <button type="button" className={styles.addNewGroupButton} onClick={addNewGroup}>
            + {t('createCorrespondence.approval.addNewGroup')}
          </button>
        </PickerPopover>
      </div>
    </>
  );
};
