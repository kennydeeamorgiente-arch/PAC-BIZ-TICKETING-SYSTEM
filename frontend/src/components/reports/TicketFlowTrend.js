'use client';

import { useMemo } from 'react';
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

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Tooltip, Legend);
const EMPTY_ROWS = [];

function toDateInputValue(date) {
  const d = new Date(date);
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mm}-${dd}`;
}

function buildDateRange(startDate, endDate) {
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

function mapDailyTotals(rows = []) {
  const map = new Map();
  for (const row of rows || []) {
    const day = row?.day ? toDateInputValue(row.day) : null;
    if (!day) continue;
    map.set(day, Number(row.total || 0));
  }
  return map;
}

function sumRows(rows = []) {
  return (rows || []).reduce((sum, row) => sum + Number(row?.total || 0), 0);
}

export default function TicketFlowTrend({ series = {}, startDate, endDate }) {
  const created = Array.isArray(series?.created) ? series.created : EMPTY_ROWS;
  const closed = Array.isArray(series?.closed) ? series.closed : EMPTY_ROWS;
  const reopened = Array.isArray(series?.reopened) ? series.reopened : EMPTY_ROWS;
  const overdue = Array.isArray(series?.overdue) ? series.overdue : EMPTY_ROWS;

  const totals = useMemo(
    () => ({
      created: sumRows(created),
      closed: sumRows(closed),
      reopened: sumRows(reopened),
      overdue: sumRows(overdue),
    }),
    [created, closed, reopened, overdue]
  );

  const chartData = useMemo(() => {
    const labels = buildDateRange(startDate, endDate);
    const createdMap = mapDailyTotals(created);
    const closedMap = mapDailyTotals(closed);
    const reopenedMap = mapDailyTotals(reopened);
    const overdueMap = mapDailyTotals(overdue);

    const displayLabels = labels.map((d) =>
      new Date(`${d}T00:00:00`).toLocaleDateString('en-US', { month: 'short', day: '2-digit' })
    );

    return {
      labels: displayLabels,
      datasets: [
        {
          label: 'Created',
          data: labels.map((d) => createdMap.get(d) || 0),
          borderColor: '#2A9E8F',
          backgroundColor: 'rgba(42, 158, 143, 0.18)',
          pointRadius: 2.5,
          borderWidth: 2,
          tension: 0.28,
        },
        {
          label: 'Closed',
          data: labels.map((d) => closedMap.get(d) || 0),
          borderColor: '#1A3DAA',
          backgroundColor: 'rgba(26, 61, 170, 0.16)',
          pointRadius: 2.5,
          borderWidth: 2,
          tension: 0.28,
        },
        {
          label: 'Reopened',
          data: labels.map((d) => reopenedMap.get(d) || 0),
          borderColor: '#f59e0b',
          backgroundColor: 'rgba(245, 158, 11, 0.15)',
          pointRadius: 2.5,
          borderWidth: 2,
          tension: 0.28,
        },
        {
          label: 'Overdue',
          data: labels.map((d) => overdueMap.get(d) || 0),
          borderColor: '#e03131',
          backgroundColor: 'rgba(224, 49, 49, 0.14)',
          pointRadius: 2.5,
          borderWidth: 2,
          tension: 0.28,
        },
      ],
    };
  }, [created, closed, reopened, overdue, startDate, endDate]);

  const hasData = totals.created > 0 || totals.closed > 0 || totals.reopened > 0 || totals.overdue > 0;

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
        },
      },
    },
    scales: {
      y: {
        beginAtZero: true,
        ticks: { precision: 0 },
        grid: { color: 'rgba(148, 163, 184, 0.18)' },
      },
      x: {
        grid: { display: false },
      },
    },
  };

  return (
    <section className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold text-gray-900">Ticket Flow Trend</h3>
          <p className="text-xs text-gray-500">Created vs closed signal plus reopen and overdue pressure.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs text-gray-500">
          <span className="rounded-md bg-gray-100 px-2 py-1">Created: {totals.created}</span>
          <span className="rounded-md bg-gray-100 px-2 py-1">Closed: {totals.closed}</span>
          <span className="rounded-md bg-gray-100 px-2 py-1">Reopened: {totals.reopened}</span>
          <span className="rounded-md bg-gray-100 px-2 py-1">Overdue: {totals.overdue}</span>
        </div>
      </div>

      <div className="h-[320px] rounded-lg border border-gray-200 bg-gray-50 p-2">
        {hasData ? (
          <Line data={chartData} options={options} />
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-gray-500">No ticket activity data in this date range.</div>
        )}
      </div>
    </section>
  );
}
