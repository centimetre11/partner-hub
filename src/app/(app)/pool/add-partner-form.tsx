"use client";

import { useState } from "react";
import Link from "next/link";
import { createPartnerAction } from "@/lib/actions";
import { TaxonomyMultiField, TaxonomySelectField } from "@/components/taxonomy-fields";
import type { TaxonomyOptionRow } from "@/lib/taxonomy";
import { AiIntakePanel } from "@/components/ai-intake-panel";

export function AddPartnerForm({
  intent = "prospect",
  taxonomy,
}: {
  intent?: "prospect" | "active";
  taxonomy?: { CATEGORY: TaxonomyOptionRow[]; INDUSTRY: TaxonomyOptionRow[] };
}) {
  const [open, setOpen] = useState(false);
  const [aiOpen, setAiOpen] = useState(false);
  const isActive = intent === "active";

  return (
    <>
      <div className="flex gap-2">
        <button
          onClick={() => setAiOpen(true)}
          className="rounded-lg bg-gradient-to-r from-indigo-600 to-purple-600 text-white px-4 py-2 text-sm font-medium hover:opacity-90"
        >
          ✦ AI 建档
        </button>
        <button
          onClick={() => setOpen(true)}
          className="rounded-lg border border-zinc-200 bg-white text-zinc-700 px-4 py-2 text-sm font-medium hover:bg-zinc-50"
        >
          + 手动添加
        </button>
      </div>

      {aiOpen && (
        <AiIntakePanel scope="new_partner" intent={intent} onClose={() => setAiOpen(false)} onDone={(id) => (window.location.href = `/partners/${id}`)} />
      )}

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4" onClick={() => setOpen(false)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-base font-semibold mb-4">{isActive ? "添加正式伙伴" : "添加候选伙伴"}</h3>
            <form action={createPartnerAction} className="space-y-3">
              <input type="hidden" name="intent" value={intent} />
              <input name="name" required placeholder="公司名称 *" className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm" />
              {taxonomy ? (
                <>
                  <TaxonomySelectField dimension="CATEGORY" name="category" value="OTHER" options={taxonomy.CATEGORY} />
                  <TaxonomyMultiField dimension="INDUSTRY" name="industries" selected={[]} options={taxonomy.INDUSTRY} />
                </>
              ) : (
                <p className="text-xs text-zinc-400">
                  分类选项请刷新页面加载，或到<Link href="/taxonomy" className="text-indigo-600 hover:underline">维度库</Link>管理
                </p>
              )}
              <div className="flex gap-2">
                <input name="city" placeholder="城市" className="flex-1 rounded-lg border border-zinc-200 px-3 py-2 text-sm" />
                <input name="country" placeholder="国家" className="flex-1 rounded-lg border border-zinc-200 px-3 py-2 text-sm" />
              </div>
              <input name="coreBusiness" placeholder="核心业务（一句话）" className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm" />
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setOpen(false)} className="rounded-lg border border-zinc-200 px-4 py-2 text-sm text-zinc-600">
                  取消
                </button>
                <button className="rounded-lg bg-indigo-600 text-white px-4 py-2 text-sm hover:bg-indigo-700">添加</button>
              </div>
            </form>
            <p className="text-xs text-zinc-400 mt-3">
              {isActive
                ? "将直接建为正式伙伴并生成起步待办。不想填表？点上方「✦ AI 建档」即可。"
                : "不想填表？点上方「✦ AI 建档」，把会议记录或公司介绍丢给 AI 即可。"}
            </p>
          </div>
        </div>
      )}
    </>
  );
}
