"use client";

import type { IntakeProposal, IntakeScope } from "@/lib/ai-intake";
import type { ExtractionProposal } from "@/lib/proposals";
import type { ProposalChanges } from "@/lib/proposal-merge";
import { normalizedToIntake, type NormalizedProposal } from "@/lib/proposal-normalize";
import { LiveProposalDraft } from "@/components/live-proposal-draft";

type Props = {
  proposal: IntakeProposal | ExtractionProposal | null;
  scope?: IntakeScope;
  partnerId?: string;
  questions?: string[];
  ready?: boolean;
  onApplied?: (partnerId: string) => void;
  sourceText?: string;
  patchChanges?: ProposalChanges | null;
  loading?: boolean;
};

/** 确认入库区（活草稿模式） */
export function ProposalConfirmZone({
  proposal,
  scope = "new_partner",
  partnerId,
  questions = [],
  ready = false,
  onApplied,
  sourceText,
  patchChanges,
  loading = false,
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

  const intakeProposal =
    proposal && "fields" in proposal ? (proposal as IntakeProposal) : null;

  return (
    <LiveProposalDraft
      proposal={intakeProposal}
      changes={patchChanges}
      onConfirm={apply}
      confirmLabel={ready ? "确认入库" : "信息够了，直接入库"}
      questions={questions}
      ready={ready}
      loading={loading}
    />
  );
}
