import * as React from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';

const MyCorrespondenceView = React.lazy(
  () => import(/* webpackChunkName: 'corms-my-correspondence' */ '../modules/myCorrespondence')
);
const MyTasksView = React.lazy(() => import(/* webpackChunkName: 'corms-my-tasks' */ '../modules/myTasks'));
const ApprovalTasksView = React.lazy(
  () => import(/* webpackChunkName: 'corms-approval-tasks' */ '../modules/approvalTasks')
);
const InboxSentView = React.lazy(
  () => import(/* webpackChunkName: 'corms-inbox-sent' */ '../modules/inboxSent')
);
const TriageRoutingView = React.lazy(
  () => import(/* webpackChunkName: 'corms-triage-routing' */ '../modules/triageRouting')
);
const DocControlView = React.lazy(
  () => import(/* webpackChunkName: 'corms-doc-control' */ '../modules/docControl')
);
const DelegationView = React.lazy(
  () => import(/* webpackChunkName: 'corms-delegation' */ '../modules/delegation')
);
const TeamInboxView = React.lazy(
  () => import(/* webpackChunkName: 'corms-team-inbox' */ '../modules/teamInbox')
);
const SearchView = React.lazy(() => import(/* webpackChunkName: 'corms-search' */ '../modules/search'));
const StatisticsView = React.lazy(
  () => import(/* webpackChunkName: 'corms-statistics' */ '../modules/statistics')
);
const AdministrationView = React.lazy(
  () => import(/* webpackChunkName: 'corms-administration' */ '../modules/administration')
);
const AuditTrailView = React.lazy(
  () => import(/* webpackChunkName: 'corms-audit-trail' */ '../modules/auditTrail')
);
const NotFoundView = React.lazy(
  () => import(/* webpackChunkName: 'corms-not-found' */ '../modules/notFound')
);
const DevGridView = React.lazy(() => import(/* webpackChunkName: 'corms-dev-grid' */ '../modules/devGrid'));
const CreateCorrespondenceView = React.lazy(
  () => import(/* webpackChunkName: 'corms-create-correspondence' */ '../modules/createCorrespondence')
);
const CorrespondenceDetailView = React.lazy(
  () => import(/* webpackChunkName: 'corms-correspondence-detail' */ '../modules/correspondenceDetail')
);
const SigningDashboardView = React.lazy(
  () => import(/* webpackChunkName: 'corms-signing-dashboard' */ '../modules/signingDashboard')
);

export const AppRoutes: React.FC = () => (
  <React.Suspense fallback={null}>
    <Routes>
      <Route path="/" element={<Navigate to="/my-correspondence" replace />} />
      <Route path="/my-correspondence" element={<MyCorrespondenceView />} />
      <Route path="/correspondence/new" element={<CreateCorrespondenceView />} />
      <Route path="/correspondence/:id" element={<CorrespondenceDetailView />} />
      <Route path="/my-tasks" element={<MyTasksView />} />
      <Route path="/approval-tasks" element={<ApprovalTasksView />} />
      <Route path="/inbox-sent" element={<Navigate to="/inbox-sent/inbox" replace />} />
      <Route path="/inbox-sent/folder/:folderId" element={<InboxSentView />} />
      <Route path="/inbox-sent/:tab" element={<InboxSentView />} />
      <Route path="/triage-routing" element={<TriageRoutingView />} />
      <Route path="/doc-control" element={<DocControlView />} />
      <Route path="/delegation" element={<DelegationView />} />
      <Route path="/team-inbox" element={<TeamInboxView />} />
      <Route path="/signing" element={<SigningDashboardView />} />
      <Route path="/search" element={<SearchView />} />
      <Route path="/statistics" element={<StatisticsView />} />
      <Route path="/administration" element={<Navigate to="/administration/admin-config" replace />} />
      <Route path="/administration/:tab" element={<AdministrationView />} />
      <Route path="/audit-trail" element={<AuditTrailView />} />
      <Route path="/dev/grid" element={<DevGridView />} />
      <Route path="*" element={<NotFoundView />} />
    </Routes>
  </React.Suspense>
);
