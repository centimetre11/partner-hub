export function CollapsibleCard({
  title,
  children,
  className = "",
}: {
  title: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <details className={`ui-card group ${className}`}>
      <summary className="flex items-center justify-between gap-2 px-4 sm:px-5 py-3 cursor-pointer list-none select-none hover:bg-slate-50/80 transition-colors [&::-webkit-details-marker]:hidden">
        <h3 className="text-sm font-medium text-slate-800 min-w-0">{title}</h3>
        <span
          aria-hidden
          className="text-slate-400 text-xs shrink-0 transition-transform group-open:rotate-180"
        >
          ▼
        </span>
      </summary>
      <div className="p-4 sm:p-5 border-t border-slate-100">{children}</div>
    </details>
  );
}
