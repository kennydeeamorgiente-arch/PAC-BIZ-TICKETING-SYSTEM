'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { CheckCircle2, Gauge, TicketCheck, TriangleAlert } from 'lucide-react';
import * as XLSX from 'xlsx';
import DashboardLayout from '@/components/layout/DashboardLayout';
import ProtectedRoute from '@/components/auth/ProtectedRoute';
import ShiftComparison from '@/components/reports/ShiftComparison';
import ReportStatCard from '@/components/reports/ReportStatCard';
import TicketFlowTrend from '@/components/reports/TicketFlowTrend';
import SlaDistributionChart from '@/components/reports/SlaDistributionChart';
import TechnicianSlaChart from '@/components/reports/TechnicianSlaChart';
import AiReviewAnalyticsPanel from '@/components/ai-review/AiReviewAnalyticsPanel';
import api from '@/lib/api';

const EMPTY_ACTIVITY_SERIES = {
  created: [],
  closed: [],
  reopened: [],
  overdue: [],
  collab: [],
};

function toDateInputValue(date) {
  const d = new Date(date);
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mm}-${dd}`;
}

function sumSeriesTotals(rows = []) {
  return (rows || []).reduce((sum, row) => sum + Number(row?.total || 0), 0);
}

function formatMinutesToHuman(minutesValue) {
  const minutes = Math.max(0, Math.round(Number(minutesValue || 0)));
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (hours <= 0) return `${mins} mins`;
  return `${hours}h ${mins}m`;
}

function normalizeReportSettings(data) {
  const overdueDays = Math.max(1, Math.min(30, Math.round(Number(data?.overdue_days || 3))));
  const healthy = Math.max(1, Math.min(100, Math.round(Number(data?.sla_healthy_threshold || 90))));
  const monitor = Math.max(0, Math.min(healthy - 1, Math.round(Number(data?.sla_monitor_threshold || 70))));
  return {
    overdueDays,
    slaHealthyThreshold: healthy,
    slaMonitorThreshold: monitor,
  };
}

export default function ReportsPage() {
  const [rangePreset, setRangePreset] = useState('7');
  const [startDate, setStartDate] = useState(toDateInputValue(new Date(Date.now() - 7 * 86400000)));
  const [endDate, setEndDate] = useState(toDateInputValue(new Date()));
  const [shiftRows, setShiftRows] = useState([]);
  const [techRows, setTechRows] = useState([]);
  const [activitySeries, setActivitySeries] = useState(EMPTY_ACTIVITY_SERIES);
  const [aiInsights, setAiInsights] = useState(null);
  const [reportSettings, setReportSettings] = useState({
    overdueDays: 3,
    slaHealthyThreshold: 90,
    slaMonitorThreshold: 70,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const derivedWindowDays = useMemo(() => {
    const start = new Date(startDate);
    const end = new Date(endDate);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return 30;
    const diffMs = Math.abs(end.getTime() - start.getTime());
    const diffDays = Math.floor(diffMs / 86400000) + 1;
    return Math.max(7, Math.min(365, diffDays));
  }, [startDate, endDate]);

  const loadReports = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [shifts, techs, activity, aiDashboard, settingsRes] = await Promise.all([
        api.getShiftReport(startDate, endDate),
        api.getTechnicianPerformance(startDate, endDate),
        api.getTicketActivity(startDate, endDate).catch(() => null),
        api.getAiReviewDashboard({ days: derivedWindowDays, startDate, endDate }).catch(() => null),
        api.getReportSettings().catch(() => null),
      ]);

      const shiftData = shifts?.data || shifts || [];
      const techData = techs?.data || techs || [];
      const activityData = activity?.data?.series || EMPTY_ACTIVITY_SERIES;
      const aiData = aiDashboard?.data || null;
      const settings = normalizeReportSettings(settingsRes?.data || null);

      setShiftRows(Array.isArray(shiftData) ? shiftData : []);
      setTechRows(Array.isArray(techData) ? techData : []);
      setActivitySeries(activityData);
      setAiInsights(aiData);
      setReportSettings(settings);
    } catch (e) {
      setShiftRows([]);
      setTechRows([]);
      setActivitySeries(EMPTY_ACTIVITY_SERIES);
      setAiInsights(null);
      setReportSettings({
        overdueDays: 3,
        slaHealthyThreshold: 90,
        slaMonitorThreshold: 70,
      });
      setError(e?.message || 'Failed to load reports from server.');
    } finally {
      setLoading(false);
    }
  }, [startDate, endDate, derivedWindowDays]);

  useEffect(() => {
    loadReports();
  }, [loadReports]);

  useEffect(() => {
    if (rangePreset === 'custom') return;
    const end = new Date();
    let start = new Date();

    if (rangePreset === 'last_year') {
      const y = end.getFullYear() - 1;
      start = new Date(y, 0, 1);
      const lastYearEnd = new Date(y, 11, 31);
      setStartDate(toDateInputValue(start));
      setEndDate(toDateInputValue(lastYearEnd));
      return;
    }

    const days = Number(rangePreset);
    if (!days || Number.isNaN(days)) return;
    start = new Date(Date.now() - days * 86400000);
    setStartDate(toDateInputValue(start));
    setEndDate(toDateInputValue(end));
  }, [rangePreset]);

  const summary = useMemo(() => {
    const totalResolved = shiftRows.reduce((sum, r) => sum + Number(r.resolved || 0), 0);
    const avgSla = techRows.length
      ? Math.round(techRows.reduce((sum, t) => sum + Number(t.slaCompliance || 0), 0) / techRows.length)
      : 0;
    const avgResolutionMinutes = shiftRows.length
      ? Math.round(shiftRows.reduce((sum, r) => sum + Number(r.avgResolutionMinutes || 0), 0) / shiftRows.length)
      : 0;

    const created = sumSeriesTotals(activitySeries.created);
    const closed = sumSeriesTotals(activitySeries.closed);
    const reopened = sumSeriesTotals(activitySeries.reopened);
    const overdue = sumSeriesTotals(activitySeries.overdue);

    const closureRate = created > 0 ? Math.round((closed / created) * 100) : 0;
    const reopenRate = closed > 0 ? Math.round((reopened / closed) * 100) : 0;
    const backlogDelta = created - closed;

    const topTechnician = [...techRows].sort((a, b) => Number(b.resolved || 0) - Number(a.resolved || 0))[0] || null;
    const bestShift = [...shiftRows].sort((a, b) => Number(b.resolved || 0) - Number(a.resolved || 0))[0] || null;

    return {
      totalResolved,
      avgSla,
      techCount: techRows.length,
      avgResolutionMinutes,
      created,
      closed,
      reopened,
      overdue,
      closureRate,
      reopenRate,
      backlogDelta,
      topTechnician,
      bestShift,
    };
  }, [shiftRows, techRows, activitySeries]);

  const shiftDetails = useMemo(
    () => [...shiftRows].sort((a, b) => Number(b.resolved || 0) - Number(a.resolved || 0)),
    [shiftRows]
  );

  const exportCsv = () => {
    const rows = techRows.map((r) => ({
      technician: r.name || '',
      resolved: Number(r.resolved || 0),
      sla_compliance: Number(r.slaCompliance || 0),
    }));

    if (rows.length === 0) return;

    const header = Object.keys(rows[0]).join(',');
    const body = rows
      .map((row) => Object.values(row).map((v) => `"${String(v).replaceAll('"', '""')}"`).join(','))
      .join('\n');

    const blob = new Blob([`${header}\n${body}`], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `technician_report_${startDate}_${endDate}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const exportExcel = () => {
    const rows = techRows.map((r) => ({
      technician: r.name || '',
      resolved: Number(r.resolved || 0),
      sla_compliance: Number(r.slaCompliance || 0),
    }));
    if (rows.length === 0) return;

    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Technicians');
    XLSX.writeFile(wb, `technician_report_${startDate}_${endDate}.xlsx`);
  };

  return (
    <ProtectedRoute allowedRoles={['technician', 'admin']}>
      <DashboardLayout>
        <div className="mb-4 rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
          <h1 className="text-2xl font-bold text-gray-900">Reports & Analytics</h1>
          <p className="mt-1 text-sm text-gray-500">Deep analytics for throughput, quality, SLA, shift output, and AI intake outcomes.</p>
        </div>

        <div className="mb-4 rounded-2xl border border-gray-200 bg-white p-3 shadow-sm">
          <div className="grid w-full grid-cols-1 gap-2 rounded-xl border border-gray-200 bg-gray-50 p-2.5 lg:grid-cols-12">
            <select
              value={rangePreset}
              onChange={(e) => setRangePreset(e.target.value)}
              className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm lg:col-span-3"
            >
              <option value="7">Last 7 Days</option>
              <option value="30">Last 30 Days</option>
              <option value="90">Last 3 Months</option>
              <option value="365">This Year</option>
              <option value="last_year">Last Year</option>
              <option value="custom">Custom</option>
            </select>
            {rangePreset === 'custom' ? (
              <>
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm lg:col-span-2"
                />
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm lg:col-span-2"
                />
              </>
            ) : null}
            <button
              onClick={loadReports}
              className="rounded-lg bg-secondary-500 px-4 py-2 text-sm font-semibold text-white hover:bg-secondary-600 lg:col-span-1"
            >
              Apply
            </button>
            <button
              onClick={exportCsv}
              className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50 lg:col-span-2"
            >
              Export CSV
            </button>
            <button
              onClick={exportExcel}
              className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50 lg:col-span-2"
            >
              Export Excel
            </button>
          </div>
        </div>

        {error ? (
          <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            {error}
          </div>
        ) : null}

        <div className="mb-4 grid grid-cols-[repeat(auto-fit,minmax(220px,1fr))] gap-3">
          <ReportStatCard title="Resolved Tickets" value={summary.totalResolved} subtitle="Completed in selected range" icon={TicketCheck} tone="primary" />
          <ReportStatCard title="Average SLA" value={`${summary.avgSla}%`} subtitle="Technician compliance average" icon={Gauge} tone="secondary" />
          <ReportStatCard title="Avg Resolution Time" value={formatMinutesToHuman(summary.avgResolutionMinutes)} subtitle="Service completion speed" icon={CheckCircle2} tone="secondary" />
          <ReportStatCard
            title="Overdue Pressure"
            value={summary.overdue}
            subtitle={`Backlog delta ${summary.backlogDelta} | threshold ${reportSettings.overdueDays} day(s)`}
            icon={TriangleAlert}
            tone="warning"
          />
        </div>

        {loading ? (
          <div className="rounded-xl border border-gray-200 bg-white p-8 text-center text-sm text-gray-500">Loading reports...</div>
        ) : (
          <div className="grid grid-cols-1 gap-4">
            <TicketFlowTrend series={activitySeries} startDate={startDate} endDate={endDate} />

            <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
              <ShiftComparison rows={shiftRows} />
              <section className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
                <h3 className="text-sm font-semibold text-gray-900">Shift Detail Breakdown</h3>
                <p className="mt-1 text-xs text-gray-500">Resolved output and average resolution time by shift.</p>
                <div className="mt-3 overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200 text-sm">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Shift</th>
                        <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Resolved</th>
                        <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Avg Resolution</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {shiftDetails.map((row) => (
                        <tr key={row.shift || 'unassigned'}>
                          <td className="px-3 py-2 font-medium text-gray-900">{row.shift || 'UNASSIGNED'}</td>
                          <td className="px-3 py-2 text-gray-700">{Number(row.resolved || 0)}</td>
                          <td className="px-3 py-2 text-gray-700">{Math.round(Number(row.avgResolutionMinutes || 0))} mins</td>
                        </tr>
                      ))}
                      {shiftDetails.length === 0 ? (
                        <tr>
                          <td colSpan={3} className="px-3 py-4 text-center text-gray-500">
                            No shift performance records in selected range.
                          </td>
                        </tr>
                      ) : null}
                    </tbody>
                  </table>
                </div>
              </section>
            </div>

            <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
              <TechnicianSlaChart rows={techRows} />
              <SlaDistributionChart
                rows={techRows}
                thresholds={{
                  healthyThreshold: reportSettings.slaHealthyThreshold,
                  monitorThreshold: reportSettings.slaMonitorThreshold,
                }}
              />
              <section id="ai-analytics" className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm xl:col-span-2">
                <h3 className="text-sm font-semibold text-gray-900">AI Intake & Review Analytics</h3>
                <p className="mt-1 text-xs text-gray-500">
                  Deep AI metrics are centralized here so the AI Review page can stay action-focused.
                </p>
                <AiReviewAnalyticsPanel dashboard={aiInsights} />
              </section>
            </div>

            <section className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
              <h3 className="text-sm font-semibold text-gray-900">Operational Snapshot</h3>
              <p className="mt-1 text-xs text-gray-500">Non-duplicate summary signals that complement the charts above.</p>
              <div className="mt-3 grid grid-cols-[repeat(auto-fit,minmax(170px,1fr))] gap-2">
                <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2">
                  <p className="text-[11px] uppercase tracking-wide text-gray-500">Top Technician</p>
                  <p className="mt-1 text-sm font-semibold text-gray-900">{summary.topTechnician?.name || 'No data'}</p>
                </div>
                <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2">
                  <p className="text-[11px] uppercase tracking-wide text-gray-500">Best Shift</p>
                  <p className="mt-1 text-sm font-semibold text-gray-900">{summary.bestShift?.shift || 'No data'}</p>
                </div>
                <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2">
                  <p className="text-[11px] uppercase tracking-wide text-gray-500">Closure Rate</p>
                  <p className="mt-1 text-sm font-semibold text-gray-900">{summary.closureRate}%</p>
                </div>
                <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2">
                  <p className="text-[11px] uppercase tracking-wide text-gray-500">Reopen Rate</p>
                  <p className="mt-1 text-sm font-semibold text-gray-900">{summary.reopenRate}%</p>
                </div>
                <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2">
                  <p className="text-[11px] uppercase tracking-wide text-gray-500">Created vs Closed</p>
                  <p className="mt-1 text-sm font-semibold text-gray-900">{summary.created} vs {summary.closed}</p>
                </div>
                <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2">
                  <p className="text-[11px] uppercase tracking-wide text-gray-500">Resolution Time</p>
                  <p className="mt-1 text-sm font-semibold text-gray-900">{formatMinutesToHuman(summary.avgResolutionMinutes)}</p>
                </div>
              </div>
            </section>
          </div>
        )}
      </DashboardLayout>
    </ProtectedRoute>
  );
}
