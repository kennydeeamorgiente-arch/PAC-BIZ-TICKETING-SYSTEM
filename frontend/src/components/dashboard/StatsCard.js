import { ArrowUpRight, ArrowDownRight } from 'lucide-react';

export default function StatsCard({ title, value, subtitle, trend = 0, icon: Icon, tone = 'primary' }) {
  const trendPositive = trend >= 0;

  const toneMap = {
    primary: 'bg-primary-50 text-primary-700',
    secondary: 'bg-secondary-50 text-secondary-700',
    accent: 'bg-emerald-50 text-emerald-700',
    warning: 'bg-amber-50 text-amber-700',
  };

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm font-medium text-gray-500">{title}</p>
          <h3 className="mt-2 text-3xl font-bold text-gray-900">{value}</h3>
        </div>
        {Icon ? (
          <div className={`rounded-lg p-2 ${toneMap[tone] || toneMap.primary}`}>
            <Icon className="h-5 w-5" />
          </div>
        ) : null}
      </div>

      <div className="mt-4 flex items-center justify-between">
        <p className="text-xs text-gray-500">{subtitle}</p>
        <div className={`flex items-center text-xs font-semibold ${trendPositive ? 'text-emerald-600' : 'text-red-600'}`}>
          {trendPositive ? <ArrowUpRight className="mr-1 h-4 w-4" /> : <ArrowDownRight className="mr-1 h-4 w-4" />}
          {Math.abs(trend)}%
        </div>
      </div>
    </div>
  );
}
