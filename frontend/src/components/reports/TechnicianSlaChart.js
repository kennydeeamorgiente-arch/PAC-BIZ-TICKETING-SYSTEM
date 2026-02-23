'use client';

import { useMemo } from 'react';
import { Chart as ChartJS, CategoryScale, LinearScale, BarElement, Tooltip, Legend } from 'chart.js';
import { Bar } from 'react-chartjs-2';

ChartJS.register(CategoryScale, LinearScale, BarElement, Tooltip, Legend);

export default function TechnicianSlaChart({ rows = [] }) {
  const normalized = useMemo(() => {
    return [...rows]
      .map((row) => ({
        name: row?.name || 'Unknown',
        sla: Number(row?.slaCompliance || 0),
        resolved: Number(row?.resolved || 0),
      }))
      .sort((a, b) => b.sla - a.sla)
      .slice(0, 10);
  }, [rows]);

  const hasData = normalized.length > 0;

  const chartData = {
    labels: normalized.map((row) => row.name),
    datasets: [
      {
        label: 'SLA Compliance %',
        data: normalized.map((row) => row.sla),
        backgroundColor: '#2A9E8F',
        borderRadius: 8,
        maxBarThickness: 26,
      },
    ],
  };

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    indexAxis: 'y',
    plugins: {
      legend: { display: false },
      tooltip: {
        callbacks: {
          afterLabel: (ctx) => `Resolved: ${normalized[ctx.dataIndex]?.resolved || 0}`,
        },
      },
    },
    scales: {
      x: {
        beginAtZero: true,
        max: 100,
        ticks: { callback: (value) => `${value}%` },
      },
      y: { grid: { display: false } },
    },
  };

  return (
    <section className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
      <div className="mb-3">
        <h3 className="text-sm font-semibold text-gray-900">Technician SLA Ranking</h3>
        <p className="text-xs text-gray-500">Top 10 technicians by SLA compliance in selected range.</p>
      </div>
      <div className="rounded-lg border border-gray-200 bg-gray-50 p-2">
        {hasData ? (
          <div className="h-[300px]">
            <Bar data={chartData} options={options} />
          </div>
        ) : (
          <div className="flex h-[300px] items-center justify-center text-sm text-gray-500">No technician SLA data in this range.</div>
        )}
      </div>
    </section>
  );
}
