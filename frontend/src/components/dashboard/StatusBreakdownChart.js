'use client';

import { useMemo } from 'react';
import { Chart as ChartJS, ArcElement, Tooltip, Legend } from 'chart.js';
import { Doughnut } from 'react-chartjs-2';

ChartJS.register(ArcElement, Tooltip, Legend);

export default function StatusBreakdownChart({ tickets = [] }) {
  const summary = useMemo(() => {
    const output = {
      open: 0,
      inProgress: 0,
      reopened: 0,
      resolved: 0,
      closed: 0,
      overdue: 0,
    };

    for (const ticket of tickets || []) {
      const status = String(ticket?.status || '').toLowerCase();
      if (status === 'new' || status === 'open') output.open += 1;
      else if (status === 'in_progress') output.inProgress += 1;
      else if (status === 'reopened') output.reopened += 1;
      else if (status === 'resolved') output.resolved += 1;
      else if (status === 'closed') output.closed += 1;

      if (!['resolved', 'closed'].includes(status) && Number(ticket?.is_overdue ?? ticket?.sla_breach) === 1) {
        output.overdue += 1;
      }
    }

    const total = output.open + output.inProgress + output.reopened + output.resolved + output.closed;
    return { ...output, total };
  }, [tickets]);

  const hasData = summary.total > 0;

  const chartData = {
    labels: ['Open', 'In Progress', 'Reopened', 'Resolved', 'Closed'],
    datasets: [
      {
        data: [summary.open, summary.inProgress, summary.reopened, summary.resolved, summary.closed],
        backgroundColor: ['#1A3DAA', '#2A9E8F', '#F59E0B', '#3DBE45', '#64748B'],
        borderColor: 'rgba(255,255,255,0.85)',
        borderWidth: 2,
      },
    ],
  };

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: 'bottom',
        labels: { boxWidth: 10, usePointStyle: true, padding: 12 },
      },
    },
    cutout: '68%',
  };

  return (
    <section className="rounded-xl border border-gray-200 bg-white p-3 shadow-sm">
      <div className="mb-2">
        <h3 className="text-sm font-semibold text-gray-900">Queue Status Snapshot</h3>
        <p className="text-xs text-gray-500">Current composition of ticket statuses.</p>
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-[190px_minmax(0,1fr)] md:items-center">
        <div className="h-[190px]">
          {hasData ? (
            <Doughnut data={chartData} options={chartOptions} />
          ) : (
            <div className="flex h-full items-center justify-center rounded-lg border border-gray-200 bg-gray-50 text-sm text-gray-500">
              No tickets
            </div>
          )}
        </div>
        <div className="grid grid-cols-2 gap-2 text-xs">
          <div className="rounded-lg border border-gray-200 bg-gray-50 px-2.5 py-2">
            <p className="uppercase text-gray-500">Open</p>
            <p className="mt-1 text-base font-semibold text-gray-900">{summary.open}</p>
          </div>
          <div className="rounded-lg border border-gray-200 bg-gray-50 px-2.5 py-2">
            <p className="uppercase text-gray-500">In Progress</p>
            <p className="mt-1 text-base font-semibold text-gray-900">{summary.inProgress}</p>
          </div>
          <div className="rounded-lg border border-gray-200 bg-gray-50 px-2.5 py-2">
            <p className="uppercase text-gray-500">Resolved</p>
            <p className="mt-1 text-base font-semibold text-gray-900">{summary.resolved}</p>
          </div>
          <div className="rounded-lg border border-gray-200 bg-gray-50 px-2.5 py-2">
            <p className="uppercase text-gray-500">Overdue</p>
            <p className="mt-1 text-base font-semibold text-gray-900">{summary.overdue}</p>
          </div>
        </div>
      </div>
    </section>
  );
}
