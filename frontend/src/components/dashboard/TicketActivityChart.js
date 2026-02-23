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

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Tooltip, Legend);

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

export default function TicketActivityChart({ startDate, endDate, refreshKey = 0 }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [series, setSeries] = useState({ created: [], closed: [], reopened: [], overdue: [], collab: [] });

  useEffect(() => {
    const load = async () => {
      if (!startDate || !endDate) return;
      setLoading(true);
      setError('');
      try {
        const response = await api.getTicketActivity(startDate, endDate);
        setSeries(response?.data?.series || { created: [], closed: [], reopened: [], overdue: [], collab: [] });
      } catch (e) {
        setSeries({ created: [], closed: [], reopened: [], overdue: [], collab: [] });
        setError(e?.message || 'Failed to load ticket activity.');
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [startDate, endDate, refreshKey]);

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
          label: 'closed',
          data: labels.map((d) => closedMap.get(d) || 0),
          borderColor: '#2F67BF',
          backgroundColor: '#2F67BF',
          pointRadius: 3,
          tension: 0.28,
        },
        {
          label: 'collab',
          data: labels.map((d) => collabMap.get(d) || 0),
          borderColor: '#97B93A',
          backgroundColor: '#97B93A',
          pointRadius: 3,
          tension: 0.28,
        },
        {
          label: 'created',
          data: labels.map((d) => createdMap.get(d) || 0),
          borderColor: '#C46734',
          backgroundColor: '#C46734',
          pointRadius: 3,
          tension: 0.28,
        },
        {
          label: 'overdue',
          data: labels.map((d) => overdueMap.get(d) || 0),
          borderColor: '#B79A2A',
          backgroundColor: '#B79A2A',
          pointRadius: 3,
          tension: 0.28,
        },
        {
          label: 'reopened',
          data: labels.map((d) => reopenedMap.get(d) || 0),
          borderColor: '#6F3AC5',
          backgroundColor: '#6F3AC5',
          pointRadius: 3,
          tension: 0.28,
        },
      ],
    };
  }, [series, startDate, endDate]);

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { position: 'right' },
    },
    scales: {
      y: { beginAtZero: true, ticks: { precision: 0 } },
    },
  };

  return (
    <section className="rounded-2xl border border-gray-200 bg-white p-3 shadow-sm">
      <h3 className="mb-2 text-2xl font-semibold text-primary-700">Ticket Activity</h3>
      {error ? (
        <div className="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          {error}
        </div>
      ) : null}
      <div className="h-[360px] rounded-xl border border-gray-200 bg-gray-50 p-2">
        {loading ? <div className="p-4 text-sm text-gray-500">Loading activity chart...</div> : <Line data={chartData} options={options} />}
      </div>
    </section>
  );
}
