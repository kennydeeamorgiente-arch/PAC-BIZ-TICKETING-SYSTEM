'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowRight, Ticket, CircleDot, ShieldCheck, AlertCircle, TriangleAlert } from 'lucide-react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import ProtectedRoute from '@/components/auth/ProtectedRoute';
import StatsCard from '@/components/dashboard/StatsCard';
import ShiftTimer from '@/components/dashboard/ShiftTimer';
import RecentActivity from '@/components/dashboard/RecentActivity';
import TicketActivityChart from '@/components/dashboard/TicketActivityChart';
import StatusBreakdownChart from '@/components/dashboard/StatusBreakdownChart';
import { useAuth } from '@/context/AuthContext';
import { useTickets } from '@/hooks/useTickets';
import { useRealtime } from '@/hooks/useRealtime';
import { formatDate } from '@/lib/utils';

function toDateInputValue(date) {
  const d = new Date(date);
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mm}-${dd}`;
}

function formatRangeLabel(startDate, endDate) {
  const start = new Date(`${startDate}T00:00:00`);
  const end = new Date(`${endDate}T00:00:00`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return 'Selected range';
  const options = { month: 'short', day: '2-digit', year: 'numeric' };
  return `${start.toLocaleDateString('en-US', options)} - ${end.toLocaleDateString('en-US', options)}`;
}

export default function DashboardPage() {
  const { user } = useAuth();
  const { tickets, loading, error, refresh } = useTickets();
  const [rangePreset, setRangePreset] = useState('this_month');
  const [rangePeriod, setRangePeriod] = useState('up_to_today');
  const [startDate, setStartDate] = useState(toDateInputValue(new Date(new Date().getFullYear(), new Date().getMonth(), 1)));
  const [endDate, setEndDate] = useState(toDateInputValue(new Date()));
  const [activityRefreshKey, setActivityRefreshKey] = useState(0);

  useRealtime({
    enabled: true,
    intervalMs: 15000,
    onTick: refresh,
  });

  const applyPresetRange = (preset, period = rangePeriod) => {
    const now = new Date();
    const year = now.getFullYear();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    if (preset === 'this_month') {
      setStartDate(toDateInputValue(new Date(year, now.getMonth(), 1)));
      setEndDate(toDateInputValue(period === 'full_period' ? new Date(year, now.getMonth() + 1, 0) : today));
      return;
    }

    if (preset === 'this_year') {
      setStartDate(toDateInputValue(new Date(year, 0, 1)));
      setEndDate(toDateInputValue(period === 'full_period' ? new Date(year, 11, 31) : today));
      return;
    }

    if (preset === 'last_year') {
      setStartDate(toDateInputValue(new Date(year - 1, 0, 1)));
      setEndDate(toDateInputValue(new Date(year - 1, 11, 31)));
      return;
    }

    if (preset === 'last_month') {
      const y = now.getMonth() === 0 ? year - 1 : year;
      const m = now.getMonth() === 0 ? 11 : now.getMonth() - 1;
      setStartDate(toDateInputValue(new Date(y, m, 1)));
      setEndDate(toDateInputValue(new Date(y, m + 1, 0)));
      return;
    }

    if (preset === 'last_30_days') {
      setStartDate(toDateInputValue(new Date(today.getTime() - 29 * 86400000)));
      setEndDate(toDateInputValue(today));
      return;
    }

    if (preset === 'last_7_days') {
      setStartDate(toDateInputValue(new Date(today.getTime() - 6 * 86400000)));
      setEndDate(toDateInputValue(today));
    }
  };

  const onChangeRangePreset = (preset) => {
    setRangePreset(preset);
    if (preset === 'custom') return;
    applyPresetRange(preset, rangePeriod);
  };

  const onChangeRangePeriod = (period) => {
    setRangePeriod(period);
    if (rangePreset === 'custom') return;
    applyPresetRange(rangePreset, period);
  };

  const filteredTickets = useMemo(() => {
    const start = new Date(`${startDate}T00:00:00`);
    const end = new Date(`${endDate}T23:59:59`);

    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return tickets;

    return tickets.filter((t) => {
      if (!t.created_at) return true;
      const createdAt = new Date(t.created_at);
      if (Number.isNaN(createdAt.getTime())) return true;
      return createdAt >= start && createdAt <= end;
    });
  }, [tickets, startDate, endDate]);

  const metrics = useMemo(() => {
    const total = filteredTickets.length;
    const open = filteredTickets.filter((t) => ['new', 'open'].includes(t.status)).length;
    const inProgress = filteredTickets.filter((t) => ['in_progress', 'reopened'].includes(t.status)).length;
    const resolvedOrClosed = filteredTickets.filter((t) => t.status === 'resolved' || t.status === 'closed').length;
    const overdue = filteredTickets.filter((t) => t.status !== 'resolved' && t.status !== 'closed' && Number(t.is_overdue ?? t.sla_breach) === 1).length;
    const compliance = total === 0 ? 100 : Math.round((resolvedOrClosed / total) * 100);

    return { total, open, inProgress, overdue, compliance };
  }, [filteredTickets]);

  const activityItems = useMemo(
    () =>
      [...filteredTickets]
        .sort((a, b) => new Date(b.updated_at || b.created_at || 0).getTime() - new Date(a.updated_at || a.created_at || 0).getTime())
        .slice(0, 25)
        .map((t) => ({
          id: t.id,
          title: `${t.ticket_number || `TKT-${t.id}`} - ${t.title || 'Ticket updated'}`,
          meta: `Status: ${t.status || 'open'} | ${t.updated_at ? formatDate(t.updated_at) : formatDate(t.created_at)}`,
        })),
    [filteredTickets]
  );

  const overviewInsights = useMemo(() => {
    const resolved = filteredTickets.filter((t) => ['resolved', 'closed'].includes(String(t.status || '').toLowerCase())).length;
    const reopened = filteredTickets.filter((t) => String(t.status || '').toLowerCase() === 'reopened').length;
    const unresolved = filteredTickets.length - resolved;
    const closureRate = filteredTickets.length > 0 ? Math.round((resolved / filteredTickets.length) * 100) : 0;

    return {
      resolved,
      reopened,
      unresolved,
      closureRate,
    };
  }, [filteredTickets]);

  const rangeLabel = useMemo(() => formatRangeLabel(startDate, endDate), [startDate, endDate]);
  const liveUpdatedLabel = new Date().toLocaleString('en-US', {
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });

  return (
    <ProtectedRoute allowedRoles={['technician', 'admin']}>
      <DashboardLayout>
        <section className="space-y-3">
          <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h1 className="text-2xl font-bold text-gray-900">Dashboard Overview</h1>
                <p className="mt-1 text-sm text-gray-500">
                  Welcome back{user?.name ? `, ${user.name}` : ''}. Quick, clear view of queue health and live operations.
                </p>
                <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                  <span className="rounded-full border border-gray-300 bg-gray-50 px-2.5 py-1 text-gray-700">{rangeLabel}</span>
                  <span className="rounded-full border border-accent-200 bg-accent-50 px-2.5 py-1 text-accent-700 dark:border-accent-700 dark:bg-accent-900/35 dark:text-accent-200">
                    Auto refresh: 15s
                  </span>
                  <span className="rounded-full border border-gray-300 bg-gray-50 px-2.5 py-1 text-gray-700">Updated: {liveUpdatedLabel}</span>
                </div>
              </div>
              <Link
                href="/reports"
                className="inline-flex items-center gap-1 rounded-lg border border-gray-300 bg-white px-3 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-50"
              >
                Deep Reports
                <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </div>
          </div>

          <div className="rounded-2xl border border-gray-200 bg-white p-3 shadow-sm">
            <div className="grid grid-cols-1 gap-2 lg:grid-cols-[auto_minmax(0,1fr)] lg:items-center">
              <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">Dashboard Timeframe</div>
              <div className="flex flex-wrap items-center gap-2 rounded-xl border border-gray-200 bg-gray-50 px-2.5 py-2">
                <select
                  value={rangePreset}
                  onChange={(e) => onChangeRangePreset(e.target.value)}
                  className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm"
                >
                  <option value="last_month">Last Month</option>
                  <option value="last_30_days">Last 30 Days</option>
                  <option value="last_7_days">Last 7 Days</option>
                  <option value="this_month">This Month</option>
                  <option value="this_year">This Year</option>
                  <option value="last_year">Last Year</option>
                  <option value="custom">Custom</option>
                </select>
                <select
                  value={rangePeriod}
                  onChange={(e) => onChangeRangePeriod(e.target.value)}
                  className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm"
                >
                  <option value="up_to_today">Up to Today</option>
                  <option value="full_period">Full Period</option>
                </select>
                {rangePreset === 'custom' ? (
                  <>
                    <input
                      type="date"
                      value={startDate}
                      onChange={(e) => setStartDate(e.target.value)}
                      className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm"
                    />
                    <input
                      type="date"
                      value={endDate}
                      onChange={(e) => setEndDate(e.target.value)}
                      className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm"
                    />
                  </>
                ) : null}
                <button
                  type="button"
                  onClick={() => {
                    refresh();
                    setActivityRefreshKey((prev) => prev + 1);
                  }}
                  className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-100"
                >
                  Refresh
                </button>
              </div>
            </div>
          </div>

          {error ? (
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-800">
              API warning: {error}
            </div>
          ) : null}

          {loading ? (
            <div className="rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm text-gray-600">
              Loading latest tickets...
            </div>
          ) : null}

          <div className="grid grid-cols-[repeat(auto-fit,minmax(210px,1fr))] gap-3">
            <StatsCard title="Total Tickets" value={metrics.total} subtitle="Within selected timeframe" trend={null} icon={Ticket} tone="primary" />
            <StatsCard title="Open Tickets" value={metrics.open} subtitle="Waiting for action" trend={null} icon={CircleDot} tone="warning" />
            <StatsCard title="In Progress" value={metrics.inProgress} subtitle="Currently being handled" trend={null} icon={AlertCircle} tone="secondary" />
            <StatsCard title="Overdue" value={metrics.overdue} subtitle="Past SLA threshold" trend={null} icon={TriangleAlert} tone="warning" />
            <StatsCard title="Resolution Rate" value={`${metrics.compliance}%`} subtitle="Resolved + closed share" trend={null} icon={ShieldCheck} tone="secondary" />
          </div>

          <div className="grid grid-cols-1 gap-3 xl:grid-cols-12">
            <div className="xl:col-span-8">
              <TicketActivityChart startDate={startDate} endDate={endDate} refreshKey={activityRefreshKey} />
            </div>
            <div className="space-y-3 xl:col-span-4">
              <StatusBreakdownChart tickets={filteredTickets} />
              <ShiftTimer shiftType={user?.shift_type || 'AM'} className="h-[170px] min-h-[170px] max-h-[170px]" />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
            <div className="lg:col-span-2">
              <RecentActivity items={activityItems} className="h-[230px] min-h-[230px] max-h-[230px] w-full" />
            </div>
            <div className="rounded-xl border border-gray-200 bg-white p-3 shadow-sm">
              <h3 className="text-sm font-semibold text-gray-900">Action Center</h3>
              <p className="mt-1 text-xs text-gray-500">Simple guidance to keep the queue healthy.</p>
              <div className="mt-2 space-y-2 text-xs text-gray-700">
                <div className="rounded-lg border border-gray-200 bg-gray-50 px-2.5 py-2">
                  <p className="text-[11px] uppercase tracking-wide text-gray-500">Queue Health</p>
                  <p className="mt-1 font-semibold text-gray-900">
                    {overviewInsights.closureRate >= 85 ? 'Healthy flow' : 'Needs attention'}
                  </p>
                  <p className="text-[11px] text-gray-600">Closure rate {overviewInsights.closureRate}% | Unresolved {overviewInsights.unresolved}</p>
                </div>
                <div className="rounded-lg border border-gray-200 bg-gray-50 px-2.5 py-2">
                  <p className="text-[11px] uppercase tracking-wide text-gray-500">Risk Signal</p>
                  <p className="mt-1 font-semibold text-gray-900">
                    {metrics.overdue > 0 ? `${metrics.overdue} overdue tickets require attention` : 'No overdue tickets in current range'}
                  </p>
                </div>
                <div className="rounded-lg border border-gray-200 bg-gray-50 px-2.5 py-2">
                  <p className="text-[11px] uppercase tracking-wide text-gray-500">Reopened</p>
                  <p className="mt-1 font-semibold text-gray-900">{overviewInsights.reopened} tickets reopened</p>
                </div>
                <Link href="/tickets" className="inline-flex items-center gap-1 pt-1 font-semibold text-secondary-700 hover:underline">
                  Open Ticket Queue
                  <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              </div>
            </div>
          </div>
        </section>
      </DashboardLayout>
    </ProtectedRoute>
  );
}
