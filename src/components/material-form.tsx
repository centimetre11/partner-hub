"use client";

import { useState } from "react";
import { useMessages } from "@/lib/i18n/context";
import { MaterialLinkField, type ParsedLink } from "./material-link-field";

type CategoryOption = { key: string; label: string };

export function MaterialForm({
  action,
  categories,
  defaults,
}: {
  action: (formData: FormData) => void | Promise<void>;
  categories: CategoryOption[];
  defaults?: {
    id?: string;
    title?: string;
    description?: string;
    category?: string;
    shared?: boolean;
    link?: ParsedLink | null;
  };
}) {
  const m = useMessages();
  const [title, setTitle] = useState(defaults?.title ?? "");
  const [description, setDescription] = useState(defaults?.description ?? "");
  const input = "w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500";

  function handleParsed(link: ParsedLink) {
    if (link.title) setTitle(link.title);
    if (link.description) setDescription(link.description);
  }

  return (
    <form action={action} className="px-8 max-w-4xl space-y-4">
      {defaults?.id && <input type="hidden" name="id" value={defaults.id} />}
      <div className="bg-white rounded-xl border p-5 space-y-4">
        <MaterialLinkField initial={defaults?.link} onParsed={handleParsed} />
        <input
          name="title"
          required
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder={m.materials.titlePlaceholder}
          className={input}
        />
        <textarea
          name="description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder={m.materials.descPlaceholder}
          rows={3}
          className={input}
        />
        <select name="category" defaultValue={defaults?.category ?? "OTHER"} className={input}>
          {categories.map(({ key, label }) => (
            <option key={key} value={key}>{label}</option>
          ))}
        </select>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="shared" defaultChecked={defaults?.shared ?? true} className="rounded" />
          {m.common.teamShared}
        </label>
      </div>
      <button className="rounded-lg bg-indigo-600 text-white px-6 py-2.5 text-sm">{m.common.save}</button>
    </form>
  );
}
