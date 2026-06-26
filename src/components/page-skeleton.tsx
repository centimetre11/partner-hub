function Pulse({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded-md bg-slate-200/80 ${className}`} />;
}

export function ListPageSkeleton({ cards = 6 }: { cards?: number }) {
  return (
    <div className="pb-16">
      <div className="px-4 sm:px-6 lg:px-8 pt-5 sm:pt-7 pb-4 sm:pb-5">
        <Pulse className="h-6 w-40" />
        <Pulse className="h-4 w-64 mt-2" />
      </div>
      <div className="px-8">
        <div className="flex flex-wrap gap-2 mb-4">
          <Pulse className="h-8 w-44" />
          <Pulse className="h-8 w-28" />
          <Pulse className="h-8 w-32" />
          <Pulse className="h-8 w-24" />
        </div>
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          {Array.from({ length: cards }, (_, i) => (
            <div key={i} className="bg-white rounded-lg border border-slate-200/80 p-5 space-y-3">
              <div className="flex justify-between gap-3">
                <Pulse className="h-5 w-48" />
                <Pulse className="h-5 w-20" />
              </div>
              <Pulse className="h-3 w-full max-w-xs" />
              <div className="grid grid-cols-3 gap-2">
                <Pulse className="h-12" />
                <Pulse className="h-12" />
                <Pulse className="h-12" />
              </div>
              <Pulse className="h-3 w-2/3" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function TablePageSkeleton({ rows = 8 }: { rows?: number }) {
  return (
    <div className="pb-16">
      <div className="px-4 sm:px-6 lg:px-8 pt-5 sm:pt-7 pb-4 sm:pb-5">
        <Pulse className="h-6 w-32" />
        <Pulse className="h-4 w-56 mt-2" />
      </div>
      <div className="px-8">
        <div className="flex flex-wrap gap-2 mb-4">
          <Pulse className="h-8 w-48" />
          <Pulse className="h-8 w-28" />
          <Pulse className="h-8 w-36" />
        </div>
        <div className="bg-white rounded-lg border border-slate-200/80 overflow-hidden">
          <div className="border-b border-slate-100 bg-slate-50/50 px-4 py-3">
            <Pulse className="h-4 w-full max-w-2xl" />
          </div>
          <div className="divide-y divide-slate-50">
            {Array.from({ length: rows }, (_, i) => (
              <div key={i} className="px-4 py-3 flex gap-4">
                <Pulse className="h-4 w-36" />
                <Pulse className="h-4 w-24 hidden sm:block" />
                <Pulse className="h-4 w-20 hidden md:block" />
                <Pulse className="h-4 w-28 hidden lg:block" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export function DetailPageSkeleton() {
  return (
    <div>
      <div className="px-8 pt-5 sm:pt-7 pb-4 sm:pb-5 border-b border-slate-200/60 bg-white space-y-4">
        <div className="flex items-start gap-3">
          <Pulse className="h-8 w-8 shrink-0" />
          <div className="flex-1 space-y-2">
            <Pulse className="h-7 w-64 max-w-full" />
            <Pulse className="h-4 w-96 max-w-full" />
          </div>
        </div>
        <div className="flex gap-2 overflow-hidden">
          {Array.from({ length: 6 }, (_, i) => (
            <Pulse key={i} className="h-7 w-24 shrink-0 rounded-full" />
          ))}
        </div>
      </div>
      <div className="px-8 py-6 space-y-5">
        <div className="flex gap-2 border-b border-slate-200 pb-3">
          {Array.from({ length: 5 }, (_, i) => (
            <Pulse key={i} className="h-8 w-20" />
          ))}
        </div>
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
          <Pulse className="h-48 rounded-lg" />
          <Pulse className="h-48 rounded-lg" />
        </div>
        <Pulse className="h-64 rounded-lg" />
      </div>
    </div>
  );
}
