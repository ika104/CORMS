import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { formatCardDateTime } from '../../utils/formatDateTime';
import { useNavigate } from 'react-router-dom';
import { ICorrespondenceStub, SECURITY_TIERS } from '../../models/ICorrespondence';
import { IContentType, IRecordClassification } from '../../models/ICorrespondenceMetadata';
import { IWorkflowRule } from '../../models/IWorkflowRule';
import { resolveWorkflowRule } from '../../utils/workflowRouting';
import { useServices, useNav } from '../../state/hooks';
import { useSlaConfig } from '../notifications/useSlaConfig';
import { computeDeadlineIso } from '../notifications/escalationTimers';
import { Spinner } from '../../components/common/Spinner';
import { SearchBox } from '../../components/common/SearchBox';
import { Button } from '../../components/common/Button';
import { StatusBadge } from '../../components/common/StatusBadge';
import { Icon } from '../../components/icons/Icon';
import { CorrespondenceCard, ICorrespondenceCardField } from '../../components/common/CorrespondenceCard';
import { ActionsMenu } from '../../components/common/ActionsMenu';
import { EmptyState } from '../../components/common/EmptyState';
import { canAccessTriageQueue } from './roleHelpers';
import { ClassifyPanel } from './components/ClassifyPanel';
import { TriagePreviewPanel } from './components/TriagePreviewPanel';
import { AmendClassificationModal } from './components/AmendClassificationModal';
import { ChangeSecurityModal } from './components/ChangeSecurityModal';
import { IRoutingSelection, applyRoutingToStub, canRoute, resolveMatrixRouting } from './routing';
import {
  TRIAGE_STAGES,
  filterTriageQueue,
  isTriageClassifiable,
  isUnseen,
  stageCounts as computeStageCounts,
  unseenCount,
} from './triageQueue';
import {
  IClassifyChange,
  buildClassificationAuditDetails,
  describeChanges,
  diffClassification,
  snapshotFromDraft,
} from './classificationAudit';
import { ITriageDraft, TriageStage } from './types';
import { WorkQueuePanel } from '../workQueue/WorkQueuePanel';
import styles from './TriageRoutingView.module.scss';

// Fallback clearance when the signed-in user's tier can't be resolved (unprovisioned / failed) —
// least privilege. useNav now populates currentUser.clearanceTier from CORMS_UserRoles (admin=max),
// so this is only hit when clearance is genuinely unknown.
const DEFAULT_MAX_CLEARANCE = 1;

// AC5 — how often the queue re-polls the source for newly-arrived correspondence. Deliberately
// short so intake feels real-time; the fetch is cheap (a single list read) and merges in place
// without disturbing the officer's current selection or an in-flight classify edit.
const POLL_INTERVAL_MS = 12000;
// Must match the exit transition in the SCSS (.cardStripItemExiting) — the card is kept mounted
// this long so it can animate out (AC9) before it's dropped from the queue.
const CARD_EXIT_MS = 340;

const TriageRoutingView: React.FC = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { correspondenceDashboardService, workflowMatrixService, metadataService, auditTrailService, routingService, readReceiptService, classificationService } =
    useServices();
  const { currentUser } = useNav();
  // CMS-016 AC4/AC5 — the configured default response-deadline horizon, used to seed a deadline for
  // an incoming item that carries none so the escalation timers (CMS-016) have something to run off.
  const slaConfig = useSlaConfig();

  const [items, setItems] = React.useState<ICorrespondenceStub[] | undefined>(undefined);
  const [rules, setRules] = React.useState<IWorkflowRule[]>([]);
  const [contentTypes, setContentTypes] = React.useState<IContentType[]>([]);
  const [recordClassifications, setRecordClassifications] = React.useState<IRecordClassification[]>([]);
  const [lastSyncedAt, setLastSyncedAt] = React.useState<Date | undefined>(undefined);

  const [stage, setStage] = React.useState<TriageStage>('incoming');
  const [search, setSearch] = React.useState('');
  const [recordTypeFilter, setRecordTypeFilter] = React.useState('');
  const [securityFilter, setSecurityFilter] = React.useState('');
  const [selectedId, setSelectedId] = React.useState<string | undefined>(undefined);
  const [draftByItem, setDraftByItem] = React.useState<Record<string, ITriageDraft>>({});

  // AC9 — ids whose triage the officer has completed this session (dropped from the queue) and ids
  // currently animating out (kept mounted for the exit transition before completion applies).
  const [completedIds, setCompletedIds] = React.useState<Set<string>>(() => new Set());
  const [exitingIds, setExitingIds] = React.useState<Set<string>>(() => new Set());
  // AC5 — ids that arrived on the latest poll (not present on the previous sync) so their card can
  // animate in and read as "just arrived". Cleared once the highlight has played.
  const [enteringIds, setEnteringIds] = React.useState<Set<string>>(() => new Set());
  const knownIdsRef = React.useRef<Set<string> | undefined>(undefined);

  // AC10 — the item shown in the full-correspondence preview drawer, openable from any stage.
  const [previewItem, setPreviewItem] = React.useState<ICorrespondenceStub | undefined>(undefined);
  // AC9 — the item currently being amended through the reason-required flow.
  const [amendItem, setAmendItem] = React.useState<ICorrespondenceStub | undefined>(undefined);
  const [securityAmendItem, setSecurityAmendItem] = React.useState<ICorrespondenceStub | undefined>(undefined);

  // CMS-011 Step 2 — Route. `routeDraftByItem` holds the in-progress recipient/action selection per
  // item; `routedByItem` records a committed routing (which removes the item from the queue, AC8,
  // and overlays the next action on the recipient's work queue, AC3). `routingInFlightId` guards
  // the Route button while the service call is pending.
  const [routeDraftByItem, setRouteDraftByItem] = React.useState<Record<string, IRoutingSelection>>({});
  const [routedByItem, setRoutedByItem] = React.useState<Record<string, { selection: IRoutingSelection; at: string }>>({});
  const [routingInFlightId, setRoutingInFlightId] = React.useState<string | undefined>(undefined);

  // CMS-010 AC5/AC9 — a classify/amend is PERSISTED to CORMS_Correspondence and audited with
  // before/after values (+ the mandatory reason for an amend). Previously this only wrote a local
  // stub audit and never touched the server, so the record kept its original Type/Priority/Security
  // and no audit row was written. classificationService persists the fields and writes the real
  // audit + Timeline entry (live), exactly as routingService does for a route.
  const persistClassification = React.useCallback(
    (item: ICorrespondenceStub, next: ITriageDraft, action: string, changes: IClassifyChange[], reason?: string): Promise<void> => {
      if (changes.length === 0) return Promise.resolve();
      return classificationService.applyClassification({
          correspondenceId: item.id,
          contentType: next.contentTypeName,
          priority: next.priority,
          securityTier: next.securityTier,
          recordClassification: next.recordClassificationLabel,
          responseDeadline: next.responseDeadline,
          action,
          auditDetails: buildClassificationAuditDetails({ changes, reason }),
          summary: describeChanges(changes, (field) => field),
        });
    },
    [classificationService]
  );

  const logTriageEvent = React.useCallback(
    (item: ICorrespondenceStub, action: string, details: string): void => {
      auditTrailService
        .logEvent({
          objectId: item.id,
          actor: currentUser?.displayName ?? 'Unknown',
          action,
          details,
          timestamp: new Date().toISOString(),
        })
        .catch(() => undefined);
    },
    [auditTrailService, currentUser]
  );

  const syncItems = React.useCallback(() => {
    // CMS-009 — read the real CORMS_Correspondence pool (within the officer's clearance, resolved
    // from CORMS_UserRoles with the admin=max rule) via the CORMS-owned dashboard service, then
    // bucket into the triage stages client-side. Previously this used
    // recordsHubService.getMyCorrespondence(), whose live implementation is an empty stub — so the
    // triage queue was always empty in live mode regardless of clearance.
    correspondenceDashboardService
      .getAll()
      .then(async (fetched) => {
        // AC4 — "unseen" is per-officer, backed by CORMS_ReadReceipts (the same source the Triage
        // nav badge uses). The stub mapper doesn't carry `seen`, so populate it here: an item is
        // unseen when the officer has no read receipt for it. Best-effort — if receipts can't be
        // read, treat everything as seen rather than flashing the whole queue as new.
        const unread = await readReceiptService.getUnreadIds(fetched.map((item) => item.id)).catch(() => new Set<string>());
        const withSeen = fetched.map((item) => ({ ...item, seen: !unread.has(item.id) }));
        setItems(withSeen);
        setLastSyncedAt(new Date());
        // AC5 — flag the genuinely-new arrivals (ids unseen on the previous sync) so their card
        // animates in. The first sync seeds the baseline without flashing everything as new.
        const previous = knownIdsRef.current;
        if (previous) {
          const arrivals = withSeen.filter((item) => !previous.has(item.id)).map((item) => item.id);
          if (arrivals.length > 0) {
            setEnteringIds((prev) => {
              const next = new Set(prev);
              arrivals.forEach((id) => next.add(id));
              return next;
            });
            window.setTimeout(() => {
              setEnteringIds((prev) => {
                const next = new Set(prev);
                arrivals.forEach((id) => next.delete(id));
                return next;
              });
            }, 2000);
          }
        }
        knownIdsRef.current = new Set(withSeen.map((item) => item.id));
      })
      .catch(() => setItems((prev) => prev ?? []));
  }, [correspondenceDashboardService, readReceiptService]);

  React.useEffect(() => {
    syncItems();
    workflowMatrixService.getRules().then(setRules).catch(() => setRules([]));
  }, [syncItems, workflowMatrixService]);

  // AC5 — keep the queue current: re-poll on an interval, and immediately whenever the tab regains
  // focus (an officer returning to a backgrounded triage screen should see the latest intake at once).
  React.useEffect(() => {
    const interval = window.setInterval(syncItems, POLL_INTERVAL_MS);
    const onFocus = (): void => syncItems();
    window.addEventListener('focus', onFocus);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener('focus', onFocus);
    };
  }, [syncItems]);

  React.useEffect(() => {
    metadataService.getContentTypes().then(setContentTypes).catch(() => setContentTypes([]));
    metadataService.getRecordClassifications().then(setRecordClassifications).catch(() => setRecordClassifications([]));
  }, [metadataService]);

  if (!items) {
    return (
      <div className={styles.dashboard}>
        <Spinner />
      </div>
    );
  }

  if (!canAccessTriageQueue(currentUser)) {
    return (
      <div className={styles.dashboard}>
        <EmptyState title={t('triageRouting.accessDenied.title')} description={t('triageRouting.accessDenied.description')} />
      </div>
    );
  }

  const maxClearanceTier = currentUser?.clearanceTier ?? DEFAULT_MAX_CLEARANCE;
  const actorName = currentUser?.displayName ?? 'Unknown';

  // AC8 — an item routed this session is removed from the triage queue. Combined with the
  // completed set (CMS-009), these ids are excluded from every stage tab and the card strip.
  const routedIds = new Set(Object.keys(routedByItem));
  const removedFromQueue = new Set<string>();
  completedIds.forEach((id) => removedFromQueue.add(id));
  routedIds.forEach((id) => removedFromQueue.add(id));

  // The item with any committed routing overlaid — carries the routed next action + assignee so the
  // recipient's work queue can show the named Next Step (AC3).
  const effectiveItems = items.map((it) => {
    const routed = routedByItem[it.id];
    return routed ? applyRoutingToStub(it, routed.selection, actorName, routed.at) : it;
  });

  const stageCounts = computeStageCounts(items, maxClearanceTier, removedFromQueue);
  const newCount = unseenCount(items, maxClearanceTier);

  const stageItems = filterTriageQueue(items, {
    stage,
    maxClearanceTier,
    search,
    recordType: stage === 'byClassification' ? recordTypeFilter : undefined,
    securityTier: stage === 'byClassification' ? securityFilter : undefined,
    completedIds: removedFromQueue,
  });

  const selected = stageItems.find((item) => item.id === selectedId) ?? stageItems[0];

  const draftFor = (item: ICorrespondenceStub): ITriageDraft => {
    const existing = draftByItem[item.id];
    if (existing) return existing;
    const classification = recordClassifications.find((rc) => rc.id === item.recordClassificationId);
    return {
      contentTypeId: item.contentType,
      contentTypeName: item.contentType,
      priority: item.priority,
      securityTier: item.securityTier,
      recordClassificationId: item.recordClassificationId,
      recordClassificationLabel:
        classification ? `${classification.recordNumber} — ${classification.name}` : item.recordClassificationName,
      // AC2/AC3 — seed the receive-time deadline from the create-time due date; the officer's
      // receive-time value then takes precedence for this incoming item. CMS-016 AC5 — when the item
      // carries no due date, default it dynamically to (today + sla.responseDeadlineDays) so the
      // escalation timers always have a deadline to measure against, computed from config not hardcoded.
      responseDeadline: item.dueDate || computeDeadlineIso(new Date().toISOString(), slaConfig.responseDeadlineDays),
    };
  };

  // AC5 — an inline classify edit (the receive-time capture) is applied to the draft and written to
  // the audit log with before/after values. The Security Level is never changed here (it always
  // needs a reason — AC9 — and goes through the amend modal instead).
  const handleDraftChange = (item: ICorrespondenceStub, patch: Partial<ITriageDraft>): void => {
    const current = draftByItem[item.id] ?? draftFor(item);
    const nextDraft = { ...current, ...patch };
    setDraftByItem((prev) => ({ ...prev, [item.id]: nextDraft }));
    const changes = diffClassification(snapshotFromDraft(current), snapshotFromDraft(nextDraft));
    // Inline classification is optimistic; a later poll rehydrates the server truth if it fails.
    persistClassification(item, nextDraft, 'Correspondence Classified', changes).catch(() => undefined);
  };

  // AC9 — a reasoned amendment of core metadata (including the Security Level). Applies the new
  // values and writes an audit entry carrying before/after AND the mandatory reason. Document
  // content is never touched — metadata only.
  const handleAmend = async (item: ICorrespondenceStub, next: ITriageDraft, reason: string): Promise<void> => {
    const current = draftByItem[item.id] ?? draftFor(item);
    const changes = diffClassification(snapshotFromDraft(current), snapshotFromDraft(next));
    await persistClassification(item, next, 'Correspondence Classification Amended', changes, reason);
    setDraftByItem((prev) => ({ ...prev, [item.id]: next }));
  };

  // AC9 (CMS-009) — completing an item animates its card out (CARD_EXIT_MS) and then drops it from
  // the queue, so the remaining cards close the gap. Kept session-local (no persistence layer for
  // triage completion yet) and audited like every other triage action.
  const handleCompleteTriage = (item: ICorrespondenceStub): void => {
    if (exitingIds.has(item.id) || completedIds.has(item.id)) return;
    setExitingIds((prev) => {
      const next = new Set(prev);
      next.add(item.id);
      return next;
    });
    window.setTimeout(() => {
      setCompletedIds((prev) => {
        const next = new Set(prev);
        next.add(item.id);
        return next;
      });
      setExitingIds((prev) => {
        const next = new Set(prev);
        next.delete(item.id);
        return next;
      });
      if (selectedId === item.id) setSelectedId(undefined);
      logTriageEvent(item, 'Correspondence Triage Completed', `Triage completed on ${item.referenceNumber || item.subject}`);
    }, CARD_EXIT_MS);
  };

  const openFullRecord = (item: ICorrespondenceStub): void => {
    // AC4 — opening the record marks it read for this officer, so its "New" badge clears on the
    // next queue sync. Best-effort; navigation proceeds regardless.
    readReceiptService.markRead([item.id]).catch(() => undefined);
    navigate(`/correspondence/${item.id}`, {
      state: { tab: 'details', originPath: '/triage-routing', originLabel: t('module.triageRouting.title') },
    });
  };

  const currentDraft = selected ? draftFor(selected) : undefined;
  const matchedRule = selected
    ? resolveWorkflowRule(rules, {
        type: currentDraft?.contentTypeName || selected.contentType || selected.type,
        direction: selected.direction,
        priority: currentDraft?.priority,
        securityLevel: SECURITY_TIERS.find((tier) => tier.tier === currentDraft?.securityTier)?.name,
        // AC3 — a rule scoped to an Originating Function must only match items of that function.
        // Without this the item's function was never supplied, so conditionMatches treated every
        // function-scoped rule as "Any" and applied it regardless. Left lenient when the item has
        // no function (undefined → matches any), preserving the existing behaviour for those items.
        function: selected.originatingFunction,
      })
    : undefined;
  // AC5 — the routing the matrix would auto-apply for the selected item, offered in Step 2.
  const matrixRouting = resolveMatrixRouting(matchedRule);

  // AC5/AC6/AC7 — the in-progress Step 2 selection for the selected item. A selection the officer
  // has actually made wins (manual choice always wins — AC6). Otherwise, when the routing matrix
  // matched this item, the route is PRE-FILLED with the rule's target so the matched rule takes
  // immediate effect the moment the item is opened in Triage (AC7) — the officer then confirms it
  // with one click or overrides it. Falls back to empty when no rule matched.
  const routeSelectionFor = (item: ICorrespondenceStub): IRoutingSelection => {
    const explicit = routeDraftByItem[item.id];
    if (explicit) return explicit;
    if (matrixRouting && selected && item.id === selected.id) return matrixRouting;
    return { recipients: [], nextAction: undefined };
  };

  // AC3/AC6/AC7/AC8 — route the item: persist + audit via the service, then remove it from the
  // queue and overlay the next action on the recipient's work queue. The service owns the audit
  // (attributed + timestamped) and the "unread in the recipient's inbox" notification; real-time
  // push/email is a Power Automate concern, out of scope here.
  const handleRoute = (item: ICorrespondenceStub): void => {
    // Use the effective selection (an explicit pick, else the pre-filled matrix route) so the
    // officer can confirm a matched rule with a single click without first re-selecting it.
    const selection = routeSelectionFor(item);
    if (!selection || !canRoute(selection) || routingInFlightId) return;
    setRoutingInFlightId(item.id);
    routingService
      .route({
        correspondenceId: item.id,
        referenceNo: item.referenceNumber,
        subject: item.subject,
        recipients: selection.recipients,
        nextAction: selection.nextAction as string,
        matrixApplied: selection.matrixApplied,
      })
      .then(() => {
        const at = new Date().toISOString();
        setRoutedByItem((prev) => ({ ...prev, [item.id]: { selection, at } }));
        setRouteDraftByItem((prev) => {
          const next = { ...prev };
          delete next[item.id];
          return next;
        });
        if (selectedId === item.id) setSelectedId(undefined);
      })
      .catch(() => window.alert(t('triageRouting.route.failed')))
      .finally(() => setRoutingInFlightId(undefined));
  };

  const cardFields = (item: ICorrespondenceStub): ICorrespondenceCardField[] => {
    const fields: ICorrespondenceCardField[] = [
      { label: t('triageRouting.card.type'), node: item.type },
      { label: t('triageRouting.card.received'), node: formatCardDateTime(item.createdAt) },
    ];
    if (item.expedited) {
      fields.push({
        label: t('triageRouting.card.expedited'),
        node: (
          <span className={styles.expediteReason} title={item.expedited.reason}>
            <Icon name="alertTriangle" size={11} /> {item.expedited.reason}
          </span>
        ),
      });
    }
    return fields;
  };

  const cardHeaderBadges = (item: ICorrespondenceStub): React.ReactNode => (
    <>
      <StatusBadge label={item.priority} tone={item.priority === 'High' ? 'danger' : 'neutral'} />
      <StatusBadge
        label={SECURITY_TIERS.find((tier) => tier.tier === item.securityTier)?.short ?? String(item.securityTier)}
        tone="neutral"
      />
      {isUnseen(item) && <StatusBadge label={t('triageRouting.card.new')} tone="info" />}
      {item.expedited && <StatusBadge label={t('triageRouting.card.expedited')} tone="danger" />}
    </>
  );

  const stageDescriptionKey: Record<TriageStage, string> = {
    incoming: 'triageRouting.stage.incoming.description',
    underReview: 'triageRouting.stage.underReview.description',
    byClassification: 'triageRouting.stage.byClassification.description',
  };
  const sectionTitleKey: Record<TriageStage, string> = {
    incoming: 'triageRouting.section.incoming',
    underReview: 'triageRouting.section.underReview',
    byClassification: 'triageRouting.section.byClassification',
  };

  return (
    <div className={styles.dashboard}>
      <div className={styles.stageTabsRow}>
        <div className={styles.stageTabs}>
          {TRIAGE_STAGES.map((s) => (
            <button
              key={s}
              type="button"
              className={`${styles.stageTab} ${stage === s ? styles.stageTabActive : ''}`}
              onClick={() => {
                setStage(s);
                setSelectedId(undefined);
              }}
            >
              {t(`triageRouting.stage.${s}.label`)}
              <span className={styles.stageTabBadge}>{stageCounts[s]}</span>
            </button>
          ))}
        </div>
        <div className={styles.liveStatus}>
          {/* AC4 — the unseen/new count, surfaced here on-screen (and on the Triage nav badge). */}
          {newCount > 0 && (
            <span className={styles.newCount}>
              <span className={styles.newDot} />
              {t('triageRouting.newCount', { count: newCount })}
            </span>
          )}
          {/* AC5 — a live indicator that the queue is auto-refreshing. */}
          <span className={styles.liveIndicator} title={t('triageRouting.live.title')}>
            <span className={styles.livePulse} />
            {lastSyncedAt
              ? t('triageRouting.live.updatedAt', { time: lastSyncedAt.toLocaleTimeString() })
              : t('triageRouting.live.label')}
          </span>
        </div>
      </div>

      <div className={styles.stageDescription}>{t(stageDescriptionKey[stage])}</div>

      <div className={styles.sectionHeaderBar}>
        <div className={styles.sectionTitle}>
          {t(sectionTitleKey[stage])} ({stageItems.length})
        </div>
        <div className={styles.sectionCount}>
          {stage === 'underReview'
            ? t('triageRouting.itemCount.underReview', { count: stageItems.length })
            : t('triageRouting.itemCount.pending', { count: stageItems.length })}
        </div>
      </div>

      <div className={styles.toolbarRow}>
        <SearchBox value={search} placeholder={t('triageRouting.searchPlaceholder')} onChange={setSearch} />
        <Button onClick={() => navigate('/search')}>{t('triageRouting.advancedSearch')}</Button>
        {stage === 'byClassification' && (
          <>
            <select className={styles.filterSelect} value={recordTypeFilter} onChange={(e) => setRecordTypeFilter(e.target.value)}>
              <option value="">{t('triageRouting.filter.allRecordTypes')}</option>
              {contentTypes.map((ct) => (
                <option key={ct.id} value={ct.name}>
                  {ct.name}
                </option>
              ))}
            </select>
            <select className={styles.filterSelect} value={securityFilter} onChange={(e) => setSecurityFilter(e.target.value)}>
              <option value="">{t('triageRouting.filter.allClassifications')}</option>
              {SECURITY_TIERS.map((tier) => (
                <option key={tier.tier} value={tier.tier}>
                  {tier.name}
                </option>
              ))}
            </select>
          </>
        )}
      </div>

      {stageItems.length === 0 ? (
        <EmptyState title={t('triageRouting.noItems')} />
      ) : (
        <>
          <div className={styles.cardStrip}>
            {stageItems.map((item) => {
              const exiting = exitingIds.has(item.id);
              const classNames = [
                styles.cardStripItem,
                item.id === selected?.id ? styles.cardStripItemSelected : '',
                isUnseen(item) ? styles.cardStripItemUnseen : '',
                enteringIds.has(item.id) ? styles.cardStripItemEntering : '',
                exiting ? styles.cardStripItemExiting : '',
              ]
                .filter(Boolean)
                .join(' ');
              return (
                <div
                  key={item.id}
                  className={classNames}
                  onClick={() => !exiting && setSelectedId(item.id)}
                >
                  <CorrespondenceCard
                    refNo={item.referenceNumber || '—'}
                    subject={item.subject}
                    headerBadges={cardHeaderBadges(item)}
                    fields={cardFields(item)}
                    actions={
                      <ActionsMenu
                        items={[
                          {
                            key: 'preview',
                            labelKey: 'triageRouting.preview.action',
                            iconName: 'eye',
                            onClick: () => setPreviewItem(item),
                          },
                          {
                            key: 'view',
                            labelKey: 'myCorrespondence.viewDetails',
                            iconName: 'externalLink',
                            onClick: () => openFullRecord(item),
                          },
                        ]}
                        ariaLabelKey="myCorrespondence.actions"
                      />
                    }
                    footer={
                      <button
                        type="button"
                        className={styles.completeBtn}
                        onClick={(e) => {
                          e.stopPropagation();
                          handleCompleteTriage(item);
                        }}
                      >
                        <Icon name="check" size={13} />
                        {t('triageRouting.card.complete')}
                      </button>
                    }
                  />
                </div>
              );
            })}
          </div>

          {selected && currentDraft && (
            <ClassifyPanel
              item={selected}
              draft={currentDraft}
              onDraftChange={(patch) => handleDraftChange(selected, patch)}
              readOnly={!isTriageClassifiable(selected)}
              onAmendClassification={() => setAmendItem(selected)}
              onChangeSecurity={() => setSecurityAmendItem(selected)}
              routingSelection={routeSelectionFor(selected)}
              onRoutingSelectionChange={(next) => setRouteDraftByItem((prev) => ({ ...prev, [selected.id]: next }))}
              matrixRouting={matrixRouting}
              onRoute={() => handleRoute(selected)}
              routing={routingInFlightId === selected.id}
            />
          )}
        </>
      )}

      {/* CMS-013 — the officer's personal Work Queue, shared with the dashboard. Passes the
          routing-overlaid items so a just-routed item shows its named Next Step (AC1); completed
          items are excluded, clearance/holder/actionable filtering + sort live in the panel. */}
      <WorkQueuePanel
        items={effectiveItems}
        // AC7 — the queue owner is the signed-in officer. Items carry their holder as AssignedTo's
        // display name (stub.assignedTo = AssignedTo.Title), so match on the current user's display
        // name — not a hardcoded placeholder id, which matched nothing and left the queue empty.
        userId={currentUser?.displayName ?? ''}
        maxClearanceTier={maxClearanceTier}
        excludeIds={completedIds}
        onOpen={openFullRecord}
        onPreview={setPreviewItem}
        titleKey="triageRouting.myWorkQueue.title"
      />

      {previewItem && (
        <TriagePreviewPanel
          item={previewItem}
          isOpen
          onDismiss={() => setPreviewItem(undefined)}
          onOpenFull={() => {
            const item = previewItem;
            setPreviewItem(undefined);
            openFullRecord(item);
          }}
        />
      )}

      {amendItem && (
        <AmendClassificationModal
          item={amendItem}
          captured={draftFor(amendItem)}
          maxClearanceTier={maxClearanceTier}
          onDismiss={() => setAmendItem(undefined)}
          onSubmit={(next, reason) => handleAmend(amendItem, next, reason)}
        />
      )}

      {securityAmendItem && (
        <ChangeSecurityModal
          item={securityAmendItem}
          captured={draftFor(securityAmendItem)}
          maxClearanceTier={maxClearanceTier}
          onDismiss={() => setSecurityAmendItem(undefined)}
          onSubmit={(next, reason) => handleAmend(securityAmendItem, next, reason)}
        />
      )}
    </div>
  );
};

export default TriageRoutingView;
