import { ArrowUpRight, ArrowDownRight } from 'lucide-react';

export default function StatsCard({ title, value, subtitle, trend = null, icon: Icon, tone = 'primary', className = '' }) {
  const hasTrend = Number.isFinite(Number(trend));
  const trendPositive = Number(trend) >= 0;

  const toneMap = {
    primary: 'bg-primary-100/70 text-primary-700 dark:bg-primary-700/35 dark:text-blue-100',
    secondary: 'bg-secondary-100/70 text-secondary-700 dark:bg-secondary-700/35 dark:text-green-100',
    accent: 'bg-accent-100/80 text-accent-700 dark:bg-accent-700/35 dark:text-teal-100',
    warning: 'bg-amber-100/80 text-amber-700 dark:bg-amber-900/35 dark:text-amber-200',
  };

  const cardToneMap = {
    primary: 'border-primary-100 bg-gradient-to-br from-primary-50/80 to-white dark:border-primary-700 dark:from-slate-900 dark:to-primary-900/35',
    secondary: 'border-secondary-100 bg-gradient-to-br from-secondary-50/80 to-white dark:border-secondary-700 dark:from-slate-900 dark:to-secondary-900/30',
    accent: 'border-accent-100 bg-gradient-to-br from-accent-50/80 to-white dark:border-accent-700 dark:from-slate-900 dark:to-accent-900/25',
    warning: 'border-amber-100 bg-gradient-to-br from-amber-50/80 to-white dark:border-amber-700 dark:from-slate-900 dark:to-amber-900/25',
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
        {hasTrend ? (
          <div className={`flex items-center text-xs font-semibold ${trendPositive ? 'text-emerald-600' : 'text-red-600'}`}>
            {trendPositive ? <ArrowUpRight className="mr-1 h-4 w-4" /> : <ArrowDownRight className="mr-1 h-4 w-4" />}
            {Math.abs(Number(trend))}%
          </div>
        ) : null}
      </div>
    </div>
  );
}
