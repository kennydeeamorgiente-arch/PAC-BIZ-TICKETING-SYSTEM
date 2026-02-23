'use client';

import { useEffect, useMemo, useState } from 'react';
import * as XLSX from 'xlsx';
import DashboardLayout from '@/components/layout/DashboardLayout';
import ProtectedRoute from '@/components/auth/ProtectedRoute';
import ShiftComparison from '@/components/reports/ShiftComparison';
import TechnicianLeaderboard from '@/components/reports/TechnicianLeaderboard';
import api from '@/lib/api';

function toDateInputValue(date) {
  const d = new Date(date);
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mm}-${dd}`;
}

export default function ReportsPage() {
  const [rangePreset, setRangePreset] = useState('7');
  const [startDate, setStartDate] = useState(toDateInputValue(new Date(Date.now() - 7 * 86400000)));
  const [endDate, setEndDate] = useState(toDateInputValue(new Date()));
  const [shiftRows, setShiftRows] = useState([]);
  const [techRows, setTechRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [aiInsights, setAiInsights] = useState(null);

  const loadReports = async () => {
    setLoading(true);
    setError('');
    try {
      const startTs = new Date(startDate).getTime();
      const endTs = new Date(endDate).getTime();
      const dayMs = 86400000;
      const derivedDays = Math.max(7, Math.min(365, Math.ceil((Math.max(endTs, startTs) - Math.min(endTs, startTs) + dayMs) / dayMs)));

      const [shifts, techs, aiData] = await Promise.all([
        api.getShiftReport(startDate, endDate),
        api.getTechnicianPerformance(startDate, endDate),
        api.getAiReviewDashboard(derivedDays).catch(() => null),
      ]);

      const shiftData = shifts?.data || shifts || [];
      const techData = techs?.data || techs || [];

      setShiftRows(Array.isArray(shiftData) ? shiftData : []);
      setTechRows(Array.isArray(techData) ? techData : []);
      setAiInsights(aiData?.data || null);
    } catch (e) {
      setShiftRows([]);
      setTechRows([]);
      setAiInsights(null);
      setError(e?.message || 'Failed to load reports from server.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadReports();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
    return { totalResolved, avgSla, techCount: techRows.length };
  }, [shiftRows, techRows]);

  const aiSummary = useMemo(() => {
    const outcomes = Array.isArray(aiInsights?.noise_outcomes) ? aiInsights.noise_outcomes : [];
    const totalFiltered = outcomes
      .filter((row) => ['ignore', 'quarantine'].includes(String(row.decision || '').toLowerCase()))
      .reduce((sum, row) => sum + Number(row.total || 0), 0);
    return {
      totalInferences: Number(aiInsights?.summary?.total_inferences_window || 0),
      needsReview: Number(aiInsights?.summary?.needs_review_window || 0),
      totalFiltered,
    };
  }, [aiInsights]);

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
          <p className="mt-1 text-sm text-gray-500">Shift and technician performance within your selected date range.</p>
        </div>

        <div className="mb-6 rounded-2xl border border-gray-200 bg-white p-3 shadow-sm">
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

        <div className="mb-6 grid grid-cols-1 gap-4 lg:grid-cols-3">
          <div className="rounded-xl border border-primary-100 bg-gradient-to-br from-primary-50/80 to-white p-5 shadow-sm backdrop-blur-sm dark:border-violet-700/50 dark:from-slate-900 dark:to-violet-950/60">
            <p className="text-sm text-slate-500 dark:text-slate-300">Total Resolved</p>
            <p className="mt-1 text-3xl font-bold text-slate-900 dark:text-white">{summary.totalResolved}</p>
          </div>
          <div className="rounded-xl border border-secondary-100 bg-gradient-to-br from-secondary-50/75 to-white p-5 shadow-sm backdrop-blur-sm dark:border-indigo-700/50 dark:from-slate-900 dark:to-indigo-950/60">
            <p className="text-sm text-slate-500 dark:text-slate-300">Avg SLA Compliance</p>
            <p className="mt-1 text-3xl font-bold text-slate-900 dark:text-white">{summary.avgSla}%</p>
          </div>
          <div className="rounded-xl border border-emerald-100 bg-gradient-to-br from-emerald-50/70 to-white p-5 shadow-sm backdrop-blur-sm dark:border-cyan-700/50 dark:from-slate-900 dark:to-cyan-950/45">
            <p className="text-sm text-slate-500 dark:text-slate-300">Technicians Tracked</p>
            <p className="mt-1 text-3xl font-bold text-slate-900 dark:text-white">{summary.techCount}</p>
          </div>
        </div>

        <div className="mb-6 grid grid-cols-1 gap-4 lg:grid-cols-3">
          <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
            <p className="text-xs uppercase text-gray-500">AI Inferences (window)</p>
            <p className="mt-1 text-2xl font-bold text-gray-900">{aiSummary.totalInferences}</p>
          </div>
          <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
            <p className="text-xs uppercase text-gray-500">AI Needs Review</p>
            <p className="mt-1 text-2xl font-bold text-gray-900">{aiSummary.needsReview}</p>
          </div>
          <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
            <p className="text-xs uppercase text-gray-500">Filtered Non-ticket/Noise</p>
            <p className="mt-1 text-2xl font-bold text-gray-900">{aiSummary.totalFiltered}</p>
          </div>
        </div>

        {loading ? (
          <div className="rounded-xl border border-gray-200 bg-white p-8 text-center text-sm text-gray-500">Loading reports...</div>
        ) : (
          <div className="grid grid-cols-1 gap-6">
            <ShiftComparison rows={shiftRows} />
            <TechnicianLeaderboard rows={techRows} />
          </div>
        )}
      </DashboardLayout>
    </ProtectedRoute>
  );
}
