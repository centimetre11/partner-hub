export function Badge({
  children,
  tone = "zinc",
}: {
  children: React.ReactNode;
  tone?: "zinc" | "indigo" | "green" | "amber" | "red" | "blue" | "purple";
}) {
  const tones: Record<string, string> = {
    zinc: "bg-slate-100 text-slate-600",
    indigo: "bg-sky-50 text-sky-700",
    green: "bg-emerald-50 text-emerald-700",
    amber: "bg-amber-50 text-amber-700",
    red: "bg-red-50 text-red-700",
    blue: "bg-sky-50 text-sky-700",
    purple: "bg-violet-50 text-violet-700",
  };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${tones[tone]}`}>
      {children}
    </span>
  );
}

import { formatTierLabel, normalizePartnerTier, type PartnerTier } from "@/lib/tier";

export function tierTone(tier?: string | null): "red" | "amber" | "blue" | "zinc" {
  const normalized = normalizePartnerTier(tier);
  if (normalized === "A") return "red";
  if (normalized === "B") return "amber";
  if (normalized === "C") return "blue";
  return "zinc";
}

export function TierBadge({ tier }: { tier?: string | null }) {
  const normalized = normalizePartnerTier(tier);
  if (!normalized) return null;
  return <Badge tone={tierTone(normalized)}>{formatTierLabel(normalized)}</Badge>;
}

export function tierSelectValue(tier?: string | null): PartnerTier | "" {
  return normalizePartnerTier(tier) ?? "";
}

/** Pipeline stage 1–3 visual tone (aligned with detail stepper). */
export function stageTone(stage: number): "blue" | "amber" | "green" | "zinc" {
  if (stage === 1) return "blue";
  if (stage === 2) return "amber";
  if (stage === 3) return "green";
  return "zinc";
}

export function StageBadge({ stage, name }: { stage: number; name: string }) {
  return <Badge tone={stageTone(stage)}>{name}</Badge>;
}

export function ScoreBar({ score }: { score: number }) {
  const color = score >= 70 ? "bg-emerald-500" : score >= 40 ? "bg-amber-500" : "bg-red-500";
  return (
    <div className="flex items-center gap-2 min-w-[90px]">
      <div className="flex-1 h-1 rounded-full bg-slate-100 overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${score}%` }} />
      </div>
      <span className="text-xs tabular-nums text-slate-500 w-8">{score}%</span>
    </div>
  );
}

export function PageHeader({
  title,
  desc,
  actions,
}: {
  title: string;
  desc?: string;
  actions?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col sm:flex-row items-start justify-between gap-3 sm:gap-4 px-4 sm:px-6 lg:px-8 pt-5 sm:pt-7 pb-4 sm:pb-5">
      <div className="min-w-0">
        <h1 className="text-lg sm:text-xl font-semibold text-slate-900 tracking-tight">{title}</h1>
        {desc && <p className="text-sm text-slate-500 mt-1">{desc}</p>}
      </div>
      {actions && <div className="flex items-center gap-2 shrink-0 flex-wrap">{actions}</div>}
    </div>
  );
}

export function Card({
  title,
  children,
  className = "",
  actions,
  id,
}: {
  title?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  actions?: React.ReactNode;
  id?: string;
}) {
  return (
    <div id={id} className={`ui-card ${className}`}>
      {(title || actions) && (
        <div className="flex items-center justify-between gap-2 px-4 sm:px-5 py-3 border-b border-slate-100">
          <h3 className="text-sm font-medium text-slate-800 min-w-0">{title}</h3>
          {actions}
        </div>
      )}
      <div className="p-4 sm:p-5">{children}</div>
    </div>
  );
}

export function EmptyState({ text }: { text: string }) {
  return <div className="text-center py-8 text-sm text-slate-400">{text}</div>;
}

export function fmtDate(d: Date | string | null | undefined, locale = "en-US") {
  if (!d) return "—";
  const date = typeof d === "string" ? new Date(d) : d;
  return date.toLocaleDateString(locale, { year: "numeric", month: "2-digit", day: "2-digit" });
}

export function fmtDateTime(d: Date | string | null | undefined, locale = "en-US") {
  if (!d) return "—";
  const date = typeof d === "string" ? new Date(d) : d;
  return date.toLocaleString(locale, {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}
