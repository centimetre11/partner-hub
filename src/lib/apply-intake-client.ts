import type { IntakeProposal, IntakeScope } from "./ai-intake";
import { normalizedToIntake, normalizeProposal } from "./proposal-normalize";

export async function applyIntakeProposalClient(opts: {
  scope: IntakeScope;
  partnerId?: string;
  proposal: IntakeProposal;
  sourceText?: string;
  intent?: "prospect" | "active";
}): Promise<{ partnerId: string; applied: string[] }> {
  const normalized = normalizeProposal(opts.proposal, opts.scope);
  const res = await fetch("/api/ai/intake/apply", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      scope: opts.scope,
      partnerId: opts.partnerId,
      proposal: normalizedToIntake(normalized),
      sourceText: opts.sourceText,
      intent: opts.intent,
    }),
  });
  const data = (await res.json()) as { partnerId?: string; applied?: string[]; error?: string };
  if (!res.ok) throw new Error(data.error ?? "Failed to save");
  return { partnerId: data.partnerId ?? opts.partnerId ?? "", applied: data.applied ?? [] };
}
