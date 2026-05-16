import { useEffect, useRef, useState } from 'react';
import MetricCard from '../components/MetricCard';
import SectionHeader from '../components/SectionHeader';
import AnalyticsCharts from '../components/AnalyticsCharts';
import ModalShell from '../components/ModalShell';
import { api } from '../lib/api';
import { createSocket } from '../lib/socket';
import { formatDate, formatCurrency } from '../lib/formatters';

const TABS = ['Overview', 'Safety', 'Users', 'Reports', 'Bans', 'Verifications'];

const REPORT_STATUS_STYLES = {
  open: 'bg-ember/10 text-ember',
  reviewing: 'bg-amber-100 text-amber-700',
  resolved: 'bg-reef/10 text-reef'
};

const VERIFICATION_STATUS_STYLES = {
  pending: 'bg-amber-100 text-amber-700',
  approved: 'bg-reef/10 text-reef',
  rejected: 'bg-ember/10 text-ember'
};

const INCIDENT_STATUS_STYLES = {
  open: 'bg-ember/10 text-ember',
  reviewing: 'bg-amber-100 text-amber-700',
  resolved: 'bg-reef/10 text-reef'
};

const INCIDENT_SEVERITY_STYLES = {
  low: 'bg-sand text-ink/60',
  medium: 'bg-dusk/10 text-dusk',
  high: 'bg-amber-100 text-amber-700',
  critical: 'bg-ember text-white'
};

const upsertByKey = (items = [], nextItem, key) => [
  nextItem,
  ...items.filter((item) => item?.[key] !== nextItem?.[key])
];

const buildIncidentSummary = (incidents = []) =>
  incidents.reduce(
    (summary, incident) => {
      summary.total += 1;
      summary[incident.status] = (summary[incident.status] || 0) + 1;
      summary.bySeverity[incident.severity] = (summary.bySeverity[incident.severity] || 0) + 1;
      summary.byIncidentType[incident.incidentType] =
        (summary.byIncidentType[incident.incidentType] || 0) + 1;
      summary.byCategory[incident.category] = (summary.byCategory[incident.category] || 0) + 1;

      if (['high', 'critical'].includes(incident.severity)) {
        summary.highOrCritical += 1;
      }

      if (
        incident.incidentType === 'chat_message' &&
        incident.autoActions?.includes('message_hidden')
      ) {
        summary.hiddenMessages += 1;
      }

      if (incident.incidentType === 'booking') {
        summary.bookingRisks += 1;
      }

      return summary;
    },
    {
      total: 0,
      open: 0,
      reviewing: 0,
      resolved: 0,
      highOrCritical: 0,
      bySeverity: {
        low: 0,
        medium: 0,
        high: 0,
        critical: 0
      },
      byIncidentType: {},
      byCategory: {},
      hiddenMessages: 0,
      bookingRisks: 0
    }
  );

const applyIncidentSummaryUpdate = (summary, previousIncident, nextIncident) => {
  if (!summary || !previousIncident) {
    return summary;
  }

  const nextSummary = {
    ...summary,
    bySeverity: {
      ...(summary.bySeverity || {})
    },
    byIncidentType: {
      ...(summary.byIncidentType || {})
    },
    byCategory: {
      ...(summary.byCategory || {})
    }
  };

  if (previousIncident.status !== nextIncident.status) {
    nextSummary[previousIncident.status] = Math.max(
      0,
      Number(nextSummary[previousIncident.status] || 0) - 1
    );
    nextSummary[nextIncident.status] = Number(nextSummary[nextIncident.status] || 0) + 1;
  }

  if (previousIncident.severity !== nextIncident.severity) {
    nextSummary.bySeverity[previousIncident.severity] = Math.max(
      0,
      Number(nextSummary.bySeverity[previousIncident.severity] || 0) - 1
    );
    nextSummary.bySeverity[nextIncident.severity] =
      Number(nextSummary.bySeverity[nextIncident.severity] || 0) + 1;

    if (!['high', 'critical'].includes(previousIncident.severity) && ['high', 'critical'].includes(nextIncident.severity)) {
      nextSummary.highOrCritical = Number(nextSummary.highOrCritical || 0) + 1;
    }

    if (['high', 'critical'].includes(previousIncident.severity) && !['high', 'critical'].includes(nextIncident.severity)) {
      nextSummary.highOrCritical = Math.max(0, Number(nextSummary.highOrCritical || 0) - 1);
    }
  }

  return nextSummary;
};

const AdminPage = () => {
  const [activeTab, setActiveTab] = useState('Overview');
  const [dashboard, setDashboard] = useState(null);
  const [bookingAnalytics, setBookingAnalytics] = useState(null);
  const [users, setUsers] = useState([]);
  const [overviewReports, setOverviewReports] = useState([]);
  const [overviewBans, setOverviewBans] = useState([]);
  const [overviewIncidents, setOverviewIncidents] = useState([]);
  const [reports, setReports] = useState([]);
  const [bans, setBans] = useState([]);
  const [incidents, setIncidents] = useState([]);
  const [dashboardSafetySummary, setDashboardSafetySummary] = useState(null);
  const [loadingIncidents, setLoadingIncidents] = useState(false);
  const [loadingReports, setLoadingReports] = useState(false);
  const [loadingBans, setLoadingBans] = useState(false);
  const [verifications, setVerifications] = useState([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [loadingVerifications, setLoadingVerifications] = useState(false);
  const [hasLoadedIncidents, setHasLoadedIncidents] = useState(false);
  const [userSearch, setUserSearch] = useState('');
  const [banModal, setBanModal] = useState(null);
  const [banReason, setBanReason] = useState('');
  const [banning, setBanning] = useState(false);
  const [actionFeedback, setActionFeedback] = useState(null);
  const overviewIncidentsRef = useRef([]);
  const incidentsRef = useRef([]);
  const incidentSummary = buildIncidentSummary(incidents);
  overviewIncidentsRef.current = overviewIncidents;
  incidentsRef.current = incidents;

  const flash = (msg, tone = 'success') => {
    setActionFeedback({ msg, tone });
    setTimeout(() => setActionFeedback(null), 3000);
  };

  // ── Load overview ──────────────────────────────────────────────────────────
  useEffect(() => {
    const load = async () => {
      try {
        const [dashboardRes, analyticsRes] = await Promise.all([
          api.get('/api/admin/dashboard'),
          api.get('/api/bookings/analytics/admin')
        ]);
        const recentReports = dashboardRes.data.data.recentReports || [];
        const activeBans = dashboardRes.data.data.activeBans || [];
        const recentIncidents = dashboardRes.data.data.recentIncidents || [];
        setDashboard(dashboardRes.data.data);
        setOverviewReports(recentReports);
        setOverviewBans(activeBans);
        setOverviewIncidents(recentIncidents);
        setReports((current) => (current.length ? current : recentReports));
        setBans((current) => (current.length ? current : activeBans));
        setIncidents((current) => (current.length ? current : recentIncidents));
        setDashboardSafetySummary(dashboardRes.data.data.safetySummary || null);
        setBookingAnalytics(analyticsRes.data.data);
      } catch {
        // handled silently
      }
    };
    load();

    const socket = createSocket('/socket/admin');
    socket.on('admin:analytics', (snapshot) => {
      setDashboard((prev) => ({ ...prev, snapshot }));
    });
    const handleSafetyIncidentCreated = (incident) => {
      setOverviewIncidents((current) => upsertByKey(current, incident, 'incidentId').slice(0, 12));
      if (hasLoadedIncidents) {
        setIncidents((current) => upsertByKey(current, incident, 'incidentId'));
      }
      setDashboardSafetySummary((current) => ({
        total: (current?.total || 0) + 1,
        open: (current?.open || 0) + 1,
        reviewing: current?.reviewing || 0,
        resolved: current?.resolved || 0,
        highOrCritical:
          (current?.highOrCritical || 0) + (['high', 'critical'].includes(incident.severity) ? 1 : 0),
        bySeverity: {
          low: current?.bySeverity?.low || 0,
          medium: current?.bySeverity?.medium || 0,
          high: current?.bySeverity?.high || 0,
          critical: current?.bySeverity?.critical || 0,
          [incident.severity]: (current?.bySeverity?.[incident.severity] || 0) + 1
        },
        byIncidentType: {
          ...(current?.byIncidentType || {}),
          [incident.incidentType]: (current?.byIncidentType?.[incident.incidentType] || 0) + 1
        },
        byCategory: {
          ...(current?.byCategory || {}),
          [incident.category]: (current?.byCategory?.[incident.category] || 0) + 1
        },
        hiddenMessages:
          (current?.hiddenMessages || 0) +
          (incident.incidentType === 'chat_message' &&
          incident.autoActions?.includes('message_hidden')
            ? 1
            : 0),
        bookingRisks:
          (current?.bookingRisks || 0) + (incident.incidentType === 'booking' ? 1 : 0)
      }));
    };
    const handleSafetyIncidentUpdated = (incident) => {
      const previousIncident =
        incidentsRef.current.find((item) => item.incidentId === incident.incidentId) ||
        overviewIncidentsRef.current.find((item) => item.incidentId === incident.incidentId) ||
        null;

      setOverviewIncidents((current) =>
        current.some((item) => item.incidentId === incident.incidentId)
          ? current.map((item) => (item.incidentId === incident.incidentId ? incident : item))
          : current
      );
      if (hasLoadedIncidents) {
        setIncidents((current) =>
          current.some((item) => item.incidentId === incident.incidentId)
            ? current.map((item) => (item.incidentId === incident.incidentId ? incident : item))
            : current
        );
      }
      if (previousIncident) {
        setDashboardSafetySummary((current) =>
          applyIncidentSummaryUpdate(current, previousIncident, incident)
        );
      }
    };

    socket.on('admin:safety-incident', handleSafetyIncidentCreated);
    socket.on('admin:safety-incident-updated', handleSafetyIncidentUpdated);

    return () => {
      socket.off('admin:safety-incident', handleSafetyIncidentCreated);
      socket.off('admin:safety-incident-updated', handleSafetyIncidentUpdated);
      socket.disconnect();
    };
  }, [hasLoadedIncidents]);

  // ── Load users ─────────────────────────────────────────────────────────────
  const loadUsers = async (q = '') => {
    setLoadingUsers(true);
    try {
      const res = await api.get('/api/users', { params: q ? { q } : {} });
      setUsers(res.data.data);
    } catch {
      setUsers([]);
    } finally {
      setLoadingUsers(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'Users') loadUsers(userSearch);
  }, [activeTab]);

  useEffect(() => {
    if (activeTab === 'Users') {
      const timer = setTimeout(() => loadUsers(userSearch), 400);
      return () => clearTimeout(timer);
    }
  }, [userSearch]);

  // ── Load verifications ─────────────────────────────────────────────────────
  const loadVerifications = async () => {
    setLoadingVerifications(true);
    try {
      const res = await api.get('/api/users/organizer-verifications');
      setVerifications(res.data.data);
    } catch {
      setVerifications([]);
    } finally {
      setLoadingVerifications(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'Verifications') loadVerifications();
  }, [activeTab]);

  const loadIncidents = async () => {
    setLoadingIncidents(true);
    setHasLoadedIncidents(true);
    try {
      const response = await api.get('/api/admin/incidents', {
        params: {
          limit: 80
        }
      });
      setIncidents(response.data.data.incidents || []);
    } catch {
      setIncidents([]);
    } finally {
      setLoadingIncidents(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'Safety') {
      loadIncidents();
    }
  }, [activeTab]);

  const loadReports = async () => {
    setLoadingReports(true);
    try {
      const response = await api.get('/api/admin/reports');
      setReports(response.data.data || []);
    } catch {
      setReports([]);
    } finally {
      setLoadingReports(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'Reports') {
      loadReports();
    }
  }, [activeTab]);

  const loadBans = async () => {
    setLoadingBans(true);
    try {
      const response = await api.get('/api/admin/bans');
      setBans(response.data.data || []);
    } catch {
      setBans([]);
    } finally {
      setLoadingBans(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'Bans') {
      loadBans();
    }
  }, [activeTab]);

  // ── Actions ────────────────────────────────────────────────────────────────
  const handleBanUser = async () => {
    if (!banModal || !banReason.trim()) return;
    setBanning(true);
    try {
      const response = await api.post(`/api/admin/users/${banModal.userId}/ban`, { reason: banReason });
      const nextBan = response.data.data;
      setOverviewBans((current) => upsertByKey(current, nextBan, '_id').slice(0, 10));
      setBans((current) => upsertByKey(current, nextBan, '_id'));
      flash(`${banModal.displayName} has been banned.`);
      setBanModal(null);
      setBanReason('');
      loadUsers(userSearch);
    } catch (err) {
      flash(err.response?.data?.message || 'Ban failed.', 'error');
    } finally {
      setBanning(false);
    }
  };

  const handleResolveReport = async (reportId, status) => {
    try {
      await api.patch(`/api/admin/reports/${reportId}`, { status, resolutionNotes: '' });
      setOverviewReports((current) =>
        current.map((report) => (report._id === reportId ? { ...report, status } : report))
      );
      setReports((current) =>
        current.map((report) => (report._id === reportId ? { ...report, status } : report))
      );
      flash('Report updated.');
    } catch {
      flash('Failed to update report.', 'error');
    }
  };

  const handleModerateEvent = async (eventId, action) => {
    try {
      await api.post(`/api/admin/events/${eventId}/moderate`, { action });
      flash(`Event ${action} action applied.`);
    } catch {
      flash('Action failed.', 'error');
    }
  };

  const handleResolveIncident = async (incidentId, status) => {
    try {
      const response = await api.patch(`/api/admin/incidents/${incidentId}`, {
        status,
        resolutionNotes: ''
      });
      setOverviewIncidents((current) =>
        current.map((incident) =>
          incident.incidentId === incidentId ? response.data.data : incident
        )
      );
      setIncidents((current) =>
        current.map((incident) =>
          incident.incidentId === incidentId ? response.data.data : incident
        )
      );
      flash('Safety incident updated.');
    } catch (error) {
      flash(error.response?.data?.message || 'Failed to update safety incident.', 'error');
    }
  };

  const handleVerification = async (requestId, status) => {
    try {
      await api.patch(`/api/users/organizer-verifications/${requestId}`, {
        status,
        notes: status === 'approved' ? 'Application approved by admin.' : 'Application rejected by admin.'
      });
      setVerifications((prev) =>
        prev.map((v) => (v._id === requestId ? { ...v, status } : v))
      );
      flash(
        status === 'approved'
          ? 'Organizer verified and role updated.'
          : 'Verification request rejected.',
        status === 'approved' ? 'success' : 'error'
      );
    } catch (err) {
      flash(err.response?.data?.message || 'Action failed.', 'error');
    }
  };

  const metrics = dashboard?.snapshot?.metrics || {};

  return (
    <div className="space-y-8">
      <SectionHeader
        eyebrow="Administration"
        title="Platform operations"
        description="Realtime metrics, user management, moderation, bans, and organizer verification."
      />

      {actionFeedback && (
        <div
          className={`rounded-2xl px-4 py-3 text-sm ${
            actionFeedback.tone === 'error'
              ? 'bg-ember/10 text-ember'
              : 'bg-reef/10 text-reef'
          }`}
        >
          {actionFeedback.msg}
        </div>
      )}

      {/* Tabs */}
      <div className="flex flex-wrap gap-1 rounded-full border border-ink/10 bg-sand p-1 w-fit">
        {TABS.map((tab) => (
          <button
            key={tab}
            type="button"
            onClick={() => setActiveTab(tab)}
            className={`rounded-full px-4 py-2 text-sm font-medium transition ${
              activeTab === tab ? 'bg-ink text-sand' : 'text-ink/60 hover:text-ink'
            }`}
          >
            {tab}
            {tab === 'Verifications' && verifications.filter((v) => v.status === 'pending').length > 0 && (
              <span className="ml-1.5 rounded-full bg-ember px-1.5 py-0.5 text-[10px] font-bold text-white">
                {verifications.filter((v) => v.status === 'pending').length}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* ── OVERVIEW TAB ── */}
      {activeTab === 'Overview' && (
        <div className="space-y-8">
          <section className="grid gap-4 md:grid-cols-4">
            <MetricCard label="Users" value={metrics.users || 0} />
            <MetricCard label="Organizers" value={metrics.organizers || 0} accent="text-dusk" />
            <MetricCard label="Bookings" value={metrics.bookingsConfirmed || 0} accent="text-ember" />
            <MetricCard label="Revenue" value={formatCurrency(metrics.revenue || 0)} />
          </section>

          <section className="grid gap-4 md:grid-cols-4">
            <MetricCard label="Events Created" value={metrics.eventsCreated || 0} accent="text-dusk" />
            <MetricCard label="Published" value={metrics.eventsPublished || 0} accent="text-reef" />
            <MetricCard label="Chat Messages" value={metrics.chatMessages || 0} accent="text-ink" />
            <MetricCard label="Live Interactions" value={metrics.liveInteractions || 0} accent="text-ember" />
          </section>

          <section className="grid gap-4 md:grid-cols-4">
            <MetricCard label="Open Safety" value={dashboardSafetySummary?.open || 0} accent="text-ember" />
            <MetricCard label="High Risk" value={dashboardSafetySummary?.highOrCritical || 0} accent="text-dusk" />
            <MetricCard label="Hidden Chat" value={dashboardSafetySummary?.hiddenMessages || 0} accent="text-reef" />
            <MetricCard label="Booking Risks" value={dashboardSafetySummary?.bookingRisks || 0} />
          </section>

          <AnalyticsCharts
            title="Platform business analytics"
            description="Revenue, booking velocity, attendee growth, and top events across the whole platform."
            analytics={bookingAnalytics}
          />

          <section className="grid gap-6 lg:grid-cols-2">
            <div className="rounded-[28px] border border-ink/10 bg-white/80 p-5 shadow-bloom">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="font-display text-2xl">Recent safety incidents</h2>
                <button
                  type="button"
                  onClick={() => setActiveTab('Safety')}
                  className="text-xs text-reef hover:underline"
                >
                  View all
                </button>
              </div>
              <div className="space-y-3">
                {!overviewIncidents.length && (
                  <p className="text-sm text-ink/50">No automated safety incidents yet.</p>
                )}
                {overviewIncidents.slice(0, 5).map((incident) => (
                  <div key={incident.incidentId} className="rounded-2xl bg-sand p-4">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-semibold text-ink capitalize">
                        {incident.category.replace(/_/g, ' ')}
                      </p>
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-semibold uppercase ${
                          INCIDENT_SEVERITY_STYLES[incident.severity] || 'bg-ink/8 text-ink/50'
                        }`}
                      >
                        {incident.severity}
                      </span>
                    </div>
                    <p className="mt-1 text-sm text-ink/70">{incident.summary}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Recent reports */}
            <div className="rounded-[28px] border border-ink/10 bg-white/80 p-5 shadow-bloom">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="font-display text-2xl">Recent reports</h2>
                <button
                  type="button"
                  onClick={() => setActiveTab('Reports')}
                  className="text-xs text-reef hover:underline"
                >
                  View all
                </button>
              </div>
              <div className="space-y-3">
                {!overviewReports.length && (
                  <p className="text-sm text-ink/50">No reports found.</p>
                )}
                {overviewReports.slice(0, 5).map((report) => (
                  <div key={report._id} className="rounded-2xl bg-sand p-4">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-semibold text-ink capitalize">
                        {report.reportType} report
                      </p>
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-semibold uppercase ${
                          REPORT_STATUS_STYLES[report.status] || 'bg-ink/8 text-ink/50'
                        }`}
                      >
                        {report.status}
                      </span>
                    </div>
                    <p className="mt-1 text-sm text-ink/70">{report.reason}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Active bans */}
            <div className="rounded-[28px] border border-ink/10 bg-white/80 p-5 shadow-bloom">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="font-display text-2xl">Active bans</h2>
                <button
                  type="button"
                  onClick={() => setActiveTab('Bans')}
                  className="text-xs text-reef hover:underline"
                >
                  View all
                </button>
              </div>
              <div className="space-y-3">
                {!overviewBans.length && <p className="text-sm text-ink/50">No active bans.</p>}
                {overviewBans.slice(0, 5).map((ban) => (
                  <div key={ban._id} className="rounded-2xl bg-sand p-4">
                    <p className="font-mono text-sm font-semibold text-ink">{ban.userId}</p>
                    <p className="mt-1 text-sm text-ink/70">{ban.reason}</p>
                    <p className="mt-1 text-xs text-ink/40">{formatDate(ban.createdAt)}</p>
                  </div>
                ))}
              </div>
            </div>
          </section>
        </div>
      )}

      {/* ── USERS TAB ── */}
      {activeTab === 'Safety' && (
        <div className="space-y-5">
          <section className="grid gap-4 md:grid-cols-4">
            <MetricCard label="Open" value={incidentSummary.open || 0} accent="text-ember" />
            <MetricCard label="Reviewing" value={incidentSummary.reviewing || 0} accent="text-dusk" />
            <MetricCard label="Resolved" value={incidentSummary.resolved || 0} accent="text-reef" />
            <MetricCard label="High / Critical" value={incidentSummary.highOrCritical || 0} />
          </section>

          <div className="overflow-hidden rounded-[28px] border border-ink/10 bg-white/80 shadow-bloom">
            <div className="border-b border-ink/8 px-5 py-4">
              <div className="flex items-center justify-between">
                <h2 className="font-display text-2xl">Safety incident inbox</h2>
                <button
                  type="button"
                  onClick={loadIncidents}
                  className="rounded-full border border-ink/10 bg-sand px-3 py-1.5 text-xs font-medium text-ink hover:bg-white"
                >
                  Refresh
                </button>
              </div>
            </div>

            <div className="divide-y divide-ink/6">
              {loadingIncidents && (
                <div className="px-5 py-10 text-center">
                  <p className="text-sm text-ink/50">Loading safety incidents...</p>
                </div>
              )}

              {!loadingIncidents && !incidents.length && (
                <div className="px-5 py-10 text-center">
                  <p className="text-sm text-ink/50">No safety incidents yet.</p>
                </div>
              )}

              {!loadingIncidents && incidents.map((incident) => (
                <div key={incident.incidentId} className="space-y-3 px-5 py-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="rounded-full bg-sand px-3 py-1 text-xs font-semibold uppercase tracking-[0.15em] text-ink/60">
                          {incident.incidentType.replace(/_/g, ' ')}
                        </span>
                        <span
                          className={`rounded-full px-3 py-1 text-xs font-semibold uppercase ${
                            INCIDENT_SEVERITY_STYLES[incident.severity] || 'bg-ink/8 text-ink/50'
                          }`}
                        >
                          {incident.severity}
                        </span>
                        <span
                          className={`rounded-full px-3 py-1 text-xs font-semibold uppercase ${
                            INCIDENT_STATUS_STYLES[incident.status] || 'bg-ink/8 text-ink/50'
                          }`}
                        >
                          {incident.status}
                        </span>
                      </div>
                      <p className="mt-2 text-sm font-semibold text-ink">{incident.summary}</p>
                      {incident.detail && (
                        <p className="mt-1 text-sm text-ink/65">{incident.detail}</p>
                      )}
                      <p className="mt-2 text-xs text-ink/40">
                        Risk score {incident.riskScore || 0} · {formatDate(incident.detectedAt || incident.createdAt)}
                        {incident.eventTitle ? ` · ${incident.eventTitle}` : ''}
                      </p>
                      {incident.evidence?.length > 0 && (
                        <div className="mt-3 flex flex-wrap gap-2">
                          {incident.evidence.slice(0, 4).map((item) => (
                            <span
                              key={`${incident.incidentId}-${item}`}
                              className="rounded-full border border-ink/10 bg-white px-3 py-1 text-xs text-ink/55"
                            >
                              {item}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>

                    {incident.status !== 'resolved' && (
                      <div className="flex gap-2">
                        {incident.status === 'open' && (
                          <button
                            type="button"
                            onClick={() => handleResolveIncident(incident.incidentId, 'reviewing')}
                            className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs font-medium text-amber-700 hover:bg-amber-100"
                          >
                            Mark reviewing
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => handleResolveIncident(incident.incidentId, 'resolved')}
                          className="rounded-full border border-reef/20 bg-reef/5 px-3 py-1.5 text-xs font-medium text-reef hover:bg-reef/10"
                        >
                          Resolve
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {activeTab === 'Users' && (
        <div className="space-y-5">
          <div className="flex gap-3">
            <input
              value={userSearch}
              onChange={(e) => setUserSearch(e.target.value)}
              placeholder="Search users by name or email..."
              className="flex-1 rounded-2xl border border-ink/10 bg-white/80 px-4 py-3 text-sm outline-none focus:border-reef shadow-bloom"
            />
          </div>

          <div className="overflow-hidden rounded-[28px] border border-ink/10 bg-white/80 shadow-bloom">
            <div className="grid grid-cols-[1fr,auto,auto,auto] gap-4 border-b border-ink/8 px-5 py-3">
              <p className="text-xs uppercase tracking-[0.2em] text-ink/45">User</p>
              <p className="text-xs uppercase tracking-[0.2em] text-ink/45">Role</p>
              <p className="text-xs uppercase tracking-[0.2em] text-ink/45">Status</p>
              <p className="text-xs uppercase tracking-[0.2em] text-ink/45">Actions</p>
            </div>

            {loadingUsers && (
              <div className="px-5 py-8 text-center">
                <p className="text-sm text-ink/50">Loading users...</p>
              </div>
            )}
            {!loadingUsers && !users.length && (
              <div className="px-5 py-8 text-center">
                <p className="text-sm text-ink/50">No users found.</p>
              </div>
            )}

            <div className="divide-y divide-ink/6">
              {users.map((u) => (
                <div
                  key={u.userId}
                  className="grid grid-cols-[1fr,auto,auto,auto] items-center gap-4 px-5 py-4 hover:bg-sand/30"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <div className="h-9 w-9 flex-shrink-0 overflow-hidden rounded-full bg-gradient-to-br from-reef/40 to-dusk/40 flex items-center justify-center text-sm font-semibold text-ink">
                      {u.avatarUrl ? (
                        <img src={u.avatarUrl} alt="" className="h-full w-full object-cover" />
                      ) : (
                        u.displayName?.[0]?.toUpperCase()
                      )}
                    </div>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-ink">{u.displayName}</p>
                      <p className="truncate text-xs text-ink/45">{u.email}</p>
                    </div>
                  </div>
                  <span className="rounded-full bg-dusk/10 px-3 py-1 text-xs font-semibold capitalize text-dusk">
                    {u.role}
                  </span>
                  <span
                    className={`rounded-full px-3 py-1 text-xs font-semibold ${
                      u.isActive ? 'bg-reef/10 text-reef' : 'bg-ember/10 text-ember'
                    }`}
                  >
                    {u.isActive ? 'Active' : 'Inactive'}
                  </span>
                  <button
                    type="button"
                    onClick={() => { setBanModal(u); setBanReason(''); }}
                    disabled={!u.isActive}
                    className="rounded-full border border-ember/20 bg-ember/5 px-3 py-1.5 text-xs font-medium text-ember hover:bg-ember/10 disabled:cursor-not-allowed disabled:opacity-30"
                  >
                    Ban
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── REPORTS TAB ── */}
      {activeTab === 'Reports' && (
        <div className="space-y-4">
          <div className="overflow-hidden rounded-[28px] border border-ink/10 bg-white/80 shadow-bloom">
            <div className="border-b border-ink/8 px-5 py-4">
              <div className="flex items-center justify-between">
                <h2 className="font-display text-2xl">All moderation reports</h2>
                <button
                  type="button"
                  onClick={loadReports}
                  className="rounded-full border border-ink/10 bg-sand px-3 py-1.5 text-xs font-medium text-ink hover:bg-white"
                >
                  Refresh
                </button>
              </div>
            </div>
            <div className="divide-y divide-ink/6">
              {loadingReports && (
                <div className="px-5 py-10 text-center">
                  <p className="text-sm text-ink/50">Loading reports...</p>
                </div>
              )}
              {!loadingReports && !reports.length && (
                <div className="px-5 py-10 text-center">
                  <p className="text-sm text-ink/50">No reports yet.</p>
                </div>
              )}
              {!loadingReports && reports.map((report) => (
                <div key={report._id} className="space-y-2 px-5 py-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="rounded-full bg-sand px-3 py-1 text-xs font-semibold uppercase tracking-[0.15em] text-ink/60">
                          {report.reportType}
                        </span>
                        <span
                          className={`rounded-full px-3 py-1 text-xs font-semibold uppercase ${
                            REPORT_STATUS_STYLES[report.status]
                          }`}
                        >
                          {report.status}
                        </span>
                      </div>
                      <p className="mt-2 text-sm text-ink">{report.reason}</p>
                      <p className="mt-1 text-xs text-ink/40">
                        Reported {formatDate(report.createdAt)} · Target:{' '}
                        <code className="font-mono">{report.targetId}</code>
                      </p>
                    </div>
                    {report.status !== 'resolved' && (
                      <div className="flex gap-2">
                        {report.status === 'open' && (
                          <button
                            type="button"
                            onClick={() => handleResolveReport(report._id, 'reviewing')}
                            className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs font-medium text-amber-700 hover:bg-amber-100"
                          >
                            Mark reviewing
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => handleResolveReport(report._id, 'resolved')}
                          className="rounded-full border border-reef/20 bg-reef/5 px-3 py-1.5 text-xs font-medium text-reef hover:bg-reef/10"
                        >
                          Resolve
                        </button>
                        {report.reportType === 'event' && (
                          <button
                            type="button"
                            onClick={() => handleModerateEvent(report.targetId, 'cancel')}
                            className="rounded-full border border-ember/20 bg-ember/5 px-3 py-1.5 text-xs font-medium text-ember hover:bg-ember/10"
                          >
                            Cancel event
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── BANS TAB ── */}
      {activeTab === 'Bans' && (
        <div className="space-y-4">
          <div className="overflow-hidden rounded-[28px] border border-ink/10 bg-white/80 shadow-bloom">
            <div className="border-b border-ink/8 px-5 py-4">
              <div className="flex items-center justify-between">
                <h2 className="font-display text-2xl">Active bans</h2>
                <button
                  type="button"
                  onClick={loadBans}
                  className="rounded-full border border-ink/10 bg-sand px-3 py-1.5 text-xs font-medium text-ink hover:bg-white"
                >
                  Refresh
                </button>
              </div>
            </div>
            <div className="divide-y divide-ink/6">
              {loadingBans && (
                <div className="px-5 py-10 text-center">
                  <p className="text-sm text-ink/50">Loading bans...</p>
                </div>
              )}
              {!loadingBans && !bans.length && (
                <div className="px-5 py-10 text-center">
                  <p className="text-sm text-ink/50">No active bans.</p>
                </div>
              )}
              {!loadingBans && bans.map((ban) => (
                <div key={ban._id} className="px-5 py-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-mono text-sm font-semibold text-ink">{ban.userId}</p>
                      <p className="mt-1 text-sm text-ink/70">{ban.reason}</p>
                      <p className="mt-1 text-xs text-ink/40">
                        Banned {formatDate(ban.createdAt)}
                        {ban.expiresAt && ` · Expires ${formatDate(ban.expiresAt)}`}
                      </p>
                    </div>
                    <span className="flex-shrink-0 rounded-full bg-ember/10 px-3 py-1 text-xs font-semibold text-ember">
                      Active
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── VERIFICATIONS TAB ── */}
      {activeTab === 'Verifications' && (
        <div className="space-y-4">
          <div className="overflow-hidden rounded-[28px] border border-ink/10 bg-white/80 shadow-bloom">
            <div className="border-b border-ink/8 px-5 py-4">
              <div className="flex items-center justify-between">
                <h2 className="font-display text-2xl">Organizer verification requests</h2>
                <button
                  type="button"
                  onClick={loadVerifications}
                  className="rounded-full border border-ink/10 bg-sand px-3 py-1.5 text-xs font-medium text-ink hover:bg-white"
                >
                  Refresh
                </button>
              </div>
            </div>

            {loadingVerifications && (
              <div className="px-5 py-10 text-center">
                <p className="text-sm text-ink/50">Loading verification requests...</p>
              </div>
            )}

            {!loadingVerifications && !verifications.length && (
              <div className="px-5 py-10 text-center">
                <p className="text-sm text-ink/50">No verification requests yet.</p>
              </div>
            )}

            <div className="divide-y divide-ink/6">
              {verifications.map((req) => (
                <div key={req._id} className="px-5 py-5">
                  <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                    <div className="space-y-1 flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-semibold text-ink">{req.companyName}</p>
                        <span
                          className={`rounded-full px-2 py-0.5 text-xs font-semibold uppercase tracking-[0.15em] ${
                            VERIFICATION_STATUS_STYLES[req.status] || 'bg-ink/8 text-ink/50'
                          }`}
                        >
                          {req.status}
                        </span>
                      </div>
                      <p className="text-sm text-ink/60">
                        Legal name: <strong>{req.legalName}</strong>
                      </p>
                      {req.website && (
                        <a
                          href={req.website}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="block text-sm text-reef hover:underline"
                        >
                          {req.website}
                        </a>
                      )}
                      {req.supportEmail && (
                        <p className="text-sm text-ink/55">{req.supportEmail}</p>
                      )}
                      <p className="text-xs text-ink/40">
                        Submitted {formatDate(req.createdAt)}
                        {req.userId && (
                          <>
                            {' '}· User ID:{' '}
                            <code className="font-mono">{req.userId}</code>
                          </>
                        )}
                      </p>
                      {req.notes && req.status !== 'pending' && (
                        <p className="mt-2 rounded-xl bg-sand px-3 py-2 text-xs text-ink/60">
                          Note: {req.notes}
                        </p>
                      )}
                    </div>

                    {req.status === 'pending' && (
                      <div className="flex gap-2 flex-shrink-0">
                        <button
                          type="button"
                          onClick={() => handleVerification(req._id, 'approved')}
                          className="rounded-full border border-reef/20 bg-reef/5 px-4 py-2 text-sm font-medium text-reef hover:bg-reef/10"
                        >
                          Approve
                        </button>
                        <button
                          type="button"
                          onClick={() => handleVerification(req._id, 'rejected')}
                          className="rounded-full border border-ember/20 bg-ember/5 px-4 py-2 text-sm font-medium text-ember hover:bg-ember/10"
                        >
                          Reject
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Ban modal */}
      {banModal && (
        <ModalShell
          onClose={() => setBanModal(null)}
          labelledBy="ban-user-title"
          closeOnBackdrop={false}
          panelClassName="w-full max-w-md rounded-[28px] border border-ink/10 bg-white p-6 shadow-bloom"
        >
            <h3 id="ban-user-title" className="font-display text-2xl text-ink">Ban user</h3>
            <p className="mt-2 text-sm text-ink/70">
              You are about to ban <strong>{banModal.displayName}</strong> ({banModal.email}). This
              will deactivate their account.
            </p>
            <div className="mt-4">
              <label className="text-xs uppercase tracking-[0.2em] text-ink/45">
                Reason (required)
              </label>
              <textarea
                value={banReason}
                onChange={(e) => setBanReason(e.target.value)}
                placeholder="Describe the reason for this ban..."
                rows={3}
                className="mt-2 w-full rounded-2xl border border-ink/10 bg-sand px-4 py-3 text-sm outline-none focus:border-ember"
              />
            </div>
            <div className="mt-5 flex gap-3">
              <button
                type="button"
                onClick={() => setBanModal(null)}
                className="flex-1 rounded-2xl border border-ink/10 bg-sand px-5 py-3 font-semibold text-ink"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleBanUser}
                disabled={banning || !banReason.trim()}
                className="flex-1 rounded-2xl bg-ember px-5 py-3 font-semibold text-white disabled:opacity-50"
              >
                {banning ? 'Banning...' : 'Confirm ban'}
              </button>
            </div>
        </ModalShell>
      )}
    </div>
  );
};

export default AdminPage;
