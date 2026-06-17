"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import type { Partner } from "@prisma/client";
import { Badge, Card } from "@/components/ui";
import {
  CATEGORY_LABELS,
  INDUSTRY_LABELS,
} from "@/lib/constants";
import {
  PARTNER_ARCHETYPE_LABELS,
  VALUE_PATTERN_LABELS,
} from "@/lib/partner-framework";
import {
  savePartnerGtmAction,
  saveToGtmLibraryAction,
  searchGtmLibraryAction,
  type GtmLibraryRow,
  type SaveToLibraryMode,
} from "@/lib/gtm-library-actions";

const input =
  "w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500";

export function PartnerGtmPanel({
  partner,
  libraryItems,
}: {
  partner: Partner;
  libraryItems: GtmLibraryRow[];
}) {
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
    fd.set("industry", partner.industry ?? "");
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
      title="playbook · pitch"
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
            从库参考
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
            存入库
          </button>
          <button
            type="button"
            onClick={savePartner}
            disabled={pending}
            className="text-xs rounded-lg bg-indigo-600 px-3 py-1.5 text-white hover:bg-indigo-700 disabled:opacity-50"
          >
            {saved ? "已保存" : pending ? "保存中…" : "保存到伙伴"}
          </button>
        </div>
      }
    >
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <label className="block space-y-1.5">
          <span className="text-xs font-medium text-zinc-500">playbook · 怎么打</span>
          <textarea
            value={playbook}
            onChange={(e) => setPlaybook(e.target.value)}
            rows={10}
            placeholder="步骤、渠道、联合策略…"
            className={input}
          />
        </label>
        <label className="block space-y-1.5">
          <span className="text-xs font-medium text-zinc-500">pitch · 30 秒话术</span>
          <textarea
            value={pitch}
            onChange={(e) => setPitch(e.target.value)}
            rows={10}
            placeholder="对外一句话价值主张…"
            className={input}
          />
        </label>
      </div>

      {/* 从库参考 */}
      {refOpen && (
        <Modal title="从打法库参考" onClose={() => setRefOpen(false)}>
          <input
            value={refQ}
            onChange={(e) => setRefQ(e.target.value)}
            placeholder="搜索标题、内容、来源伙伴…"
            className={`${input} mb-3`}
            autoFocus
          />
          {refLoading ? (
            <p className="text-sm text-zinc-400 py-6 text-center">搜索中…</p>
          ) : refItems.length === 0 ? (
            <p className="text-sm text-zinc-400 py-6 text-center">库中暂无匹配条目，可先写好内容再「存入库」</p>
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
                        <span className="text-xs text-zinc-400">来自 {item.sourcePartnerName}</span>
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

      {/* 存入库 */}
      {libOpen && (
        <Modal title="存入打法库" onClose={() => setLibOpen(false)}>
          <div className="space-y-3 text-sm">
            <label className="block space-y-1">
              <span className="text-xs text-zinc-500">标题 *</span>
              <input value={libTitle} onChange={(e) => setLibTitle(e.target.value)} className={input} />
            </label>
            <fieldset className="space-y-2">
              <legend className="text-xs text-zinc-500 mb-1">保存方式</legend>
              {(
                [
                  ["new", "新建条目"],
                  ["replace", "替换已有条目（覆盖内容，版本号不变）"],
                  ["version", "保留新版本（同组追加 v+1）"],
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
                <span className="text-xs text-zinc-500">选择库中条目</span>
                <select
                  value={libTargetId}
                  onChange={(e) => setLibTargetId(e.target.value)}
                  className={input}
                >
                  <option value="">请选择…</option>
                  {libraryItems.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.title} (v{item.version})
                    </option>
                  ))}
                </select>
              </label>
            )}
            <label className="block space-y-1">
              <span className="text-xs text-zinc-500">备注（可选）</span>
              <input value={libNotes} onChange={(e) => setLibNotes(e.target.value)} className={input} />
            </label>
            <p className="text-xs text-zinc-400">
              档案标签自动带入当前伙伴：
              {partner.industry && ` ${INDUSTRY_LABELS[partner.industry] ?? partner.industry}`}
              {partner.valuePattern && ` · ${VALUE_PATTERN_LABELS[partner.valuePattern] ?? partner.valuePattern}`}
              {partner.partnerArchetype && ` · ${PARTNER_ARCHETYPE_LABELS[partner.partnerArchetype] ?? partner.partnerArchetype}`}
              {` · ${CATEGORY_LABELS[partner.category]}`}
            </p>
            {libError && <p className="text-xs text-red-600">{libError}</p>}
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" onClick={() => setLibOpen(false)} className="rounded-lg border border-zinc-200 px-4 py-2 text-sm text-zinc-600">
                取消
              </button>
              <button
                type="button"
                onClick={submitToLibrary}
                disabled={pending}
                className="rounded-lg bg-indigo-600 text-white px-4 py-2 text-sm hover:bg-indigo-700 disabled:opacity-50"
              >
                确认存入
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
