import { ArrowUpRight, ArrowDownRight } from 'lucide-react';

export default function StatsCard({ title, value, subtitle, trend = 0, icon: Icon, tone = 'primary', className = '' }) {
  const trendPositive = trend >= 0;

  const toneMap = {
    primary: 'bg-primary-100/70 text-primary-700 dark:bg-primary-900/40 dark:text-primary-200',
    secondary: 'bg-secondary-100/70 text-secondary-700 dark:bg-secondary-900/40 dark:text-secondary-200',
    accent: 'bg-emerald-100/70 text-emerald-700 dark:bg-emerald-900/35 dark:text-emerald-200',
    warning: 'bg-amber-100/75 text-amber-700 dark:bg-amber-900/35 dark:text-amber-200',
  };

  const cardToneMap = {
    primary: 'border-primary-100 bg-gradient-to-br from-primary-50/80 to-white dark:border-violet-700/50 dark:from-slate-900 dark:to-violet-950/60',
    secondary: 'border-secondary-100 bg-gradient-to-br from-secondary-50/75 to-white dark:border-indigo-700/50 dark:from-slate-900 dark:to-indigo-950/60',
    accent: 'border-emerald-100 bg-gradient-to-br from-emerald-50/75 to-white dark:border-cyan-700/50 dark:from-slate-900 dark:to-cyan-950/45',
    warning: 'border-amber-100 bg-gradient-to-br from-amber-50/80 to-white dark:border-fuchsia-700/45 dark:from-slate-900 dark:to-fuchsia-950/45',
  };

  return (
    <div className={`rounded-xl border p-4 shadow-sm backdrop-blur-sm ${cardToneMap[tone] || cardToneMap.primary} ${className}`}>
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-300">{title}</p>
          <h3 className="mt-1.5 text-2xl font-bold text-slate-900 dark:text-white">{value}</h3>
        </div>
        {Icon ? (
          <div className={`rounded-lg p-2 ${toneMap[tone] || toneMap.primary}`}>
            <Icon className="h-5 w-5" />
          </div>
        ) : null}
      </div>

      <div className="mt-3 flex items-center justify-between">
        <p className="text-xs text-slate-500 dark:text-slate-300">{subtitle}</p>
        <div className={`flex items-center text-xs font-semibold ${trendPositive ? 'text-emerald-600' : 'text-red-600'}`}>
          {trendPositive ? <ArrowUpRight className="mr-1 h-4 w-4" /> : <ArrowDownRight className="mr-1 h-4 w-4" />}
          {Math.abs(trend)}%
        </div>
      </div>
    </div>
  );
}
