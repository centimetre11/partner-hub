"use client";

import { useState } from "react";
import { createPartnerAction } from "@/lib/actions";
import { CATEGORY_LABELS } from "@/lib/constants";

export function AddPartnerForm() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="rounded-lg bg-indigo-600 text-white px-4 py-2 text-sm font-medium hover:bg-indigo-700"
      >
        + 添加候选
      </button>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4" onClick={() => setOpen(false)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-base font-semibold mb-4">添加候选伙伴</h3>
            <form action={createPartnerAction} className="space-y-3">
              <input name="name" required placeholder="公司名称 *" className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm" />
              <select name="category" className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm">
                {Object.entries(CATEGORY_LABELS).map(([k, v]) => (
                  <option key={k} value={k}>{v}</option>
                ))}
              </select>
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
            <p className="text-xs text-zinc-400 mt-3">提示：也可以在「AI 信息投喂」里粘贴公司介绍，让 AI 自动建档。</p>
          </div>
        </div>
      )}
    </>
  );
}
