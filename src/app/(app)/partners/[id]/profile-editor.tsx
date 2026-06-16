"use client";

import { useState } from "react";
import type { Partner, User } from "@prisma/client";
import { updatePartnerAction } from "@/lib/actions";
import { CATEGORY_LABELS, INDUSTRY_LABELS } from "@/lib/constants";
import { PARTNER_ARCHETYPE_LABELS, VALUE_PATTERN_LABELS } from "@/lib/partner-framework";

const input = "w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500";

export function ProfileEditor({ partner: p, users }: { partner: Partner; users: User[] }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button onClick={() => setOpen(true)} className="text-xs text-indigo-600 hover:underline">
        编辑画像
      </button>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4" onClick={() => setOpen(false)}>
          <div
            className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl p-6 max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-base font-semibold mb-4">编辑伙伴画像 — {p.name}</h3>
            <form
              action={async (fd) => {
                await updatePartnerAction(p.id, fd);
                setOpen(false);
              }}
              className="grid grid-cols-2 md:grid-cols-3 gap-3 text-sm"
            >
              <label className="space-y-1">
                <span className="text-xs text-zinc-500">公司全称</span>
                <input name="name" defaultValue={p.name} className={input} />
              </label>
              <label className="space-y-1">
                <span className="text-xs text-zinc-500">Tier 分级</span>
                <select name="tier" defaultValue={p.tier ?? ""} className={input}>
                  <option value="">未分级</option>
                  <option value="A">A 立即打</option>
                  <option value="B">B 重点打</option>
                  <option value="C">C 后续跟进</option>
                </select>
              </label>
              <label className="space-y-1">
                <span className="text-xs text-zinc-500">伙伴类型</span>
                <select name="partnerArchetype" defaultValue={p.partnerArchetype ?? ""} className={input}>
                  <option value="">待判定</option>
                  {Object.entries(PARTNER_ARCHETYPE_LABELS).map(([k, v]) => (
                    <option key={k} value={k}>{v}</option>
                  ))}
                </select>
              </label>
              <label className="space-y-1">
                <span className="text-xs text-zinc-500">竞品基因</span>
                <select name="category" defaultValue={p.category} className={input}>
                  {Object.entries(CATEGORY_LABELS).map(([k, v]) => (
                    <option key={k} value={k}>{v}</option>
                  ))}
                </select>
              </label>
              <label className="space-y-1">
                <span className="text-xs text-zinc-500">主攻行业</span>
                <select name="industry" defaultValue={p.industry ?? ""} className={input}>
                  <option value="">待判定</option>
                  {Object.entries(INDUSTRY_LABELS).map(([k, v]) => (
                    <option key={k} value={k}>{v}</option>
                  ))}
                </select>
              </label>
              <label className="space-y-1">
                <span className="text-xs text-zinc-500">联合价值模式</span>
                <select name="valuePattern" defaultValue={p.valuePattern ?? ""} className={input}>
                  <option value="">待选定</option>
                  {Object.entries(VALUE_PATTERN_LABELS).map(([k, v]) => (
                    <option key={k} value={k}>{v}</option>
                  ))}
                </select>
              </label>
              <label className="space-y-1">
                <span className="text-xs text-zinc-500">专职人数（帆软/数据）</span>
                <input name="dedicatedHeadcount" defaultValue={p.dedicatedHeadcount ?? ""} placeholder="如 3 人全职" className={input} />
              </label>
              <label className="space-y-1 col-span-2 md:col-span-3">
                <span className="text-xs text-zinc-500">伙伴提供（价值三行）</span>
                <input name="valuePartnerOffer" defaultValue={p.valuePartnerOffer ?? ""} placeholder="如：Tableau 实施与客户关系" className={input} />
              </label>
              <label className="space-y-1 col-span-2 md:col-span-3">
                <span className="text-xs text-zinc-500">帆软提供</span>
                <input name="valueFanruanOffer" defaultValue={p.valueFanruanOffer ?? ""} placeholder="如：FineReport 复杂报表 + 驻场" className={input} />
              </label>
              <label className="space-y-1 col-span-2 md:col-span-3">
                <span className="text-xs text-zinc-500">客户得到</span>
                <input name="valueCustomerOutcome" defaultValue={p.valueCustomerOutcome ?? ""} placeholder="如：监管报表 + 自助分析双满足" className={input} />
              </label>
              <label className="space-y-1">
                <span className="text-xs text-zinc-500">城市</span>
                <input name="city" defaultValue={p.city ?? ""} className={input} />
              </label>
              <label className="space-y-1">
                <span className="text-xs text-zinc-500">国家</span>
                <input name="country" defaultValue={p.country ?? ""} className={input} />
              </label>
              <label className="space-y-1">
                <span className="text-xs text-zinc-500">公司规模</span>
                <input name="headcount" defaultValue={p.headcount ?? ""} className={input} />
              </label>
              <label className="space-y-1">
                <span className="text-xs text-zinc-500">官网</span>
                <input name="website" defaultValue={p.website ?? ""} className={input} />
              </label>
              <label className="space-y-1">
                <span className="text-xs text-zinc-500">公司类型</span>
                <input name="companyType" defaultValue={p.companyType ?? ""} placeholder="纯咨询/代理商/集成商…" className={input} />
              </label>
              <label className="space-y-1">
                <span className="text-xs text-zinc-500">认证级别</span>
                <input name="certLevel" defaultValue={p.certLevel ?? ""} className={input} />
              </label>
              <label className="space-y-1 col-span-2 md:col-span-3">
                <span className="text-xs text-zinc-500">核心业务</span>
                <input name="coreBusiness" defaultValue={p.coreBusiness ?? ""} className={input} />
              </label>
              <label className="space-y-1 col-span-2 md:col-span-3">
                <span className="text-xs text-zinc-500">核心能力</span>
                <input name="capability" defaultValue={p.capability ?? ""} className={input} />
              </label>
              <label className="space-y-1 col-span-2 md:col-span-3">
                <span className="text-xs text-zinc-500">已知客户</span>
                <input name="knownClients" defaultValue={p.knownClients ?? ""} className={input} />
              </label>
              <label className="space-y-1">
                <span className="text-xs text-zinc-500">现有BI工具</span>
                <input name="currentTools" defaultValue={p.currentTools ?? ""} className={input} />
              </label>
              <label className="space-y-1 col-span-2">
                <span className="text-xs text-zinc-500">关键差异化</span>
                <input name="keyDifferentiator" defaultValue={p.keyDifferentiator ?? ""} className={input} />
              </label>
              <label className="space-y-1 col-span-2 md:col-span-3">
                <span className="text-xs text-zinc-500">核心打法 / playbook</span>
                <textarea name="playbook" defaultValue={p.playbook ?? ""} rows={2} className={input} />
              </label>
              <label className="space-y-1 col-span-2 md:col-span-3">
                <span className="text-xs text-zinc-500">话术 pitch</span>
                <textarea name="pitch" defaultValue={p.pitch ?? ""} rows={2} className={input} />
              </label>
              <label className="space-y-1">
                <span className="text-xs text-zinc-500">最佳接触渠道</span>
                <input name="bestChannel" defaultValue={p.bestChannel ?? ""} className={input} />
              </label>
              <label className="space-y-1">
                <span className="text-xs text-zinc-500">契合度（1-10）</span>
                <input name="fitScore" type="number" min={1} max={10} defaultValue={p.fitScore ?? ""} className={input} />
              </label>
              <label className="space-y-1">
                <span className="text-xs text-zinc-500">优先级</span>
                <select name="priority" defaultValue={p.priority ?? ""} className={input}>
                  <option value="">未定</option>
                  <option value="P0">P0 立即</option>
                  <option value="P1">P1 重点</option>
                  <option value="P2">P2 跟进</option>
                  <option value="P3">P3 观察</option>
                </select>
              </label>
              <label className="space-y-1">
                <span className="text-xs text-zinc-500">负责BD</span>
                <select name="ownerId" defaultValue={p.ownerId ?? ""} className={input}>
                  <option value="">未指定</option>
                  {users.map((u) => (
                    <option key={u.id} value={u.id}>{u.name}</option>
                  ))}
                </select>
              </label>
              <label className="flex items-center gap-2 mt-5">
                <input type="checkbox" name="manualChecked" defaultChecked={p.manualChecked} className="rounded" />
                <span className="text-xs text-zinc-600">已人工核对</span>
              </label>
              <label className="space-y-1 col-span-2 md:col-span-3">
                <span className="text-xs text-zinc-500">备注</span>
                <textarea name="notes" defaultValue={p.notes ?? ""} rows={2} className={input} />
              </label>
              <div className="col-span-2 md:col-span-3 flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setOpen(false)} className="rounded-lg border border-zinc-200 px-4 py-2 text-sm text-zinc-600">
                  取消
                </button>
                <button className="rounded-lg bg-indigo-600 text-white px-4 py-2 text-sm hover:bg-indigo-700">保存</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
