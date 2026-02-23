'use client';

import { useMemo } from 'react';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Tooltip,
  Legend,
} from 'chart.js';
import { Line, Bar } from 'react-chartjs-2';
import { FolderTree, Flag, UserRound } from 'lucide-react';

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Tooltip,
  Legend
);

function toMonthKey(dateValue) {
  const date = new Date(dateValue);
  if (Number.isNaN(date.getTime())) return null;
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function buildPastMonths(count = 12) {
  const months = [];
  const now = new Date();
  for (let i = count - 1; i >= 0; i -= 1) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.push({
      key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`,
      label: d.toLocaleString('en-US', { month: 'short', year: '2-digit' }),
    });
  }
  return months;
}

function topCount(items, keySelector, limit = 3, fallbackLabel = 'Unknown') {
  const map = new Map();
  for (const item of items) {
    const key = keySelector(item) || fallbackLabel;
    map.set(key, (map.get(key) || 0) + 1);
  }
  return [...map.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit);
}

function MiniListCard({ title, rows, icon: Icon }) {
  return (
    <section className="rounded-xl border border-gray-200 bg-white p-3 shadow-sm dark:border-slate-700 dark:bg-slate-900/70">
      <div className="mb-2.5 flex items-center gap-2">
        <Icon className="h-4 w-4 text-secondary-600 dark:text-secondary-300" />
        <h3 className="text-sm font-semibold text-gray-900 dark:text-slate-100">{title}</h3>
      </div>
      {rows.length === 0 ? (
        <p className="text-sm text-gray-500 dark:text-slate-400">No data found</p>
      ) : (
        <div className="space-y-2">
          {rows.map(([label, count]) => (
            <div key={label} className="flex items-center justify-between rounded-lg bg-gray-50 px-2.5 py-2 dark:bg-slate-800/70">
              <p className="text-xs text-gray-700 dark:text-slate-200">{label}</p>
              <span className="rounded-full bg-white px-2 py-0.5 text-xs font-semibold text-gray-700 dark:bg-slate-700 dark:text-slate-200">
                {count}
              </span>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

export default function OperationsBoard({ tickets = [] }) {
  const months = useMemo(() => buildPastMonths(12), []);

  const evolution = useMemo(() => {
    const map = new Map(months.map((m) => [m.key, { opened: 0, solved: 0, late: 0, closed: 0 }]));
    for (const ticket of tickets) {
      const key = toMonthKey(ticket.created_at);
      if (!key || !map.has(key)) continue;
      const row = map.get(key);
      row.opened += 1;
      if (['resolved', 'closed'].includes(ticket.status)) row.solved += 1;
      if (ticket.status === 'closed') row.closed += 1;
      if (Number(ticket.is_overdue ?? ticket.sla_breach) === 1 && !['resolved', 'closed'].includes(ticket.status)) row.late += 1;
    }
    return months.map((m) => map.get(m.key));
  }, [months, tickets]);

  const statusByMonth = useMemo(() => {
    const map = new Map(
      months.map((m) => [m.key, { open: 0, in_progress: 0, reopened: 0, resolved: 0, closed: 0 }])
    );
    for (const ticket of tickets) {
      const key = toMonthKey(ticket.created_at);
      if (!key || !map.has(key)) continue;
      const row = map.get(key);
      if (ticket.status === 'new' || ticket.status === 'open') row.open += 1;
      else if (ticket.status === 'in_progress') row.in_progress += 1;
      else if (ticket.status === 'reopened') row.reopened += 1;
      else if (ticket.status === 'resolved') row.resolved += 1;
      else if (ticket.status === 'closed') row.closed += 1;
    }
    return months.map((m) => map.get(m.key));
  }, [months, tickets]);

  const topCategories = useMemo(() => topCount(tickets, (t) => t.category, 3, 'General'), [tickets]);
  const topPriorities = useMemo(() => topCount(tickets, (t) => t.priority, 3, 'medium'), [tickets]);
  const topAssignees = useMemo(
    () => topCount(tickets, (t) => t.assigned_to_name, 3, 'Unassigned'),
    [tickets]
  );

  const labels = months.map((m) => m.label);

  const evolutionData = {
    labels,
    datasets: [
      {
        label: 'Opened',
        data: evolution.map((r) => r.opened),
        borderColor: '#3B82F6',
        backgroundColor: '#3B82F6',
        tension: 0.3,
      },
      {
        label: 'Solved',
        data: evolution.map((r) => r.solved),
        borderColor: '#F59E0B',
        backgroundColor: '#F59E0B',
        tension: 0.3,
      },
      {
        label: 'Late',
        data: evolution.map((r) => r.late),
        borderColor: '#EF4444',
        backgroundColor: '#EF4444',
        tension: 0.3,
      },
      {
        label: 'Closed',
        data: evolution.map((r) => r.closed),
        borderColor: '#14B8A6',
        backgroundColor: '#14B8A6',
        tension: 0.3,
      },
    ],
  };

  const statusData = {
    labels,
    datasets: [
      {
        label: 'Open',
        data: statusByMonth.map((r) => r.open),
        backgroundColor: '#60A5FA',
      },
      {
        label: 'In Progress',
        data: statusByMonth.map((r) => r.in_progress),
        backgroundColor: '#8B5CF6',
      },
      {
        label: 'Reopened',
        data: statusByMonth.map((r) => r.reopened),
        backgroundColor: '#EC4899',
      },
      {
        label: 'Resolved',
        data: statusByMonth.map((r) => r.resolved),
        backgroundColor: '#22C55E',
      },
      {
        label: 'Closed',
        data: statusByMonth.map((r) => r.closed),
        backgroundColor: '#64748B',
      },
    ],
  };

  const chartOptions = {
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
    <section className="rounded-2xl border border-gray-200 bg-white p-3 shadow-sm dark:border-slate-700 dark:bg-slate-900/80">
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-12">
        <div className="rounded-xl border border-gray-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-950/50 lg:col-span-7">
          <h3 className="mb-2 text-sm font-semibold text-slate-900 dark:text-slate-100">Evolution of tickets in the past year</h3>
          <div className="h-60">
            <Line data={evolutionData} options={chartOptions} />
          </div>
        </div>

        <div className="rounded-xl border border-gray-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-950/50 lg:col-span-5">
          <h3 className="mb-2 text-sm font-semibold text-slate-900 dark:text-slate-100">Ticket status by month</h3>
          <div className="h-60">
            <Bar data={statusData} options={chartOptions} />
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-3 lg:col-span-12">
          <MiniListCard title="Top Ticket Categories" rows={topCategories} icon={FolderTree} />
          <MiniListCard title="Top Priorities" rows={topPriorities} icon={Flag} />
          <MiniListCard title="Top Assignees" rows={topAssignees} icon={UserRound} />
        </div>
      </div>
    </section>
  );
}
