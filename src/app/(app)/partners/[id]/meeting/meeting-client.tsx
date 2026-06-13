"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { ExtractionProposal } from "@/lib/proposals";
import { ProposalView } from "@/components/proposal-view";
import { CONTACT_ROLE_CODES, CONTACT_ROLE_LABELS, attitudeLabel, stageName } from "@/lib/constants";
import { attitudeDotClass } from "@/components/power-map";

type MeetingPartner = {
  id: string;
  name: string;
  pipelineStage: number;
  contacts: { id: string; name: string; role: string; title: string | null; department: string | null; attitude: number }[];
  opportunities: { id: string; name: string; client: string | null; amount: string | null; stage: string }[];
};

// 会议模式：左边速记，右边权力地图/商机实时刷新（基于 AI 解析提案）
export function MeetingClient({ partner }: { partner: MeetingPartner }) {
  const router = useRouter();
  const [notes, setNotes] = useState("");
  const [proposal, setProposal] = useState<ExtractionProposal | null>(null);
  const [parsing, setParsing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [finishing, setFinishing] = useState(false);
  const [startedAt] = useState(() => new Date());
  const lastParsedRef = useRef("");

  async function parse() {
    if (!notes.trim() || notes === lastParsedRef.current) return;
    setParsing(true);
    setError(null);
    try {
      const res = await fetch("/api/ai/extract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: notes, partnerId: partner.id, sourceType: "会议速记" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "解析失败");
      setProposal(data.proposal);
      lastParsedRef.current = notes;
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setParsing(false);
    }
  }

  async function archive(filtered: ExtractionProposal) {
    const res = await fetch("/api/ai/apply", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        partnerId: partner.id,
        proposal: {
          ...filtered,
          summaryTitle: filtered.summaryTitle || `会议纪要（${startedAt.toLocaleDateString("zh-CN")}）`,
        },
        eventType: "MEETING",
        sourceText: notes,
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error ?? "归档失败");
      return;
    }
    router.push(`/partners/${partner.id}`);
    router.refresh();
  }

  // 提案中的人物变化叠加到权力地图上
  const proposedByName = new Map(proposal?.contacts.map((c) => [c.name, c]) ?? []);
  const existingNames = new Set(partner.contacts.map((c) => c.name));
  const newPeople = (proposal?.contacts ?? []).filter((c) => !existingNames.has(c.name));
  const proposedOppNames = new Set(partner.opportunities.map((o) => o.name));
  const newOpps = (proposal?.opportunities ?? []).filter((o) => !proposedOppNames.has(o.name));

  return (
    <div className="min-h-screen flex flex-col">
      {/* 顶栏 */}
      <div className="px-8 py-4 bg-emerald-700 text-white flex items-center justify-between sticky top-0 z-20">
        <div className="flex items-center gap-3">
          <span className="relative flex h-2.5 w-2.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-300 opacity-75" />
            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-200" />
          </span>
          <div>
            <div className="text-sm font-semibold">会议模式 — {partner.name}</div>
            <div className="text-xs text-emerald-200">
              {startedAt.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })} 开始 · 当前阶段：{stageName(partner.pipelineStage)}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={parse}
            disabled={parsing || !notes.trim()}
            className="rounded-lg bg-white/15 hover:bg-white/25 px-4 py-2 text-sm font-medium disabled:opacity-40"
          >
            {parsing ? "AI 解析中…" : "⟳ 解析速记，刷新右侧"}
          </button>
          <button
            onClick={() => {
              if (!proposal && notes.trim()) parse().then(() => setFinishing(true));
              else setFinishing(true);
            }}
            disabled={!notes.trim()}
            className="rounded-lg bg-white text-emerald-700 px-4 py-2 text-sm font-semibold hover:bg-emerald-50 disabled:opacity-40"
          >
            结束并归档
          </button>
          <Link href={`/partners/${partner.id}`} className="text-emerald-200 text-sm hover:text-white px-2">
            退出
          </Link>
        </div>
      </div>

      <div className="flex-1 grid grid-cols-1 lg:grid-cols-2 gap-0">
        {/* 左：速记 */}
        <div className="p-6 border-r border-zinc-200 bg-white flex flex-col">
          <div className="text-xs text-zinc-400 mb-2">
            会议速记区 — 随手打要点或粘贴实时转写文本，点上方「解析速记」让 AI 刷新权力地图
          </div>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder={`例如：\n\n参加人：Mosaab（CEO）、Khalid（新CTO，之前在STC，对国产软件有顾虑）\nMosaab 说 Purity IT 项目预算确认了，大概 $25K，希望7月启动\n他们答应下周二来看 FineReport Demo\n我们承诺周五前发 Arabic RTL 的案例材料\nKhalid 提到他们也在评估 Qlik，价格是关键`}
            className="flex-1 min-h-[480px] w-full rounded-xl border border-zinc-200 px-4 py-3.5 text-sm leading-relaxed focus:outline-none focus:ring-2 focus:ring-emerald-500 resize-none"
          />
          {error && <p className="text-sm text-red-600 mt-2">{error}</p>}
        </div>

        {/* 右：实时画像 */}
        <div className="p-6 bg-zinc-50 space-y-5 overflow-y-auto">
          {/* 权力地图 */}
          <div>
            <h3 className="text-sm font-semibold text-zinc-700 mb-3">
              权力地图 {proposal && <span className="text-xs font-normal text-emerald-600">（AI 已刷新，黄色为本次会议新信息）</span>}
            </h3>
            <div className="space-y-2">
              {partner.contacts.map((c) => {
                const upd = proposedByName.get(c.name);
                return (
                  <div
                    key={c.id}
                    className={`rounded-lg border px-4 py-3 bg-white ${upd ? "border-amber-300 bg-amber-50/70 shadow-sm" : "border-zinc-200"}`}
                  >
                    <div className="flex items-center gap-2 text-sm flex-wrap">
                      <span
                        className={`w-5 h-5 rounded-full text-[10px] font-bold flex items-center justify-center shrink-0 ${attitudeDotClass(upd?.attitude ?? c.attitude)}`}
                        title={attitudeLabel(upd?.attitude ?? c.attitude)}
                      >
                        {upd?.attitude ?? c.attitude}
                      </span>
                      <span className="font-medium">{c.name}</span>
                      <span className="text-xs text-zinc-500">
                        {(upd?.title ?? c.title) || ""}
                        {(upd?.department ?? c.department) && ` · ${upd?.department ?? c.department}`}
                        {" · "}
                        {CONTACT_ROLE_CODES[upd?.role ?? c.role] ?? "I"}·{CONTACT_ROLE_LABELS[upd?.role ?? c.role] ?? "影响者"}
                      </span>
                      <span className="text-xs text-zinc-400">{attitudeLabel(upd?.attitude ?? c.attitude)}</span>
                      {upd && <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-200 text-amber-800">有更新</span>}
                    </div>
                    {upd?.reason && <div className="text-xs text-amber-700 mt-1">{upd.reason}</div>}
                  </div>
                );
              })}
              {newPeople.map((c, i) => (
                <div key={`new-${i}`} className="rounded-lg border border-emerald-300 bg-emerald-50/70 px-4 py-3 shadow-sm">
                  <div className="flex items-center gap-2 text-sm flex-wrap">
                    {typeof c.attitude === "number" && (
                      <span className={`w-5 h-5 rounded-full text-[10px] font-bold flex items-center justify-center shrink-0 ${attitudeDotClass(c.attitude)}`}>
                        {c.attitude}
                      </span>
                    )}
                    <span className="font-medium">{c.name}</span>
                    <span className="text-xs text-zinc-600">
                      {[c.title, c.department, CONTACT_ROLE_LABELS[c.role ?? "INFLUENCER"] ?? "影响者"].filter(Boolean).join(" · ")}
                    </span>
                    {c.reportsToName && <span className="text-xs text-zinc-500">汇报给 {c.reportsToName}</span>}
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-200 text-emerald-800">新人物</span>
                  </div>
                  {c.reason && <div className="text-xs text-emerald-700 mt-1">{c.reason}</div>}
                </div>
              ))}
              {partner.contacts.length === 0 && newPeople.length === 0 && (
                <p className="text-sm text-zinc-400">暂无人物。会议中提到的人会自动出现在这里。</p>
              )}
            </div>
          </div>

          {/* 商机 */}
          <div>
            <h3 className="text-sm font-semibold text-zinc-700 mb-3">商机</h3>
            <div className="space-y-2">
              {partner.opportunities.map((o) => {
                const upd = proposal?.opportunities.find((x) => x.name === o.name || x.id === o.id);
                return (
                  <div key={o.id} className={`rounded-lg border px-4 py-3 bg-white text-sm ${upd ? "border-amber-300 bg-amber-50/70" : "border-zinc-200"}`}>
                    <span className="font-medium">{o.name}</span>
                    <span className="text-xs text-zinc-500 ml-2">
                      {upd?.client ?? o.client ?? "—"} · {upd?.amount ?? o.amount ?? "金额未知"} · {upd?.stage ?? o.stage}
                    </span>
                    {upd && <span className="text-[10px] ml-2 px-1.5 py-0.5 rounded bg-amber-200 text-amber-800">有更新</span>}
                  </div>
                );
              })}
              {newOpps.map((o, i) => (
                <div key={`no-${i}`} className="rounded-lg border border-sky-300 bg-sky-50/70 px-4 py-3 text-sm">
                  <span className="font-medium">{o.name}</span>
                  <span className="text-xs text-zinc-600 ml-2">
                    {[o.client, o.amount, o.stage].filter(Boolean).join(" · ")}
                  </span>
                  <span className="text-[10px] ml-2 px-1.5 py-0.5 rounded bg-sky-200 text-sky-800">新商机</span>
                </div>
              ))}
              {partner.opportunities.length === 0 && newOpps.length === 0 && (
                <p className="text-sm text-zinc-400">暂无商机</p>
              )}
            </div>
          </div>

          {/* 待办草稿 + 信号 */}
          {proposal && (
            <>
              {proposal.todos.length > 0 && (
                <div>
                  <h3 className="text-sm font-semibold text-zinc-700 mb-3">会上承诺 → 待办草稿</h3>
                  <div className="space-y-2">
                    {proposal.todos.map((t, i) => (
                      <div key={i} className="rounded-lg border border-purple-200 bg-purple-50/70 px-4 py-2.5 text-sm">
                        ☐ {t.title}
                        {t.dueDate && <span className="text-xs text-purple-600 ml-2">截止 {t.dueDate}</span>}
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {proposal.signals.length > 0 && (
                <div>
                  <h3 className="text-sm font-semibold text-zinc-700 mb-3">信号</h3>
                  <div className="flex flex-wrap gap-2">
                    {proposal.signals.map((s, i) => (
                      <span key={i} className="text-xs px-2.5 py-1 rounded-lg bg-amber-100 text-amber-800">⚡ {s}</span>
                    ))}
                  </div>
                </div>
              )}
              {proposal.summary && (
                <div className="rounded-lg bg-white border border-zinc-200 p-4 text-sm text-zinc-600 leading-relaxed">
                  <div className="text-xs font-semibold text-zinc-400 mb-1">AI 实时纪要</div>
                  {proposal.summary}
                </div>
              )}
            </>
          )}
          {!proposal && (
            <div className="text-center text-sm text-zinc-300 py-10">
              记录速记后点「解析速记」，AI 会在这里实时刷新人物、商机和承诺事项
            </div>
          )}
        </div>
      </div>

      {/* 归档确认 */}
      {finishing && proposal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setFinishing(false)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl p-6 max-h-[85vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-base font-semibold mb-1">结束会议 — 确认变更入库</h3>
            <p className="text-xs text-zinc-400 mb-4">会议纪要将存入时间线，以下变更逐项确认后写入档案。</p>
            <ProposalView proposal={proposal} onConfirm={archive} onCancel={() => setFinishing(false)} confirmLabel="确认并归档会议" />
          </div>
        </div>
      )}
    </div>
  );
}
