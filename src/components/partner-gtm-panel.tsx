"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import type { Partner } from "@prisma/client";
import { Badge, Card } from "@/components/ui";
import {
  labelFromMap,
  labelsFromMap,
  parseIndustries,
  type TaxonomyDimension,
} from "@/lib/taxonomy";
import {
  savePartnerGtmAction,
  saveToGtmLibraryAction,
  searchGtmLibraryAction,
  type GtmLibraryRow,
  type SaveToLibraryMode,
} from "@/lib/gtm-library-actions";
import { useMessages } from "@/lib/i18n/context";

const input =
  "w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500";

export function PartnerGtmPanel({
  partner,
  libraryItems,
  labelMaps,
}: {
  partner: Partner;
  libraryItems: GtmLibraryRow[];
  labelMaps: Record<TaxonomyDimension, Record<string, string>>;
}) {
  const { partnerDetail: pd, common, playbookLibrary: pl } = useMessages();
  const g = pd.gtmPanel;
  const [playbook, setPlaybook] = useState(partner.playbook ?? "");
  const [pitch, setPitch] = useState(partner.pitch ?? "");
  const [saved, setSaved] = useState(false);
  const [pending, startTransition] = useTransition();

  const [refOpen, setRefOpen] = useState(false);
  const [refQ, setRefQ] = useState("");
  const [refItems, setRefItems] = useState(libraryItems);
  const [refLoading, setRefLoading] = useState(false);

  const [libOpen, setLibOpen] = useState(false);
  const [libTitle, setLibTitle] = useState("");
  const [libMode, setLibMode] = useState<SaveToLibraryMode>("new");
  const [libTargetId, setLibTargetId] = useState("");
  const [libNotes, setLibNotes] = useState("");
  const [libError, setLibError] = useState("");

  useEffect(() => {
    setPlaybook(partner.playbook ?? "");
    setPitch(partner.pitch ?? "");
  }, [partner.playbook, partner.pitch]);

  const runRefSearch = useCallback(async (q: string) => {
    setRefLoading(true);
    try {
      const rows = await searchGtmLibraryAction(q);
      setRefItems(rows);
    } finally {
      setRefLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!refOpen) return;
    const t = setTimeout(() => runRefSearch(refQ), 250);
    return () => clearTimeout(t);
  }, [refOpen, refQ, runRefSearch]);

  function applyReference(item: GtmLibraryRow) {
    if (item.playbook) setPlaybook(item.playbook);
    if (item.pitch) setPitch(item.pitch);
    setRefOpen(false);
  }

  function savePartner() {
    startTransition(async () => {
      await savePartnerGtmAction(partner.id, playbook, pitch);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    });
  }

  function submitToLibrary() {
    setLibError("");
    const fd = new FormData();
    fd.set("title", libTitle);
    fd.set("playbook", playbook);
    fd.set("pitch", pitch);
    fd.set("mode", libMode);
    fd.set("targetId", libTargetId);
    fd.set("notes", libNotes);
    fd.set("industry", parseIndustries(partner)[0] ?? "");
    fd.set("industries", partner.industries ?? (partner.industry ? JSON.stringify([partner.industry]) : ""));
    fd.set("valuePattern", partner.valuePattern ?? "");
    fd.set("partnerArchetype", partner.partnerArchetype ?? "");
    fd.set("category", partner.category ?? "");

    startTransition(async () => {
      const res = await saveToGtmLibraryAction(partner.id, fd);
      if ("error" in res) {
        setLibError(res.error);
        return;
      }
      setLibOpen(false);
      setLibTitle("");
      setLibNotes("");
      setLibMode("new");
      setLibTargetId("");
      runRefSearch("");
    });
  }

  return (
    <Card
      title={g.title}
      actions={
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => {
              setRefOpen(true);
              setRefQ("");
              setRefItems(libraryItems);
            }}
            className="text-xs rounded-lg border border-zinc-200 px-3 py-1.5 text-zinc-600 hover:bg-zinc-50"
          >
            {g.browseLibrary}
          </button>
          <button
            type="button"
            onClick={() => {
              setLibOpen(true);
              setLibTitle(partner.name);
              setLibError("");
            }}
            className="text-xs rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-1.5 text-indigo-700 hover:bg-indigo-100"
          >
            {g.saveToLibrary}
          </button>
          <button
            type="button"
            onClick={savePartner}
            disabled={pending}
            className="text-xs rounded-lg bg-indigo-600 px-3 py-1.5 text-white hover:bg-indigo-700 disabled:opacity-50"
          >
            {saved ? g.saved : pending ? g.saving : g.saveToPartner}
          </button>
        </div>
      }
    >
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <label className="block space-y-1.5">
          <span className="text-xs font-medium text-zinc-500">{g.playbookHowToWin}</span>
          <textarea
            value={playbook}
            onChange={(e) => setPlaybook(e.target.value)}
            rows={10}
            placeholder={g.playbookPlaceholder}
            className={input}
          />
        </label>
        <label className="block space-y-1.5">
          <span className="text-xs font-medium text-zinc-500">{g.pitchScript}</span>
          <textarea
            value={pitch}
            onChange={(e) => setPitch(e.target.value)}
            rows={10}
            placeholder={g.pitchPlaceholder}
            className={input}
          />
        </label>
      </div>

      {/* Browse library */}
      {refOpen && (
        <Modal title={g.browseModalTitle} onClose={() => setRefOpen(false)}>
          <input
            value={refQ}
            onChange={(e) => setRefQ(e.target.value)}
            placeholder={pl.searchPlaceholder}
            className={`${input} mb-3`}
            autoFocus
          />
          {refLoading ? (
            <p className="text-sm text-zinc-400 py-6 text-center">{g.searching}</p>
          ) : refItems.length === 0 ? (
            <p className="text-sm text-zinc-400 py-6 text-center">{g.noMatches}</p>
          ) : (
            <ul className="max-h-80 overflow-y-auto space-y-2">
              {refItems.map((item) => (
                <li key={item.id}>
                  <button
                    type="button"
                    onClick={() => applyReference(item)}
                    className="w-full text-left rounded-lg border border-zinc-100 px-3 py-2.5 hover:border-indigo-200 hover:bg-indigo-50/50 transition-colors"
                  >
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-sm text-zinc-900">{item.title}</span>
                      <Badge tone="zinc">v{item.version}</Badge>
                      {item.sourcePartnerName && (
                        <span className="text-xs text-zinc-400">
                          {g.fromPartner.replace("{name}", item.sourcePartnerName)}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-zinc-500 mt-1 line-clamp-2">
                      {item.playbook?.slice(0, 120) || item.pitch?.slice(0, 120) || "—"}
                    </p>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Modal>
      )}

      {/* Save to library */}
      {libOpen && (
        <Modal title={g.saveModalTitle} onClose={() => setLibOpen(false)}>
          <div className="space-y-3 text-sm">
            <label className="block space-y-1">
              <span className="text-xs text-zinc-500">{g.titleLabel}</span>
              <input value={libTitle} onChange={(e) => setLibTitle(e.target.value)} className={input} />
            </label>
            <fieldset className="space-y-2">
              <legend className="text-xs text-zinc-500 mb-1">{g.saveMode}</legend>
              {(
                [
                  ["new", g.modeNew],
                  ["replace", g.modeReplace],
                  ["version", g.modeVersion],
                ] as const
              ).map(([v, label]) => (
                <label key={v} className="flex items-start gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="libMode"
                    checked={libMode === v}
                    onChange={() => setLibMode(v)}
                    className="mt-1"
                  />
                  <span className="text-zinc-700">{label}</span>
                </label>
              ))}
            </fieldset>
            {(libMode === "replace" || libMode === "version") && (
              <label className="block space-y-1">
                <span className="text-xs text-zinc-500">{g.selectEntry}</span>
                <select
                  value={libTargetId}
                  onChange={(e) => setLibTargetId(e.target.value)}
                  className={input}
                >
                  <option value="">{g.selectPlaceholder}</option>
                  {libraryItems.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.title} (v{item.version})
                    </option>
                  ))}
                </select>
              </label>
            )}
            <label className="block space-y-1">
              <span className="text-xs text-zinc-500">{g.notesOptional}</span>
              <input value={libNotes} onChange={(e) => setLibNotes(e.target.value)} className={input} />
            </label>
            <p className="text-xs text-zinc-400">
              {g.profileTagsHint}
              {parseIndustries(partner).length > 0 &&
                ` ${labelsFromMap(labelMaps.INDUSTRY, parseIndustries(partner))}`}
              {partner.valuePattern && ` · ${labelFromMap(labelMaps.VALUE_PATTERN, partner.valuePattern)}`}
              {partner.partnerArchetype && ` · ${labelFromMap(labelMaps.ARCHETYPE, partner.partnerArchetype)}`}
              {` · ${labelFromMap(labelMaps.CATEGORY, partner.category)}`}
            </p>
            {libError && <p className="text-xs text-red-600">{libError}</p>}
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" onClick={() => setLibOpen(false)} className="rounded-lg border border-zinc-200 px-4 py-2 text-sm text-zinc-600">
                {common.cancel}
              </button>
              <button
                type="button"
                onClick={submitToLibrary}
                disabled={pending}
                className="rounded-lg bg-indigo-600 text-white px-4 py-2 text-sm hover:bg-indigo-700 disabled:opacity-50"
              >
                {g.confirmSave}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </Card>
  );
}

function Modal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4" onClick={onClose}>
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-lg p-5 max-h-[85vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-base font-semibold">{title}</h3>
          <button type="button" onClick={onClose} className="text-zinc-400 hover:text-zinc-600 text-lg leading-none">
            ×
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
