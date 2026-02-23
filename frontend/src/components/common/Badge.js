const STATUS_STYLES = {
  new: 'bg-cyan-100 text-cyan-800 border-cyan-200',
  open: 'bg-blue-100 text-blue-800 border-blue-200',
  in_progress: 'bg-purple-100 text-purple-800 border-purple-200',
  user_pending: 'bg-amber-100 text-amber-800 border-amber-200',
  external_support: 'bg-indigo-100 text-indigo-800 border-indigo-200',
  reopened: 'bg-pink-100 text-pink-800 border-pink-200',
  resolved: 'bg-green-100 text-green-800 border-green-200',
  closed: 'bg-gray-100 text-gray-700 border-gray-200',
  released: 'bg-emerald-100 text-emerald-800 border-emerald-200',
  dismissed: 'bg-slate-100 text-slate-700 border-slate-200',
  deleted: 'bg-red-100 text-red-800 border-red-200',
};

const PRIORITY_STYLES = {
  low: 'bg-emerald-100 text-emerald-800 border-emerald-200',
  medium: 'bg-amber-100 text-amber-800 border-amber-200',
  high: 'bg-orange-100 text-orange-800 border-orange-200',
  critical: 'bg-red-100 text-red-800 border-red-200',
};

export default function Badge({ type = 'default', value = '', children, className = '' }) {
  const raw = String(value || '').toLowerCase();
  let styles = 'bg-slate-100 text-slate-700 border-slate-200';

  if (type === 'status') styles = STATUS_STYLES[raw] || styles;
  if (type === 'priority') styles = PRIORITY_STYLES[raw] || styles;

  const label = children || String(value || '').replaceAll('_', ' ');

  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-semibold capitalize ${styles} ${className}`}>
      {label}
    </span>
  );
}
