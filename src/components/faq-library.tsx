"use client";

import { useMemo, useState, useTransition } from "react";
import { Badge } from "@/components/ui";
import { MarkdownPreview } from "@/components/markdown-editor";
import { upsertFaqAction, deleteFaqAction } from "@/lib/content-actions";

export type FaqEntryView = {
  id: string;
  question: string;
  answer: string;
  category: string;
  editorLabel: string;
};

type FaqMessages = {
  newQuestion: string;
  searchPlaceholder: string;
  allCategories: string;
  questionLabel: string;
  answerLabel: string;
  categoryLabel: string;
  questionPlaceholder: string;
  answerPlaceholder: string;
  empty: string;
  emptyFiltered: string;
  answerEmpty: string;
  count: string;
  edit: string;
  preview: string;
  save: string;
  cancel: string;
  delete: string;
  deleteConfirm: string;
  tip: string;
};

const tones = ["blue", "purple", "green", "amber", "indigo", "red", "zinc"] as const;

function toneFor(category: string, categories: { value: string }[]) {
  const idx = Math.max(0, categories.findIndex((c) => c.value === category));
  return tones[idx % tones.length];
}

const inputCls =
  "w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400";

export function FaqLibrary({
  entries,
  categories,
  m,
}: {
  entries: FaqEntryView[];
  categories: { value: string; label: string }[];
  m: FaqMessages;
}) {
  const [query, setQuery] = useState("");
  const [activeCategory, setActiveCategory] = useState<string>("");
  const [showNew, setShowNew] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [, startTransition] = useTransition();

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return entries.filter((e) => {
      if (activeCategory && e.category !== activeCategory) return false;
      if (!q) return true;
      return (
        e.question.toLowerCase().includes(q) || e.answer.toLowerCase().includes(q)
      );
    });
  }, [entries, query, activeCategory]);

  const countLabel = m.count.replace("{n}", String(filtered.length));

  function handleUpsert(formData: FormData) {
    startTransition(async () => {
      await upsertFaqAction(formData);
      setShowNew(false);
      setEditingId(null);
    });
  }

  function handleDelete(id: string) {
    if (!window.confirm(m.deleteConfirm)) return;
    startTransition(async () => {
      await deleteFaqAction(id);
    });
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={m.searchPlaceholder}
          className="w-full sm:max-w-md rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400"
        />
        <button
          type="button"
          onClick={() => {
            setShowNew((v) => !v);
            setEditingId(null);
          }}
          className="shrink-0 rounded-lg bg-slate-900 text-white px-4 py-2 text-sm font-medium hover:bg-slate-800"
        >
          {showNew ? m.cancel : `+ ${m.newQuestion}`}
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <CategoryChip
          label={m.allCategories}
          active={activeCategory === ""}
          onClick={() => setActiveCategory("")}
        />
        {categories.map((c) => (
          <CategoryChip
            key={c.value}
            label={c.label}
            active={activeCategory === c.value}
            onClick={() => setActiveCategory(c.value)}
          />
        ))}
        <span className="ml-auto text-xs text-slate-400">{countLabel}</span>
      </div>

      {showNew && (
        <FaqForm
          m={m}
          categories={categories}
          defaultCategory={activeCategory || categories[0]?.value}
          onSubmit={handleUpsert}
          onCancel={() => setShowNew(false)}
        />
      )}

      <div className="space-y-3">
        {filtered.map((e) => {
          const isEditing = editingId === e.id;
          const isOpen = expanded[e.id] ?? false;
          if (isEditing) {
            return (
              <FaqForm
                key={e.id}
                m={m}
                categories={categories}
                entry={e}
                onSubmit={handleUpsert}
                onCancel={() => setEditingId(null)}
              />
            );
          }
          return (
            <div key={e.id} className="rounded-xl border border-slate-200 bg-white shadow-sm">
              <button
                type="button"
                onClick={() => setExpanded((s) => ({ ...s, [e.id]: !isOpen }))}
                className="w-full text-left px-5 py-4 flex items-start justify-between gap-3"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <Badge tone={toneFor(e.category, categories)}>
                      {categories.find((c) => c.value === e.category)?.label ?? e.category}
                    </Badge>
                  </div>
                  <h3 className="text-sm font-medium text-slate-900 break-words">{e.question}</h3>
                  <div className="mt-1 text-xs text-slate-400">{e.editorLabel}</div>
                </div>
                <span className={`mt-1 text-slate-300 transition ${isOpen ? "rotate-45" : ""}`}>+</span>
              </button>

              {isOpen && (
                <div className="px-5 pb-5 space-y-3">
                  <div className="rounded-lg border border-slate-100 bg-slate-50/50 p-4">
                    <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-400 mb-1">
                      {m.answerLabel}
                    </div>
                    {e.answer.trim() ? (
                      <MarkdownPreview content={e.answer} />
                    ) : (
                      <p className="text-sm text-slate-400 italic">{m.answerEmpty}</p>
                    )}
                  </div>
                  <div className="flex gap-3">
                    <button
                      type="button"
                      onClick={() => {
                        setEditingId(e.id);
                        setShowNew(false);
                      }}
                      className="text-xs font-medium text-sky-600 hover:text-sky-700"
                    >
                      {m.edit}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDelete(e.id)}
                      className="text-xs font-medium text-slate-400 hover:text-red-600"
                    >
                      {m.delete}
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })}

        {filtered.length === 0 && (
          <div className="text-center text-sm text-slate-400 py-12">
            {entries.length === 0 ? m.empty : m.emptyFiltered}
          </div>
        )}
      </div>

      <p className="text-xs text-slate-400">{m.tip}</p>
    </div>
  );
}

function CategoryChip({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full px-3 py-1 text-xs font-medium border transition ${
        active
          ? "bg-slate-900 text-white border-slate-900"
          : "bg-white text-slate-600 border-slate-200 hover:border-slate-300"
      }`}
    >
      {label}
    </button>
  );
}

function FaqForm({
  m,
  categories,
  entry,
  defaultCategory,
  onSubmit,
  onCancel,
}: {
  m: FaqMessages;
  categories: { value: string; label: string }[];
  entry?: FaqEntryView;
  defaultCategory?: string;
  onSubmit: (formData: FormData) => void;
  onCancel: () => void;
}) {
  const [answer, setAnswer] = useState(entry?.answer ?? "");
  const [showPreview, setShowPreview] = useState(false);

  return (
    <form action={onSubmit} className="rounded-xl border border-slate-200 bg-white shadow-sm p-5 space-y-3">
      {entry && <input type="hidden" name="id" value={entry.id} />}
      <div className="grid grid-cols-1 sm:grid-cols-[160px_1fr] gap-3">
        <div>
          <label className="block text-[11px] font-semibold uppercase tracking-wide text-slate-400 mb-1">
            {m.categoryLabel}
          </label>
          <select
            name="category"
            defaultValue={entry?.category ?? defaultCategory ?? categories[0]?.value}
            className={inputCls}
          >
            {categories.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-[11px] font-semibold uppercase tracking-wide text-slate-400 mb-1">
            {m.questionLabel}
          </label>
          <input
            name="question"
            required
            defaultValue={entry?.question ?? ""}
            placeholder={m.questionPlaceholder}
            className={inputCls}
          />
        </div>
      </div>

      <div>
        <div className="flex items-center justify-between mb-1">
          <label className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
            {m.answerLabel}
          </label>
          <button
            type="button"
            onClick={() => setShowPreview((v) => !v)}
            className="text-xs text-slate-400 hover:text-slate-600"
          >
            {showPreview ? m.edit : m.preview}
          </button>
        </div>
        {showPreview ? (
          <MarkdownPreview content={answer} />
        ) : (
          <textarea
            name="answer"
            rows={6}
            value={answer}
            onChange={(e) => setAnswer(e.target.value)}
            placeholder={m.answerPlaceholder}
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-mono leading-relaxed focus:outline-none focus:ring-2 focus:ring-slate-400"
          />
        )}
        {showPreview && <input type="hidden" name="answer" value={answer} />}
      </div>

      <div className="flex gap-2">
        <button className="rounded-lg bg-slate-900 text-white px-5 py-2 text-sm font-medium hover:bg-slate-800">
          {m.save}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-lg border border-slate-200 px-5 py-2 text-sm text-slate-600 hover:bg-slate-50"
        >
          {m.cancel}
        </button>
      </div>
    </form>
  );
}
