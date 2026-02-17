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
  const labels = rows.map((r) => r.shift || r.label || 'N/A');
  const resolved = rows.map((r) => Number(r.resolved || 0));
  const avgMinutes = rows.map((r) => Number(r.avgResolutionMinutes || 0));

  const data = {
    labels,
    datasets: [
      {
        label: 'Resolved Tickets',
        data: resolved,
        backgroundColor: '#1E2761',
        borderRadius: 8,
      },
      {
        label: 'Avg Resolution (mins)',
        data: avgMinutes,
        backgroundColor: '#02C39A',
        borderRadius: 8,
      },
    ],
  };

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { position: 'top' },
    },
    scales: {
      y: { beginAtZero: true, ticks: { precision: 0 } },
    },
  };

  return (
    <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      <h3 className="mb-4 text-sm font-semibold text-gray-900">Shift Comparison</h3>
      <div className="h-72">
        <Bar data={data} options={options} />
      </div>
    </section>
  );
}
