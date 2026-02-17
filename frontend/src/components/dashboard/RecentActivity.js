import { Activity } from 'lucide-react';

export default function RecentActivity({ items = [] }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      <div className="mb-4 flex items-center">
        <div className="rounded-lg bg-secondary-50 p-2 text-secondary-700">
          <Activity className="h-5 w-5" />
        </div>
        <h3 className="ml-3 text-sm font-semibold text-gray-900">Recent Activity</h3>
      </div>

      <div className="space-y-3">
        {items.length === 0 ? (
          <p className="text-sm text-gray-500">No recent activity yet.</p>
        ) : (
          items.map((item) => (
            <div key={item.id} className="rounded-lg border border-gray-100 p-3">
              <p className="text-sm font-medium text-gray-900">{item.title}</p>
              <p className="mt-1 text-xs text-gray-500">{item.meta}</p>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
