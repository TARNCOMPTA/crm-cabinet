interface PageSkeletonProps {
  variant?: 'dashboard' | 'table' | 'kanban' | 'default';
}

function SkeletonBlock({ className = '' }: { className?: string }) {
  return (
    <div
      className={`animate-pulse bg-gray-200 dark:bg-gray-700 rounded ${className}`}
    />
  );
}

function DashboardSkeleton() {
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="space-y-2">
        <SkeletonBlock className="h-8 w-48" />
        <SkeletonBlock className="h-4 w-72" />
      </div>

      {/* KPI strip */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4 space-y-3"
          >
            <SkeletonBlock className="h-4 w-20" />
            <SkeletonBlock className="h-8 w-16" />
          </div>
        ))}
      </div>

      {/* Cards grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6 space-y-4"
          >
            <SkeletonBlock className="h-5 w-32" />
            <SkeletonBlock className="h-4 w-full" />
            <SkeletonBlock className="h-4 w-3/4" />
            <SkeletonBlock className="h-4 w-1/2" />
          </div>
        ))}
      </div>
    </div>
  );
}

function TableSkeleton() {
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="space-y-2">
          <SkeletonBlock className="h-8 w-32" />
          <SkeletonBlock className="h-4 w-24" />
        </div>
        <SkeletonBlock className="h-10 w-36 rounded-lg" />
      </div>

      {/* Toolbar */}
      <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
        <div className="flex gap-4">
          <SkeletonBlock className="h-10 flex-1 rounded-lg" />
          <SkeletonBlock className="h-10 w-28 rounded-lg" />
        </div>
      </div>

      {/* Table rows */}
      <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
        {/* Table header */}
        <div className="px-6 py-3 border-b border-gray-200 dark:border-gray-700 flex gap-6">
          <SkeletonBlock className="h-4 w-40" />
          <SkeletonBlock className="h-4 w-24" />
          <SkeletonBlock className="h-4 w-20" />
          <SkeletonBlock className="h-4 w-28" />
        </div>
        {/* Table rows */}
        {Array.from({ length: 6 }).map((_, i) => (
          <div
            key={i}
            className="px-6 py-4 border-b border-gray-100 dark:border-gray-700/50 flex gap-6 items-center"
          >
            <SkeletonBlock className="h-4 w-44" />
            <SkeletonBlock className="h-4 w-28" />
            <SkeletonBlock className="h-4 w-20" />
            <SkeletonBlock className="h-4 w-24" />
          </div>
        ))}
      </div>
    </div>
  );
}

function KanbanSkeleton() {
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="space-y-2">
          <SkeletonBlock className="h-8 w-32" />
          <SkeletonBlock className="h-4 w-56" />
        </div>
        <div className="flex gap-2">
          <SkeletonBlock className="h-10 w-24 rounded-lg" />
          <SkeletonBlock className="h-10 w-36 rounded-lg" />
        </div>
      </div>

      {/* Columns */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {Array.from({ length: 4 }).map((_, colIdx) => (
          <div
            key={colIdx}
            className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4 space-y-3"
          >
            {/* Column header */}
            <div className="flex items-center justify-between mb-4">
              <SkeletonBlock className="h-5 w-20" />
              <SkeletonBlock className="h-5 w-6 rounded-full" />
            </div>
            {/* Cards */}
            {Array.from({ length: colIdx === 0 ? 3 : colIdx === 1 ? 2 : 1 }).map(
              (_, cardIdx) => (
                <div
                  key={cardIdx}
                  className="bg-gray-50 dark:bg-gray-750 rounded-lg border border-gray-100 dark:border-gray-700 p-3 space-y-2"
                >
                  <SkeletonBlock className="h-4 w-3/4" />
                  <SkeletonBlock className="h-3 w-full" />
                  <div className="flex gap-2 pt-1">
                    <SkeletonBlock className="h-5 w-14 rounded-full" />
                    <SkeletonBlock className="h-5 w-16 rounded-full" />
                  </div>
                </div>
              )
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function DefaultSkeleton() {
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="space-y-2">
        <SkeletonBlock className="h-8 w-48" />
        <SkeletonBlock className="h-4 w-64" />
      </div>

      {/* Content blocks */}
      <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6 space-y-4">
        <SkeletonBlock className="h-5 w-40" />
        <SkeletonBlock className="h-4 w-full" />
        <SkeletonBlock className="h-4 w-full" />
        <SkeletonBlock className="h-4 w-2/3" />
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6 space-y-4">
        <SkeletonBlock className="h-5 w-36" />
        <SkeletonBlock className="h-4 w-full" />
        <SkeletonBlock className="h-4 w-5/6" />
      </div>
    </div>
  );
}

export function PageSkeleton({ variant = 'default' }: PageSkeletonProps) {
  switch (variant) {
    case 'dashboard':
      return <DashboardSkeleton />;
    case 'table':
      return <TableSkeleton />;
    case 'kanban':
      return <KanbanSkeleton />;
    default:
      return <DefaultSkeleton />;
  }
}
