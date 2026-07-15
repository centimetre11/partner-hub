import type { PartnerPrepBrief } from "./types";
import type { ConfirmedItemSnapshot } from "./types";

export type ReportPartnerRow = {
  partnerName: string;
  partnerTier?: string | null;
  prepSummary?: string | null;
  aiTopics?: string[];
  progressSummary: string;
  todos: { title: string; detail?: string | null; dueDate?: string | null }[];
};

export function buildFinalReportMarkdown(opts: {
  title: string;
  endedAt?: string | null;
  partners: ReportPartnerRow[];
}): string {
  const dateLabel = opts.endedAt
    ? new Date(opts.endedAt).toLocaleString("zh-CN", { hour12: false })
    : new Date().toLocaleString("zh-CN", { hour12: false });

  const parts: string[] = [
    `# ${opts.title}`,
    ``,
    `过伙伴会议报告 · ${dateLabel}`,
    ``,
  ];

  opts.partners.forEach((p, idx) => {
    parts.push(`## ${idx + 1}. ${p.partnerName}${p.partnerTier ? ` · Tier ${p.partnerTier}` : ""}`);
    parts.push(``);
    if (p.prepSummary?.trim()) {
      parts.push(`### 会前摘要`);
      parts.push(p.prepSummary.trim());
      parts.push(``);
    }
    if (p.aiTopics?.length) {
      parts.push(`### 会前议题`);
      for (const t of p.aiTopics) parts.push(`- ${t}`);
      parts.push(``);
    }
    parts.push(`### 近两周进展总结`);
    parts.push(p.progressSummary.trim() || "（无）");
    parts.push(``);
    parts.push(`### 后续待办`);
    if (p.todos.length) {
      for (const t of p.todos) {
        const due = t.dueDate ? `（截止 ${t.dueDate.slice(0, 10)}）` : "";
        parts.push(`- ${t.title}${due}`);
        if (t.detail?.trim()) parts.push(`  ${t.detail.trim()}`);
      }
    } else {
      parts.push(`- （无）`);
    }
    parts.push(``);
  });

  return parts.join("\n").trim() + "\n";
}

export function reportRowFromBriefAndDraft(opts: {
  partnerName: string;
  partnerTier?: string | null;
  prepBrief?: PartnerPrepBrief | null;
  progressSummary: string;
  todos: { title: string; detail?: string | null; dueDate?: string | null; include?: boolean }[];
}): ReportPartnerRow {
  return {
    partnerName: opts.partnerName,
    partnerTier: opts.partnerTier,
    prepSummary: opts.prepBrief?.summaryLine ?? null,
    aiTopics: opts.prepBrief?.aiTopics,
    progressSummary: opts.progressSummary,
    todos: opts.todos
      .filter((t) => t.include !== false && t.title.trim())
      .map((t) => ({
        title: t.title.trim(),
        detail: t.detail ?? null,
        dueDate: t.dueDate ?? null,
      })),
  };
}

export function reportRowFromConfirmed(opts: {
  partnerName: string;
  partnerTier?: string | null;
  prepBrief?: PartnerPrepBrief | null;
  snapshot?: ConfirmedItemSnapshot | null;
  coreNotes?: string | null;
}): ReportPartnerRow {
  const snap = opts.snapshot;
  return {
    partnerName: opts.partnerName,
    partnerTier: opts.partnerTier,
    prepSummary: opts.prepBrief?.summaryLine ?? null,
    aiTopics: opts.prepBrief?.aiTopics,
    progressSummary: snap?.coreNotes || opts.coreNotes || "",
    todos: (snap?.todos ?? []).map((t) => ({
      title: t.title,
      detail: t.detail,
      dueDate: t.dueDate,
    })),
  };
}
