import { TimerReset } from 'lucide-react';

function formatMinutes(totalMinutes) {
  const mins = Number(totalMinutes || 0);
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${h}h ${m}m`;
}

export default function SLATimer({ initialMinutes = 0, isActive = false, label = 'SLA Timer' }) {
  const formatted = formatMinutes(initialMinutes);

  return (
    <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      <div className="mb-3 flex items-center">
        <div className="rounded-lg bg-indigo-50 p-2 text-indigo-700">
          <TimerReset className="h-5 w-5" />
        </div>
        <div className="ml-3">
          <h3 className="text-sm font-semibold text-gray-900">{label}</h3>
          <p className="text-xs text-gray-500">Shift-aware tracking</p>
        </div>
      </div>

      <p className="text-3xl font-bold text-gray-900">{formatted}</p>
      <p className={`mt-2 inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${isActive ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}>
        {isActive ? 'Active' : 'Paused'}
      </p>
    </section>
  );
}
