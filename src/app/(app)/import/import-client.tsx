"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ProposalView } from "@/components/proposal-view";
import type { ExtractionProposal } from "@/lib/proposals";

type PartnerOption = { id: string; name: string; status: string };

const SOURCE_TYPES = ["聊天记录", "会议速记", "邮件", "新闻报道", "LinkedIn页面", "其他"];

export function ImportClient({
  partners,
  defaultPartnerId,
}: {
  partners: PartnerOption[];
  defaultPartnerId?: string;
}) {
  const router = useRouter();
  const [text, setText] = useState("");
  const [partnerId, setPartnerId] = useState(defaultPartnerId ?? "");
  const [sourceType, setSourceType] = useState("聊天记录");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [needPartner, setNeedPartner] = useState(false);
  const [proposal, setProposal] = useState<ExtractionProposal | null>(null);
  const [guessName, setGuessName] = useState<string | null>(null);
  const [done, setDone] = useState<string[] | null>(null);

  async function extract() {
    setLoading(true);
    setError(null);
    setDone(null);
    setNeedPartner(false);
    try {
      const res = await fetch("/api/ai/extract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, partnerId: partnerId || undefined, sourceType }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (data.needPartner) setNeedPartner(true);
        throw new Error(data.error ?? "解析失败");
      }
      setProposal(data.proposal);
      if (data.guess?.partnerName) setGuessName(data.guess.partnerName);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  async function apply(filtered: ExtractionProposal) {
    const res = await fetch("/api/ai/apply", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        partnerId: proposal!.partnerId,
        proposal: filtered,
        eventType: sourceType === "新闻报道" ? "NEWS" : sourceType === "会议速记" ? "MEETING" : "CHAT_IMPORT",
        sourceText: text,
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error ?? "写入失败");
      return;
    }
    setDone(data.applied);
    setProposal(null);
    setText("");
    router.refresh();
  }

  const targetPartner = partners.find((p) => p.id === (proposal?.partnerId ?? partnerId));

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
      {/* 左：输入 */}
      <div className="bg-white rounded-xl border border-zinc-200/80 shadow-sm p-5 space-y-3">
        <div className="flex gap-2">
          <select
            value={partnerId}
            onChange={(e) => setPartnerId(e.target.value)}
            className={`flex-1 rounded-lg border px-3 py-2 text-sm ${needPartner ? "border-red-400 ring-2 ring-red-100" : "border-zinc-200"}`}
          >
            <option value="">让 AI 自动判断归属伙伴</option>
            {partners.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}（{p.status === "ACTIVE" ? "正式" : "候选"}）
              </option>
            ))}
          </select>
          <select
            value={sourceType}
            onChange={(e) => setSourceType(e.target.value)}
            className="rounded-lg border border-zinc-200 px-3 py-2 text-sm"
          >
            {SOURCE_TYPES.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </div>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={16}
          placeholder={`粘贴原始文本，例如：\n\n[6/10, 14:32] Mosaab: We discussed with our CTO Khalid about the FineReport demo...\n[6/10, 14:35] 我: 我们可以下周安排 POC...\n\nAI 会自动提取：联系人变化、商机进展、承诺事项、态度信号。`}
          className="w-full rounded-lg border border-zinc-200 px-3.5 py-3 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500"
        />
        <button
          onClick={extract}
          disabled={loading || !text.trim()}
          className="w-full rounded-lg bg-indigo-600 text-white py-2.5 text-sm font-medium hover:bg-indigo-700 disabled:opacity-50"
        >
          {loading ? "AI 解析中…" : "✦ AI 解析"}
        </button>
        {error && <p className="text-sm text-red-600">{error}</p>}
      </div>

      {/* 右：提案 */}
      <div className="bg-white rounded-xl border border-zinc-200/80 shadow-sm p-5">
        {done ? (
          <div>
            <div className="text-sm font-semibold text-emerald-700 mb-3">✓ 已写入系统</div>
            <ul className="text-sm text-zinc-600 space-y-1.5">
              {done.map((d, i) => (
                <li key={i}>· {d}</li>
              ))}
            </ul>
            {targetPartner && (
              <Link href={`/partners/${targetPartner.id}`} className="inline-block mt-4 text-sm text-indigo-600 hover:underline">
                查看 {targetPartner.name} 档案 →
              </Link>
            )}
          </div>
        ) : proposal ? (
          <div>
            <div className="text-sm text-zinc-500 mb-3">
              归属伙伴：
              <span className="font-semibold text-zinc-900">{targetPartner?.name ?? guessName ?? "未知"}</span>
              {!partnerId && guessName && <span className="text-xs text-zinc-400 ml-1.5">（AI 判断）</span>}
            </div>
            <ProposalView proposal={proposal} onConfirm={apply} onCancel={() => setProposal(null)} />
          </div>
        ) : (
          <div className="h-full flex items-center justify-center text-sm text-zinc-300 min-h-[300px]">
            解析结果会显示在这里，逐项确认后入库
          </div>
        )}
      </div>
    </div>
  );
}
