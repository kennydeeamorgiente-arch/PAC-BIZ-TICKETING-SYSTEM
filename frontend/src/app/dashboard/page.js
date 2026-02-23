'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Ticket, CircleDot, ShieldCheck, AlertCircle, TriangleAlert } from 'lucide-react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import ProtectedRoute from '@/components/auth/ProtectedRoute';
import StatsCard from '@/components/dashboard/StatsCard';
import ShiftTimer from '@/components/dashboard/ShiftTimer';
import RecentActivity from '@/components/dashboard/RecentActivity';
import OperationsBoard from '@/components/dashboard/OperationsBoard';
import TicketActivityChart from '@/components/dashboard/TicketActivityChart';
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

function toSafeTimestamp(value) {
  const ts = new Date(value).getTime();
  return Number.isFinite(ts) ? ts : null;
}

function formatAverageMinutes(minutesValue) {
  const minutes = Number(minutesValue || 0);
  if (!Number.isFinite(minutes) || minutes <= 0) return '--';
  const rounded = Math.round(minutes);
  const h = Math.floor(rounded / 60);
  const m = rounded % 60;
  if (h <= 0) return `${m}m`;
  return `${h}h ${m}m`;
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

  const supportTableRows = useMemo(() => {
    const map = new Map();
    for (const ticket of filteredTickets) {
      const key = ticket.assigned_to_name || 'Unassigned';
      if (!map.has(key)) {
        map.set(key, {
          name: key,
          open: 0,
          in_progress: 0,
          reopened: 0,
          resolved: 0,
          closed: 0,
          total: 0,
          response_total_minutes: 0,
          response_count: 0,
          service_total_minutes: 0,
          service_count: 0,
        });
      }
      const row = map.get(key);
      const status = String(ticket.status || 'open').toLowerCase();
      if (status === 'open' || status === 'new') row.open += 1;
      else if (status === 'in_progress') row.in_progress += 1;
      else if (status === 'reopened') row.reopened += 1;
      else if (status === 'resolved') row.resolved += 1;
      else if (status === 'closed') row.closed += 1;
      row.total += 1;

      const createdTs = toSafeTimestamp(ticket.created_at);
      const firstResponseTs = toSafeTimestamp(ticket.first_response_at);
      if (createdTs && firstResponseTs && firstResponseTs >= createdTs) {
        row.response_total_minutes += (firstResponseTs - createdTs) / 60000;
        row.response_count += 1;
      }

      if (status === 'resolved' || status === 'closed') {
        const endTs = toSafeTimestamp(ticket.resolved_at) || toSafeTimestamp(ticket.closed_at);
        if (createdTs && endTs && endTs >= createdTs) {
          row.service_total_minutes += (endTs - createdTs) / 60000;
          row.service_count += 1;
        }
      }
    }

    return [...map.values()]
      .map((row) => ({
        ...row,
        avg_response_minutes: row.response_count > 0 ? row.response_total_minutes / row.response_count : null,
        avg_service_minutes: row.service_count > 0 ? row.service_total_minutes / row.service_count : null,
      }))
      .sort((a, b) => b.total - a.total);
  }, [filteredTickets]);

  return (
    <ProtectedRoute allowedRoles={['technician', 'admin']}>
      <DashboardLayout>
        <section className="space-y-3">
          <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
            <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
            <p className="mt-1 text-sm text-gray-500">
              Welcome back{user?.name ? `, ${user.name}` : ''}. Here is your current support overview.
            </p>
          </div>

          <div className="rounded-2xl border border-gray-200 bg-white p-3 shadow-sm">
            <div className="grid grid-cols-1 gap-2 lg:grid-cols-[auto_minmax(0,1fr)] lg:items-center">
              <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">Report Timeframe</div>
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

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-5">
            <StatsCard title="Total Tickets" value={metrics.total} subtitle="Across all statuses" trend={8} icon={Ticket} tone="primary" />
            <StatsCard title="Open Tickets" value={metrics.open} subtitle="Need immediate action" trend={-4} icon={CircleDot} tone="warning" />
            <StatsCard title="In Progress" value={metrics.inProgress} subtitle="Actively being worked" trend={6} icon={AlertCircle} tone="secondary" />
            <StatsCard title="Overdue" value={metrics.overdue} subtitle="SLA breached unresolved" trend={3} icon={TriangleAlert} tone="warning" />
            <StatsCard title="SLA Compliance" value={`${metrics.compliance}%`} subtitle="Within SLA target" trend={5} icon={ShieldCheck} tone="secondary" className="sm:col-span-2 lg:col-span-3 2xl:col-span-1" />
          </div>

          <div className="grid grid-cols-1 items-start gap-3 lg:grid-cols-3">
            <div className="lg:col-span-1 self-start">
              <ShiftTimer shiftType={user?.shift_type || 'AM'} className="h-[190px] min-h-[190px] max-h-[190px]" />
            </div>
            <div className="lg:col-span-2 self-start">
              <RecentActivity items={activityItems} className="h-[190px] min-h-[190px] max-h-[190px]" />
            </div>
          </div>

          <TicketActivityChart startDate={startDate} endDate={endDate} refreshKey={activityRefreshKey} />

          <OperationsBoard tickets={filteredTickets} />

          <section className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-gray-900">IT Support Workload</h3>
              <Link href="/tickets" className="text-xs font-semibold text-secondary-700 hover:underline">
                View all tickets
              </Link>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200 text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-3 py-2 text-left font-semibold text-gray-600">IT Support</th>
                    <th className="px-3 py-2 text-left font-semibold text-gray-600">Open</th>
                    <th className="px-3 py-2 text-left font-semibold text-gray-600">In Progress</th>
                    <th className="px-3 py-2 text-left font-semibold text-gray-600">Reopened</th>
                    <th className="px-3 py-2 text-left font-semibold text-gray-600">Resolved</th>
                    <th className="px-3 py-2 text-left font-semibold text-gray-600">Closed</th>
                    <th className="px-3 py-2 text-left font-semibold text-gray-600">Service Time</th>
                    <th className="px-3 py-2 text-left font-semibold text-gray-600">Response Time</th>
                    <th className="px-3 py-2 text-left font-semibold text-gray-600">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {supportTableRows.map((row) => (
                    <tr key={row.name}>
                      <td className="px-3 py-2 font-medium text-gray-900">{row.name}</td>
                      <td className="px-3 py-2 text-gray-700">{row.open}</td>
                      <td className="px-3 py-2 text-gray-700">{row.in_progress}</td>
                      <td className="px-3 py-2 text-gray-700">{row.reopened}</td>
                      <td className="px-3 py-2 text-gray-700">{row.resolved}</td>
                      <td className="px-3 py-2 text-gray-700">{row.closed}</td>
                      <td className="px-3 py-2 text-gray-700">{formatAverageMinutes(row.avg_service_minutes)}</td>
                      <td className="px-3 py-2 text-gray-700">{formatAverageMinutes(row.avg_response_minutes)}</td>
                      <td className="px-3 py-2 text-gray-900">{row.total}</td>
                    </tr>
                  ))}
                  {supportTableRows.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="px-3 py-4 text-center text-gray-500">
                        No workload data in selected range.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </section>
        </section>
      </DashboardLayout>
    </ProtectedRoute>
  );
}
