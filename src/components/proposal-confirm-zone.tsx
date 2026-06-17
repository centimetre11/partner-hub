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

/** Confirm & save zone (live draft mode) */
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
    if (!res.ok) throw new Error(data.error ?? "Failed to save");
    onApplied?.(data.partnerId);
  }

  const intakeProposal =
    proposal && "fields" in proposal ? (proposal as IntakeProposal) : null;

  return (
    <LiveProposalDraft
      proposal={intakeProposal}
      changes={patchChanges}
      onConfirm={apply}
      confirmLabel={ready ? "Confirm & save" : "Looks good — save now"}
      questions={questions}
      ready={ready}
      loading={loading}
    />
  );
}
