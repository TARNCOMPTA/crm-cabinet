interface CompletenessBarProps {
  filled: number;
  total: number;
  percent: number;
}

export function CompletenessBar({ filled, total, percent }: CompletenessBarProps) {
  const barColor = percent < 50 ? 'bg-red-500' : percent < 80 ? 'bg-amber-500' : 'bg-emerald-500';
  const textColor = percent < 50 ? 'text-red-700' : percent < 80 ? 'text-amber-700' : 'text-emerald-700';

  return (
    <div className="flex items-center gap-2">
      <div className="w-16 h-1.5 bg-gray-200 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-300 ${barColor}`}
          style={{ width: `${percent}%` }}
        />
      </div>
      <span className={`text-xs font-medium ${textColor} whitespace-nowrap`}>
        {filled}/{total}
      </span>
    </div>
  );
}
