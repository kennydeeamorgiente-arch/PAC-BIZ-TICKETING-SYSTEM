'use client';

import { Chart as ChartJS, ArcElement, Tooltip, Legend } from 'chart.js';
import { Pie } from 'react-chartjs-2';

ChartJS.register(ArcElement, Tooltip, Legend);

export default function ReportHealthPieChart({ created = 0, closed = 0, reopened = 0, overdue = 0 }) {
  const unresolved = Math.max(0, Number(created || 0) - Number(closed || 0));
  const pieData = {
    labels: ['Closed', 'Unresolved', 'Reopened', 'Overdue'],
    datasets: [
      {
        data: [Number(closed || 0), unresolved, Number(reopened || 0), Number(overdue || 0)],
        backgroundColor: ['#3DBE45', '#1A3DAA', '#F59E0B', '#E03131'],
        borderColor: 'rgba(255,255,255,0.85)',
        borderWidth: 2,
      },
    ],
  };

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: 'bottom',
        labels: {
          boxWidth: 10,
          usePointStyle: true,
          padding: 14,
        },
      },
    },
  };

  const hasData = Number(closed || 0) + unresolved + Number(reopened || 0) + Number(overdue || 0) > 0;

  return (
    <section className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
      <h3 className="text-sm font-semibold text-gray-900">Ticket Health Mix</h3>
      <p className="mt-1 text-xs text-gray-500">Modern pie view of closure, unresolved pressure, and risk signals.</p>
      <div className="mt-3 rounded-lg border border-gray-200 bg-gray-50 p-2">
        {hasData ? (
          <div className="h-[290px]">
            <Pie data={pieData} options={options} />
          </div>
        ) : (
          <div className="flex h-[290px] items-center justify-center text-sm text-gray-500">No ticket distribution data in selected range.</div>
        )}
      </div>
    </section>
  );
}
