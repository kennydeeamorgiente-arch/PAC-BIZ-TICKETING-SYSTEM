'use client';

import {
  Chart as ChartJS,
  ArcElement,
  Tooltip,
  Legend,
} from 'chart.js';
import { Doughnut } from 'react-chartjs-2';

ChartJS.register(ArcElement, Tooltip, Legend);

export default function TechnicianLeaderboard({ rows = [] }) {
  const sorted = [...rows].sort((a, b) => Number(b.resolved || 0) - Number(a.resolved || 0));
  const top = sorted.slice(0, 5);

  const chartData = {
    labels: top.map((t) => t.name || 'Unknown'),
    datasets: [
      {
        label: 'Resolved',
        data: top.map((t) => Number(t.resolved || 0)),
        backgroundColor: ['#1E2761', '#028090', '#02C39A', '#F59E0B', '#E03131'],
        borderWidth: 0,
      },
    ],
  };

  return (
    <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      <h3 className="mb-4 text-sm font-semibold text-gray-900">Technician Leaderboard</h3>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="h-64">
          <Doughnut data={chartData} options={{ responsive: true, maintainAspectRatio: false }} />
        </div>

        <div className="space-y-2">
          {top.map((tech, idx) => (
            <div key={tech.name || idx} className="rounded-lg border border-gray-200 p-3">
              <p className="text-sm font-semibold text-gray-900">
                #{idx + 1} {tech.name || 'Unknown'}
              </p>
              <p className="mt-1 text-xs text-gray-600">
                Resolved: {tech.resolved || 0} | SLA: {tech.slaCompliance || 0}%
              </p>
            </div>
          ))}

          {top.length === 0 ? <p className="text-sm text-gray-500">No technician data yet.</p> : null}
        </div>
      </div>
    </section>
  );
}
