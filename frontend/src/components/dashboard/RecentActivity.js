import { Activity } from 'lucide-react';

export default function RecentActivity({ items = [], className = '' }) {
  return (
    <div className={`flex h-full flex-col overflow-hidden rounded-xl border border-gray-200 bg-white p-3 shadow-sm dark:border-violet-900/50 dark:bg-slate-900 ${className}`}>
      <div className="mb-2 flex items-center">
        <div className="rounded-lg bg-secondary-50 p-1.5 text-secondary-700 dark:bg-cyan-900/40 dark:text-cyan-200">
          <Activity className="h-4.5 w-4.5" />
        </div>
        <h3 className="ml-3 text-sm font-semibold text-gray-900 dark:text-slate-100">Recent Activity</h3>
      </div>

      <div className="min-h-0 flex-1 space-y-1.5 overflow-y-auto pr-1">
        {items.length === 0 ? (
          <p className="text-sm text-gray-500 dark:text-slate-400">No recent activity yet.</p>
        ) : (
          items.map((item) => (
            <div key={item.id} className="rounded-lg border border-gray-100 p-1.5 dark:border-violet-900/40 dark:bg-slate-950/60">
              <p className="text-xs font-semibold text-gray-900 dark:text-slate-100">{item.title}</p>
              <p className="mt-0.5 text-[11px] text-gray-500 dark:text-slate-400">{item.meta}</p>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
