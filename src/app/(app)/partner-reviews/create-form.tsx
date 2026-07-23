"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createPartnerReviewMeetingAction } from "@/lib/partner-review/actions";
import { useMessages } from "@/lib/i18n/context";
import { formatMsg } from "@/lib/i18n/messages";

type PartnerOption = { id: string; name: string; tier: string | null };

export function CreateReviewMeetingForm({ partners }: { partners: PartnerOption[] }) {
  const t = useMessages().partnerReview;
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return partners;
    return partners.filter((p) => p.name.toLowerCase().includes(q));
  }, [partners, query]);

  function toggle(id: string) {
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  function submit() {
    void (async () => {
      setBusy(true);
      setError(null);
      try {
        const fd = new FormData();
        fd.set("title", title.trim());
        for (const id of selected) fd.append("partnerIds", id);
        const res = await createPartnerReviewMeetingAction(fd);
        if (res.error) {
          setError(res.error);
          return;
        }
        if (res.id) {
          setOpen(false);
          router.push(`/partner-reviews/${res.id}`);
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setBusy(false);
      }
    })();
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-lg bg-slate-900 text-white px-4 py-2 text-sm hover:bg-slate-800"
      >
        {t.create}
      </button>
    );
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-4 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold text-slate-800">{t.createTitle}</h3>
        <button type="button" className="text-xs text-slate-500 hover:text-slate-800" onClick={() => setOpen(false)}>
          {t.cancel}
        </button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block space-y-1 sm:col-span-2">
          <span className="text-xs text-slate-500">{t.meetingTitle}</span>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={t.meetingTitlePh}
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
          />
        </label>
        <label className="block space-y-1 sm:col-span-2">
          <span className="text-xs text-slate-500">{t.searchPartners}</span>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t.searchPh}
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
          />
        </label>
      </div>

      <div className="rounded-lg border border-slate-100 max-h-56 overflow-y-auto divide-y divide-slate-50">
        {filtered.map((p) => {
          const checked = selected.includes(p.id);
          return (
            <label key={p.id} className="flex items-center gap-3 px-3 py-2 text-sm hover:bg-slate-50 cursor-pointer">
              <input type="checkbox" checked={checked} onChange={() => toggle(p.id)} />
              <span className="flex-1 text-slate-800">{p.name}</span>
              {p.tier && <span className="text-xs text-slate-400">Tier {p.tier}</span>}
            </label>
          );
        })}
        {!filtered.length && <p className="px-3 py-4 text-xs text-slate-400">{t.noMatch}</p>}
      </div>

      <p className="text-xs text-slate-500">{formatMsg(t.selectedCount, { n: selected.length })}</p>
      {error && <p className="text-xs text-red-600">{error}</p>}

      <button
        type="button"
        disabled={busy || !selected.length}
        onClick={submit}
        className="rounded-lg bg-slate-900 text-white px-4 py-2 text-sm hover:bg-slate-800 disabled:opacity-40"
      >
        {busy ? t.submitting : t.submit}
      </button>
    </div>
  );
}
