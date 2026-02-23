'use client';

import { useMemo } from 'react';
import { Chart as ChartJS, ArcElement, Tooltip, Legend } from 'chart.js';
import { Doughnut } from 'react-chartjs-2';

ChartJS.register(ArcElement, Tooltip, Legend);

function normalizeThresholds(thresholds = {}) {
  const healthy = Math.max(1, Math.min(100, Math.round(Number(thresholds?.healthyThreshold || 90))));
  const monitor = Math.max(0, Math.min(healthy - 1, Math.round(Number(thresholds?.monitorThreshold || 70))));
  return { healthy, monitor };
}

export default function SlaDistributionChart({ rows = [], thresholds = {} }) {
  const { healthy, monitor } = normalizeThresholds(thresholds);
  const distribution = useMemo(() => {
    const output = {
      healthy: 0,
      monitor: 0,
      risk: 0,
    };

    for (const row of rows || []) {
      const sla = Number(row?.slaCompliance || 0);
      if (sla >= healthy) output.healthy += 1;
      else if (sla >= monitor) output.monitor += 1;
      else output.risk += 1;
    }

    return output;
  }, [rows, healthy, monitor]);

  const totalTech = distribution.healthy + distribution.monitor + distribution.risk;
  const hasData = totalTech > 0;
  const bands = [
    { key: 'healthy', label: `Healthy (>= ${healthy}%)`, value: distribution.healthy, tone: 'bg-secondary-100 text-secondary-700' },
    {
      key: 'monitor',
      label: `Monitor (${monitor}%-${Math.max(monitor, healthy - 1)}%)`,
      value: distribution.monitor,
      tone: 'bg-amber-100 text-amber-700',
    },
    { key: 'risk', label: `At Risk (< ${monitor}%)`, value: distribution.risk, tone: 'bg-red-100 text-red-700' },
  ];

  const chartData = {
    labels: bands.map((band) => band.label),
    datasets: [
      {
        data: bands.map((band) => band.value),
        backgroundColor: ['#3dbe45', '#f59e0b', '#e03131'],
        borderWidth: 0,
      },
    ],
  };

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { position: 'bottom' },
    },
    cutout: '60%',
  };

  return (
    <section className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
      <h3 className="text-sm font-semibold text-gray-900">SLA Health Distribution</h3>
      <p className="mt-1 text-xs text-gray-500">Technician SLA distribution by health band.</p>

      <div className="mt-3 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="h-64 rounded-lg border border-gray-200 bg-gray-50 p-2">
          {hasData ? (
            <Doughnut data={chartData} options={options} />
          ) : (
            <div className="flex h-full items-center justify-center text-sm text-gray-500">No technician data yet.</div>
          )}
        </div>

        <div className="space-y-2">
          <div className="rounded-lg border border-gray-200 p-3">
            <div className="flex items-start justify-between gap-2">
              <p className="text-sm font-semibold text-gray-900">Technicians Tracked</p>
              <span className="rounded-md bg-gray-100 px-2 py-0.5 text-[11px] font-semibold text-gray-700">{totalTech}</span>
            </div>
            <p className="mt-1 text-xs text-gray-600">
              Need attention: {distribution.monitor + distribution.risk}
            </p>
          </div>

          {bands.map((band) => (
            <div key={band.key} className="rounded-lg border border-gray-200 p-3">
              <div className="flex items-start justify-between gap-2">
                <p className="text-sm font-semibold text-gray-900">{band.label}</p>
                <span className={`rounded-md px-2 py-0.5 text-[11px] font-semibold ${band.tone}`}>
                  {totalTech > 0 ? `${Math.round((band.value / totalTech) * 100)}%` : '0%'}
                </span>
              </div>
              <p className="mt-1 text-xs text-gray-600">{band.value} technicians</p>
            </div>
          ))}

          {!hasData ? <p className="text-sm text-gray-500">No technician data yet.</p> : null}
        </div>
      </div>
    </section>
  );
}
