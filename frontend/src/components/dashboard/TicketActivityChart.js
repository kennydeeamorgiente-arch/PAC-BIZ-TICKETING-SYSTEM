'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Tooltip,
  Legend,
} from 'chart.js';
import { Line } from 'react-chartjs-2';
import api from '@/lib/api';
import LoadingState from '@/components/common/LoadingState';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Tooltip, Legend);
const EMPTY_SERIES = { created: [], closed: [], reopened: [], overdue: [], collab: [] };

function toDateInputValue(date) {
  const d = new Date(date);
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mm}-${dd}`;
}

function buildDateLabels(startDate, endDate) {
  const out = [];
  const start = new Date(`${startDate}T00:00:00`);
  const end = new Date(`${endDate}T00:00:00`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || start > end) return out;

  let cursor = new Date(start);
  while (cursor <= end) {
    out.push(toDateInputValue(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }
  return out;
}

function seriesToMap(rows = []) {
  const map = new Map();
  for (const row of rows || []) {
    const day = row.day ? toDateInputValue(row.day) : null;
    if (!day) continue;
    map.set(day, Number(row.total || 0));
  }
  return map;
}

function sumSeries(rows = []) {
  return (rows || []).reduce((sum, row) => sum + Number(row?.total || 0), 0);
}

export default function TicketActivityChart({ startDate, endDate, refreshKey = 0 }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [series, setSeries] = useState(EMPTY_SERIES);

  useEffect(() => {
    const load = async () => {
      if (!startDate || !endDate) return;
      setLoading(true);
      setError('');
      try {
        const response = await api.getTicketActivity(startDate, endDate);
        setSeries(response?.data?.series || EMPTY_SERIES);
      } catch (e) {
        setSeries(EMPTY_SERIES);
        setError(e?.message || 'Failed to load ticket activity.');
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [startDate, endDate, refreshKey]);

  const totals = useMemo(
    () => ({
      created: sumSeries(series.created),
      closed: sumSeries(series.closed),
      reopened: sumSeries(series.reopened),
      overdue: sumSeries(series.overdue),
      collab: sumSeries(series.collab),
    }),
    [series]
  );

  const chartData = useMemo(() => {
    const labels = buildDateLabels(startDate, endDate);
    const closedMap = seriesToMap(series.closed);
    const collabMap = seriesToMap(series.collab);
    const createdMap = seriesToMap(series.created);
    const overdueMap = seriesToMap(series.overdue);
    const reopenedMap = seriesToMap(series.reopened);

    const displayLabels = labels.map((d) =>
      new Date(`${d}T00:00:00`).toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' })
    );

    return {
      labels: displayLabels,
      datasets: [
        {
          label: 'Created',
          data: labels.map((d) => createdMap.get(d) || 0),
          borderColor: '#2A9E8F',
          backgroundColor: 'rgba(42, 158, 143, 0.14)',
          borderWidth: 2,
          pointRadius: 0,
          pointHoverRadius: 4,
          tension: 0.34,
        },
        {
          label: 'Closed',
          data: labels.map((d) => closedMap.get(d) || 0),
          borderColor: '#1A3DAA',
          backgroundColor: 'rgba(26, 61, 170, 0.12)',
          borderWidth: 2,
          pointRadius: 0,
          pointHoverRadius: 4,
          tension: 0.34,
        },
        {
          label: 'Reopened',
          data: labels.map((d) => reopenedMap.get(d) || 0),
          borderColor: '#f59e0b',
          backgroundColor: 'rgba(245, 158, 11, 0.12)',
          borderDash: [6, 4],
          borderWidth: 2,
          pointRadius: 0,
          pointHoverRadius: 4,
          tension: 0.3,
        },
        {
          label: 'Overdue',
          data: labels.map((d) => overdueMap.get(d) || 0),
          borderColor: '#e03131',
          backgroundColor: 'rgba(224, 49, 49, 0.11)',
          borderDash: [6, 4],
          borderWidth: 2,
          pointRadius: 0,
          pointHoverRadius: 4,
          tension: 0.3,
        },
        {
          label: 'Collaboration',
          data: labels.map((d) => collabMap.get(d) || 0),
          borderColor: '#3DBE45',
          backgroundColor: 'rgba(61, 190, 69, 0.12)',
          borderWidth: 2,
          pointRadius: 0,
          pointHoverRadius: 4,
          tension: 0.34,
        },
      ],
    };
  }, [series, startDate, endDate]);

  const hasData = totals.created + totals.closed + totals.reopened + totals.overdue + totals.collab > 0;

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    interaction: {
      mode: 'index',
      intersect: false,
    },
    plugins: {
      legend: {
        position: 'bottom',
        labels: {
          boxWidth: 10,
          usePointStyle: true,
          padding: 14,
        },
      },
      tooltip: {
        padding: 10,
        displayColors: true,
      },
    },
    scales: {
      y: {
        beginAtZero: true,
        ticks: { precision: 0 },
        grid: { color: 'rgba(148, 163, 184, 0.18)' },
      },
      x: {
        ticks: { maxRotation: 0, autoSkip: true, maxTicksLimit: 9 },
        grid: { display: false },
      },
    },
  };

  return (
    <section className="rounded-xl border border-gray-200 bg-white p-3 shadow-sm">
      <h3 className="mb-1 text-sm font-semibold text-gray-900">Ticket Activity Trend</h3>
      <p className="mb-2 text-xs text-gray-500">Daily activity across created, closed, overdue, reopened, and collaboration events.</p>
      <div className="mb-2 grid grid-cols-2 gap-2 text-xs sm:grid-cols-5">
        <div className="rounded-md border border-gray-200 bg-gray-50 px-2 py-1.5 text-gray-700">Created: <span className="font-semibold">{totals.created}</span></div>
        <div className="rounded-md border border-gray-200 bg-gray-50 px-2 py-1.5 text-gray-700">Closed: <span className="font-semibold">{totals.closed}</span></div>
        <div className="rounded-md border border-gray-200 bg-gray-50 px-2 py-1.5 text-gray-700">Reopened: <span className="font-semibold">{totals.reopened}</span></div>
        <div className="rounded-md border border-gray-200 bg-gray-50 px-2 py-1.5 text-gray-700">Overdue: <span className="font-semibold">{totals.overdue}</span></div>
        <div className="rounded-md border border-gray-200 bg-gray-50 px-2 py-1.5 text-gray-700">Collab: <span className="font-semibold">{totals.collab}</span></div>
      </div>
      {error ? (
        <div className="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          {error}
        </div>
      ) : null}
      <div className="h-[320px] rounded-lg border border-gray-200 bg-gray-50 p-2">
        {loading ? (
          <LoadingState type="inline" label="Loading activity chart..." className="h-full min-h-0" />
        ) : hasData ? (
          <Line data={chartData} options={options} />
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-gray-500">No ticket activity data in selected range.</div>
        )}
      </div>
    </section>
  );
}
