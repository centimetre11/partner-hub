"use client";

import type { IntakeProposal, IntakeScope } from "@/lib/ai-intake";
import type { ExtractionProposal } from "@/lib/proposals";
import { normalizedToIntake, type NormalizedProposal } from "@/lib/proposal-normalize";
import { ProposalView } from "@/components/proposal-view";

type Props = {
  proposal: IntakeProposal | ExtractionProposal;
  scope?: IntakeScope;
  partnerId?: string;
  questions?: string[];
  ready?: boolean;
  onApplied?: (partnerId: string) => void;
  compact?: boolean;
  sourceText?: string;
};

/** 底部固定确认区：可勾选、可多轮补充后再入库 */
export function ProposalConfirmZone({
  proposal,
  scope = "new_partner",
  partnerId,
  questions = [],
  ready = false,
  onApplied,
  compact = true,
  sourceText,
}: Props) {
  async function apply(filtered: NormalizedProposal) {
    const res = await fetch("/api/ai/intake/apply", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        scope,
        partnerId,
        proposal: normalizedToIntake(filtered),
        sourceText,
      }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error ?? "写入失败");
    onApplied?.(data.partnerId);
  }

  return (
    <div className={`rounded-xl border border-zinc-200 bg-zinc-50/80 ${compact ? "p-2.5" : "p-4"}`}>
      <div className="flex items-center justify-between mb-2">
        <div className="text-xs font-semibold text-zinc-600">待确认入库</div>
        <div className="text-[10px] text-zinc-400">可取消勾选 · 继续聊天可补充</div>
      </div>
      <ProposalView
        proposal={proposal}
        onConfirm={apply}
        confirmLabel={ready ? "✓ 确认入库" : "信息够了，直接入库"}
        compact={compact}
      />
      {questions.length > 0 && !ready && (
        <div className="mt-2 text-xs text-amber-700 bg-amber-50 rounded-lg p-2">
          补充这些会更完整：{questions.join("；")}
        </div>
      )}
    </div>
  );
}
