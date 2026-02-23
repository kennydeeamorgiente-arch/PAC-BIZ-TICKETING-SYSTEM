import { ArrowUpRight, ArrowDownRight } from 'lucide-react';

export default function ReportStatCard({ title, value, subtitle, icon: Icon, tone = 'primary', delta = null }) {
  const deltaNumber = Number(delta);
  const hasDelta = Number.isFinite(deltaNumber);
  const isPositive = deltaNumber >= 0;

  const toneMap = {
    primary: {
      card: 'border-primary-100 bg-gradient-to-br from-primary-50/80 to-white dark:border-primary-700 dark:from-slate-900 dark:to-primary-900/35',
      icon: 'bg-primary-100/70 text-primary-700 dark:bg-primary-700/35 dark:text-blue-100',
    },
    secondary: {
      card: 'border-secondary-100 bg-gradient-to-br from-secondary-50/80 to-white dark:border-secondary-700 dark:from-slate-900 dark:to-secondary-900/30',
      icon: 'bg-secondary-100/70 text-secondary-700 dark:bg-secondary-700/35 dark:text-green-100',
    },
    accent: {
      card: 'border-accent-100 bg-gradient-to-br from-accent-50/80 to-white dark:border-accent-700 dark:from-slate-900 dark:to-accent-900/25',
      icon: 'bg-accent-100/80 text-accent-700 dark:bg-accent-700/35 dark:text-teal-100',
    },
    warning: {
      card: 'border-amber-100 bg-gradient-to-br from-amber-50/80 to-white dark:border-amber-700 dark:from-slate-900 dark:to-amber-900/25',
      icon: 'bg-amber-100/80 text-amber-700 dark:bg-amber-900/35 dark:text-amber-200',
    },
  };

  const selectedTone = toneMap[tone] || toneMap.primary;

  return (
    <article className={`rounded-xl border p-4 shadow-sm backdrop-blur-sm ${selectedTone.card}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-300">{title}</p>
          <p className="mt-1 text-2xl font-bold text-slate-900 dark:text-white">{value}</p>
        </div>
        {Icon ? (
          <span className={`rounded-lg p-2 ${selectedTone.icon}`}>
            <Icon className="h-5 w-5" />
          </span>
        ) : null}
      </div>

      <div className="mt-3 flex items-center justify-between gap-2">
        <p className="text-xs text-slate-500 dark:text-slate-300">{subtitle}</p>
        {hasDelta ? (
          <span className={`inline-flex items-center text-xs font-semibold ${isPositive ? 'text-emerald-600' : 'text-red-600'}`}>
            {isPositive ? <ArrowUpRight className="mr-1 h-4 w-4" /> : <ArrowDownRight className="mr-1 h-4 w-4" />}
            {Math.abs(Math.round(deltaNumber))}%
          </span>
        ) : null}
      </div>
    </article>
  );
}
