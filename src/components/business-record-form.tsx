"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useLabels, useMessages } from "@/lib/i18n/context";
import { createBusinessRecordAction } from "@/lib/actions";
import type { OwnerRef } from "@/lib/owner";

const CATEGORIES = ["VISIT", "TRAINING", "NEGOTIATION", "DELIVERY", "RELATIONSHIP", "OTHER"] as const;

export function BusinessRecordForm({
  owner,
  source = "MANUAL",
  defaultTitle = "",
  sourceTodoId,
  contacts = [],
  onDone,
  compact = false,
}: {
  owner: OwnerRef;
  source?: "MANUAL" | "TODO" | "RELATIONSHIP_TAB";
  defaultTitle?: string;
  sourceTodoId?: string;
  contacts?: { id: string; name: string }[];
  onDone?: () => void;
  compact?: boolean;
}) {
  const pd = useMessages().partnerDetail;
  const labels = useLabels();
  const router = useRouter();
  const [title, setTitle] = useState(defaultTitle);
  const [content, setContent] = useState("");
  const [category, setCategory] = useState<string>("VISIT");
  const [occurredAt, setOccurredAt] = useState(new Date().toISOString().slice(0, 10));
  const [contactId, setContactId] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<{ tone: "ok" | "warn" | "info"; text: string } | null>(null);

  const input = compact
    ? "w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-slate-400"
    : "w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400";

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    setSubmitting(true);
    setFeedback(null);
    try {
      const fd = new FormData();
      fd.set("title", title.trim());
      fd.set("content", content);
      fd.set("category", category);
      fd.set("occurredAt", occurredAt);
      fd.set("source", source);
      if (contactId) fd.set("contactId", contactId);
      if (sourceTodoId) fd.set("sourceTodoId", sourceTodoId);
      const res = await createBusinessRecordAction(owner, fd);
      if (res?.message) setFeedback({ tone: "ok", text: res.message });
      else if (res?.warning) setFeedback({ tone: "warn", text: res.warning });
      else if (res?.info) setFeedback({ tone: "info", text: res.info });
      router.refresh();
      if (res?.message || !res?.warning) onDone?.();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={(e) => void submit(e)} className={`space-y-3 ${compact ? "text-xs" : "text-sm"}`}>
      <div className={`grid gap-2 ${compact ? "grid-cols-1" : "grid-cols-1 sm:grid-cols-2"}`}>
        <label className="block space-y-1 sm:col-span-2">
          <span className="text-xs text-slate-500">{pd.businessRecordTitle}</span>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            required
            className={input}
            placeholder="拜访了对方 VP"
          />
        </label>
        <label className="block space-y-1">
          <span className="text-xs text-slate-500">{pd.businessRecordCategory}</span>
          <select value={category} onChange={(e) => setCategory(e.target.value)} className={input}>
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {labels.businessRecordCategoryLabels[c] ?? c}
              </option>
            ))}
          </select>
        </label>
        <label className="block space-y-1">
          <span className="text-xs text-slate-500">{pd.businessRecordOccurredAt}</span>
          <input type="date" value={occurredAt} onChange={(e) => setOccurredAt(e.target.value)} className={input} />
        </label>
        {contacts.length > 0 && (
          <label className="block space-y-1 sm:col-span-2">
            <span className="text-xs text-slate-500">{pd.businessRecordContact}</span>
            <select value={contactId} onChange={(e) => setContactId(e.target.value)} className={input}>
              <option value="">—</option>
              {contacts.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </label>
        )}
        <label className="block space-y-1 sm:col-span-2">
          <span className="text-xs text-slate-500">{pd.businessRecordContent}</span>
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            rows={compact ? 2 : 3}
            className={input}
          />
        </label>
      </div>
      {feedback && (
        <div
          className={`rounded-lg text-xs px-3 py-2 ${
            feedback.tone === "ok"
              ? "bg-emerald-50 text-emerald-800"
              : feedback.tone === "warn"
                ? "bg-amber-50 text-amber-800"
                : "bg-slate-50 text-slate-600"
          }`}
        >
          {feedback.text}
        </div>
      )}
      <div className="flex justify-end gap-2">
        {onDone && (
          <button type="button" onClick={onDone} className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs text-slate-600">
            {pd.skipMilestone}
          </button>
        )}
        <button
          type="submit"
          disabled={submitting || !title.trim()}
          className="rounded-lg bg-slate-900 px-3 py-1.5 text-xs text-white disabled:opacity-50"
        >
          {sourceTodoId ? pd.confirmMilestone : pd.addBusinessRecord}
        </button>
      </div>
    </form>
  );
}
