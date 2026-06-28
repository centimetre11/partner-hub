"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { Badge, ScoreBar, TierBadge } from "@/components/ui";
import type { PoolReviewPhase, PoolReviewPartner } from "@/lib/pool-review";
import {
  markPoolContactedAction,
  promotePartnerAction,
  setPoolFlagAction,
} from "@/lib/actions";

type Labels = {
  POOL_FLAG_LABELS: Record<string, string>;
  AI_VERIFIED_LABELS: Record<string, string>;
  STATUS_LABELS: Record<string, string>;
};

type PoolReviewCardProps = {
  partner: PoolReviewPartner;
  phase: PoolReviewPhase;
  skipIds: string[];
  categoryLabel: string;
  completenessScore: number;
  messages: {
    phasePendingContact: string;
    phasePendingDecision: string;
    markContacted: string;
    skipReview: string;
    viewFullProfile: string;
    promote: string;
    drop: string;
    watch: string;
    fitScore: string;
    coreBusiness: string;
    knownClients: string;
    pitch: string;
    common: {
      company: string;
      category: string;
      region: string;
      completeness: string;
      verification: string;
    };
  };
  labels: Labels;
};

function appendSkip(skipIds: string[], id: string): string {
  const next = skipIds.includes(id) ? skipIds : [...skipIds, id];
  return next.join(",");
}

export function PoolReviewCard({
  partner,
  phase,
  skipIds,
  categoryLabel,
  completenessScore,
  messages: m,
  labels: L,
}: PoolReviewCardProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function handleSkip() {
    const qs = appendSkip(skipIds, partner.id);
    router.push(`/pool/review?skip=${encodeURIComponent(qs)}`);
  }

  function bindAction(action: () => Promise<void>) {
    return () => {
      startTransition(async () => {
        await action();
        router.refresh();
      });
    };
  }

  const region = [partner.city, partner.country].filter(Boolean).join(" · ") || "—";
  const website = partner.website?.replace(/^https?:\/\//, "");

  return (
    <div className="bg-white rounded-xl border border-slate-200/80 shadow-sm overflow-hidden">
      <div className="px-6 py-4 border-b border-slate-100 flex flex-wrap items-center justify-between gap-3">
        <Badge tone={phase === "pending_contact" ? "blue" : "amber"}>
          {phase === "pending_contact" ? m.phasePendingContact : m.phasePendingDecision}
        </Badge>
        <Link
          href={`/partners/${partner.id}`}
          className="text-sm text-sky-600 hover:underline"
          target="_blank"
        >
          {m.viewFullProfile} →
        </Link>
      </div>

      <div className="px-6 py-5 space-y-4">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-xl font-bold text-slate-900">{partner.name}</h2>
            <TierBadge tier={partner.tier} />
            <Badge tone={partner.aiVerified === "VERIFIED" ? "green" : "zinc"}>
              {L.AI_VERIFIED_LABELS[partner.aiVerified ?? "UNKNOWN"]}
            </Badge>
          </div>
          <p className="text-sm text-slate-500 mt-1">
            {categoryLabel} · {region}
            {website && (
              <>
                {" · "}
                <a
                  href={`https://${website}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sky-600 hover:underline"
                >
                  {website}
                </a>
              </>
            )}
          </p>
        </div>

        <div className="grid sm:grid-cols-2 gap-4 text-sm">
          <div>
            <div className="text-xs text-slate-500 mb-1">{m.common.completeness}</div>
            <ScoreBar score={completenessScore} />
          </div>
          {partner.fitScore != null && (
            <div>
              <div className="text-xs text-slate-500 mb-1">{m.fitScore}</div>
              <div className="font-medium text-slate-800">{partner.fitScore}</div>
            </div>
          )}
        </div>

        {partner.coreBusiness && (
          <div className="text-sm">
            <div className="text-xs font-medium text-slate-500 mb-1">{m.coreBusiness}</div>
            <p className="text-slate-700 leading-relaxed">{partner.coreBusiness}</p>
          </div>
        )}
        {partner.knownClients && (
          <div className="text-sm">
            <div className="text-xs font-medium text-slate-500 mb-1">{m.knownClients}</div>
            <p className="text-slate-700 leading-relaxed">{partner.knownClients}</p>
          </div>
        )}
        {partner.pitch && (
          <div className="text-sm">
            <div className="text-xs font-medium text-slate-500 mb-1">{m.pitch}</div>
            <p className="text-slate-700 leading-relaxed">{partner.pitch}</p>
          </div>
        )}
      </div>

      <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex flex-wrap items-center gap-2">
        {phase === "pending_contact" ? (
          <>
            <form action={bindAction(markPoolContactedAction.bind(null, partner.id))}>
              <button
                type="submit"
                disabled={pending}
                className="rounded-lg bg-slate-900 text-white px-4 py-2 text-sm font-medium hover:bg-slate-800 disabled:opacity-50"
              >
                {m.markContacted}
              </button>
            </form>
            <button
              type="button"
              disabled={pending}
              onClick={handleSkip}
              className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm text-slate-600 hover:bg-slate-50 disabled:opacity-50"
            >
              {m.skipReview}
            </button>
            <div className="hidden sm:block w-px h-6 bg-slate-200 mx-1" />
            <form action={bindAction(promotePartnerAction.bind(null, partner.id))}>
              <button
                type="submit"
                disabled={pending}
                className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-50"
              >
                {m.promote}
              </button>
            </form>
            <form action={bindAction(setPoolFlagAction.bind(null, partner.id, "WATCHING"))}>
              <button
                type="submit"
                disabled={pending}
                className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-600 hover:bg-slate-50 disabled:opacity-50"
              >
                {m.watch}
              </button>
            </form>
            <form action={bindAction(setPoolFlagAction.bind(null, partner.id, "DROPPED"))}>
              <button
                type="submit"
                disabled={pending}
                className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-400 hover:text-red-600 hover:border-red-200 disabled:opacity-50"
              >
                {m.drop}
              </button>
            </form>
          </>
        ) : (
          <>
            <form action={bindAction(promotePartnerAction.bind(null, partner.id))}>
              <button
                type="submit"
                disabled={pending}
                className="rounded-lg bg-slate-900 text-white px-4 py-2 text-sm font-medium hover:bg-slate-800 disabled:opacity-50"
              >
                {m.promote}
              </button>
            </form>
            <form action={bindAction(setPoolFlagAction.bind(null, partner.id, "WATCHING"))}>
              <button
                type="submit"
                disabled={pending}
                className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-600 hover:bg-slate-50 disabled:opacity-50"
              >
                {m.watch}
              </button>
            </form>
            <form action={bindAction(setPoolFlagAction.bind(null, partner.id, "DROPPED"))}>
              <button
                type="submit"
                disabled={pending}
                className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-400 hover:text-red-600 hover:border-red-200 disabled:opacity-50"
              >
                {m.drop}
              </button>
            </form>
            <button
              type="button"
              disabled={pending}
              onClick={handleSkip}
              className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm text-slate-600 hover:bg-slate-50 disabled:opacity-50 ml-auto sm:ml-0"
            >
              {m.skipReview}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
