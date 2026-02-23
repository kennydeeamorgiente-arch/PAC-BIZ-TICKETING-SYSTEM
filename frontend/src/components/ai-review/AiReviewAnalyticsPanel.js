'use client';

import { useMemo } from 'react';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  ArcElement,
  PointElement,
  LineElement,
  Tooltip,
  Legend,
} from 'chart.js';
import { Bar, Doughnut, Line } from 'react-chartjs-2';

ChartJS.register(CategoryScale, LinearScale, BarElement, ArcElement, PointElement, LineElement, Tooltip, Legend);

function pct(value) {
  return `${Math.round(Number(value || 0) * 100)}%`;
}

function toWeekLabel(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value || 'Unknown');
  return date.toLocaleDateString('en-US', { month: 'short', day: '2-digit' });
}

const CARD = 'rounded-xl border border-gray-200 bg-white p-3';
const EMPTY = 'flex h-[240px] items-center justify-center rounded-lg border border-gray-200 bg-gray-50 text-sm text-gray-500';

export default function AiReviewAnalyticsPanel({ dashboard = null }) {
  const sourceQualityRows = useMemo(
    () => (Array.isArray(dashboard?.source_quality) ? dashboard.source_quality : []),
    [dashboard]
  );
  const noiseRows = useMemo(
    () => (Array.isArray(dashboard?.noise_outcomes) ? dashboard.noise_outcomes : []),
    [dashboard]
  );
  const senderRows = useMemo(
    () => (Array.isArray(dashboard?.top_noisy_senders) ? dashboard.top_noisy_senders.slice(0, 8) : []),
    [dashboard]
  );
  const weeklyRows = useMemo(
    () => (Array.isArray(dashboard?.weekly_trend) ? dashboard.weekly_trend : []),
    [dashboard]
  );

  const sourceData = useMemo(() => {
    const labels = sourceQualityRows.map((row) => row.intake_source || 'unknown');
    return {
      labels,
      datasets: [
        {
          label: 'Needs Review',
          data: sourceQualityRows.map((row) => Number(row.needs_review_count || 0)),
          backgroundColor: '#f59e0b',
          borderRadius: 6,
          maxBarThickness: 26,
        },
        {
          label: 'Other',
          data: sourceQualityRows.map((row) => Math.max(0, Number(row.total || 0) - Number(row.needs_review_count || 0))),
          backgroundColor: '#2A9E8F',
          borderRadius: 6,
          maxBarThickness: 26,
        },
      ],
    };
  }, [sourceQualityRows]);

  const sourceOptions = {
    responsive: true,
    maintainAspectRatio: false,
    indexAxis: 'y',
    plugins: {
      legend: { position: 'bottom', labels: { boxWidth: 10, usePointStyle: true } },
    },
    scales: {
      x: { beginAtZero: true, ticks: { precision: 0 } },
      y: { grid: { display: false } },
    },
  };

  const noiseData = useMemo(
    () => ({
      labels: noiseRows.map((row) => String(row.decision || 'unknown').toUpperCase()),
      datasets: [
        {
          data: noiseRows.map((row) => Number(row.total || 0)),
          backgroundColor: ['#1A3DAA', '#2A9E8F', '#3DBE45', '#F59E0B', '#E03131'],
          borderWidth: 0,
        },
      ],
    }),
    [noiseRows]
  );

  const noiseOptions = {
    responsive: true,
    maintainAspectRatio: false,
    cutout: '60%',
    plugins: {
      legend: { position: 'bottom', labels: { boxWidth: 10, usePointStyle: true } },
    },
  };

  const senderData = useMemo(
    () => ({
      labels: senderRows.map((row) => row.from_email || 'unknown'),
      datasets: [
        {
          label: 'Filtered Emails',
          data: senderRows.map((row) => Number(row.total || 0)),
          backgroundColor: '#1A3DAA',
          borderRadius: 8,
          maxBarThickness: 24,
        },
      ],
    }),
    [senderRows]
  );

  const senderOptions = {
    responsive: true,
    maintainAspectRatio: false,
    indexAxis: 'y',
    plugins: { legend: { display: false } },
    scales: {
      x: { beginAtZero: true, ticks: { precision: 0 } },
      y: { grid: { display: false } },
    },
  };

  const weeklyData = useMemo(
    () => ({
      labels: weeklyRows.map((row) => toWeekLabel(row.week_start)),
      datasets: [
        {
          label: 'Total',
          data: weeklyRows.map((row) => Number(row.total || 0)),
          borderColor: '#1A3DAA',
          backgroundColor: 'rgba(26, 61, 170, 0.16)',
          borderWidth: 2,
          pointRadius: 3,
          tension: 0.32,
        },
        {
          label: 'Needs Review',
          data: weeklyRows.map((row) => Number(row.needs_review_count || 0)),
          borderColor: '#F59E0B',
          backgroundColor: 'rgba(245, 158, 11, 0.14)',
          borderWidth: 2,
          pointRadius: 3,
          tension: 0.32,
        },
        {
          label: 'Reviewed',
          data: weeklyRows.map((row) => Number(row.reviewed_count || 0)),
          borderColor: '#2A9E8F',
          backgroundColor: 'rgba(42, 158, 143, 0.12)',
          borderWidth: 2,
          pointRadius: 3,
          tension: 0.32,
        },
      ],
    }),
    [weeklyRows]
  );

  const weeklyOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { position: 'bottom', labels: { boxWidth: 10, usePointStyle: true } },
    },
    scales: {
      y: { beginAtZero: true, ticks: { precision: 0 } },
      x: { grid: { display: false } },
    },
  };

  return (
    <div className="mt-3 grid grid-cols-1 gap-3 xl:grid-cols-2">
      <section className={CARD}>
        <h3 className="text-sm font-semibold text-gray-900">Source Quality</h3>
        <p className="mt-1 text-xs text-gray-500">Hybrid view: chart for pattern, text for exact counts.</p>
        <div className="mt-3 rounded-lg border border-gray-200 bg-gray-50 p-2">
          {sourceQualityRows.length > 0 ? (
            <div className="h-[240px]">
              <Bar data={sourceData} options={sourceOptions} />
            </div>
          ) : (
            <div className={EMPTY}>No source quality data in selected window.</div>
          )}
        </div>
        {sourceQualityRows.length > 0 ? (
          <div className="mt-2 space-y-1 text-xs text-gray-700">
            {sourceQualityRows.map((row) => {
              const reviewedCount = Number(row.reviewed_count || 0);
              const reviewedAgree = Number(row.reviewed_agree_count || 0);
              const reviewedOverride = Number(row.reviewed_override_count || 0);
              const agreeRate = reviewedCount > 0 ? `${Math.round((reviewedAgree / reviewedCount) * 100)}%` : 'N/A';
              const overrideRate = reviewedCount > 0 ? `${Math.round((reviewedOverride / reviewedCount) * 100)}%` : 'N/A';
              return (
                <div key={row.intake_source} className="rounded-md border border-gray-200 bg-gray-50 px-2 py-1.5">
                  <span className="font-semibold">{row.intake_source}</span>: Total {row.total} | Needs review {row.needs_review_count} | Avg conf {pct(row.avg_confidence)} | Agreement {agreeRate} | Overrides {overrideRate}
                </div>
              );
            })}
          </div>
        ) : null}
      </section>

      <section className={CARD}>
        <h3 className="text-sm font-semibold text-gray-900">Noise Blocking Outcomes</h3>
        <p className="mt-1 text-xs text-gray-500">Decision distribution with risk context.</p>
        <div className="mt-3 rounded-lg border border-gray-200 bg-gray-50 p-2">
          {noiseRows.length > 0 ? (
            <div className="h-[240px]">
              <Doughnut data={noiseData} options={noiseOptions} />
            </div>
          ) : (
            <div className={EMPTY}>No noise outcome data yet.</div>
          )}
        </div>
        {noiseRows.length > 0 ? (
          <div className="mt-2 space-y-1 text-xs text-gray-700">
            {noiseRows.map((row) => (
              <div key={row.decision} className="rounded-md border border-gray-200 bg-gray-50 px-2 py-1.5">
                <span className="font-semibold">{row.decision}</span>: Total {row.total} | Avg risk {Math.round(Number(row.avg_risk_score || 0))}
              </div>
            ))}
          </div>
        ) : null}
      </section>

      <section className={CARD}>
        <h3 className="text-sm font-semibold text-gray-900">Top Noisy Senders</h3>
        <p className="mt-1 text-xs text-gray-500">Which senders generate most filtered items.</p>
        <div className="mt-3 rounded-lg border border-gray-200 bg-gray-50 p-2">
          {senderRows.length > 0 ? (
            <div className="h-[240px]">
              <Bar data={senderData} options={senderOptions} />
            </div>
          ) : (
            <div className={EMPTY}>No blocked sender data yet.</div>
          )}
        </div>
        {senderRows.length > 0 ? (
          <div className="mt-2 space-y-1 text-xs text-gray-700">
            {senderRows.slice(0, 5).map((row) => (
              <div key={row.from_email} className="rounded-md border border-gray-200 bg-gray-50 px-2 py-1.5">
                <span className="font-semibold">{row.from_email}</span>: Filtered emails {row.total}
              </div>
            ))}
          </div>
        ) : null}
      </section>

      <section className={CARD}>
        <h3 className="text-sm font-semibold text-gray-900">Weekly Trend</h3>
        <p className="mt-1 text-xs text-gray-500">Volume and review workload trend per week.</p>
        <div className="mt-3 rounded-lg border border-gray-200 bg-gray-50 p-2">
          {weeklyRows.length > 0 ? (
            <div className="h-[240px]">
              <Line data={weeklyData} options={weeklyOptions} />
            </div>
          ) : (
            <div className={EMPTY}>No weekly data in selected window.</div>
          )}
        </div>
        {weeklyRows.length > 0 ? (
          <div className="mt-2 space-y-1 text-xs text-gray-700">
            {weeklyRows.map((row) => (
              <div key={row.week_start} className="rounded-md border border-gray-200 bg-gray-50 px-2 py-1.5">
                <span className="font-semibold">Week of {row.week_start}</span>: Total {row.total} | Needs review {row.needs_review_count} | Reviewed {row.reviewed_count} | Avg confidence {pct(row.avg_confidence)}
              </div>
            ))}
          </div>
        ) : null}
      </section>
    </div>
  );
}
