'use client';

import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Tooltip,
  Legend,
} from 'chart.js';
import { Bar } from 'react-chartjs-2';

ChartJS.register(CategoryScale, LinearScale, BarElement, Tooltip, Legend);

export default function ShiftComparison({ rows = [] }) {
  const normalized = [...rows].sort((a, b) => Number(b.resolved || 0) - Number(a.resolved || 0));
  const labels = normalized.map((r) => r.shift || r.label || 'N/A');
  const resolved = normalized.map((r) => Number(r.resolved || 0));
  const avgMinutes = normalized.map((r) => Number(r.avgResolutionMinutes || 0));
  const hasData = resolved.some((v) => v > 0) || avgMinutes.some((v) => v > 0);

  const resolvedData = {
    labels,
    datasets: [
      {
        label: 'Resolved Tickets',
        data: resolved,
        backgroundColor: '#1A3DAA',
        borderRadius: 8,
        maxBarThickness: 28,
      },
    ],
  };

  const avgMinutesData = {
    labels,
    datasets: [
      {
        label: 'Avg Resolution (mins)',
        data: avgMinutes,
        backgroundColor: '#2A9E8F',
        borderRadius: 8,
        maxBarThickness: 28,
      },
    ],
  };

  const resolvedOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        display: false,
      },
    },
    scales: {
      y: { beginAtZero: true, ticks: { precision: 0 } },
      x: { grid: { display: false } },
    },
  };

  const avgMinutesOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        display: false,
      },
    },
    scales: {
      y: {
        beginAtZero: true,
        ticks: { precision: 0 },
      },
      x: { grid: { display: false } },
    },
  };

  return (
    <section className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
      <h3 className="text-sm font-semibold text-gray-900">Shift Performance</h3>
      <p className="mt-1 text-xs text-gray-500">Bar-only comparison for throughput and average resolution time per shift.</p>
      <div className="mt-3 rounded-lg border border-gray-200 bg-gray-50 p-3">
        {hasData ? (
          <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">Resolved Tickets</p>
              <div className="h-64">
                <Bar data={resolvedData} options={resolvedOptions} />
              </div>
            </div>
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">Average Resolution Minutes</p>
              <div className="h-64">
                <Bar data={avgMinutesData} options={avgMinutesOptions} />
              </div>
            </div>
          </div>
        ) : (
          <div className="flex h-64 items-center justify-center text-sm text-gray-500">No shift data in this date range.</div>
        )}
      </div>
    </section>
  );
}
