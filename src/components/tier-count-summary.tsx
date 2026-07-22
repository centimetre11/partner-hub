import type { TierCounts } from "@/lib/tier";

/** 紧凑展示 A/B/C（及未分级）数量，用于看板列头与筛选旁摘要 */
export function TierCountSummary({
  counts,
  showUnset = true,
  className = "",
}: {
  counts: TierCounts;
  showUnset?: boolean;
  className?: string;
}) {
  return (
    <div
      className={`flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] tabular-nums leading-tight ${className}`}
    >
      <span className="text-red-600/90">
        A <span className="font-semibold">{counts.A}</span>
      </span>
      <span className="text-amber-600/90">
        B <span className="font-semibold">{counts.B}</span>
      </span>
      <span className="text-sky-600/90">
        C <span className="font-semibold">{counts.C}</span>
      </span>
      {showUnset && counts.unset > 0 ? (
        <span className="text-slate-400">
          — <span className="font-medium">{counts.unset}</span>
        </span>
      ) : null}
    </div>
  );
}
