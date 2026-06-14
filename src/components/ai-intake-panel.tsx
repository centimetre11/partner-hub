"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CONTACT_ROLE_LABELS, attitudeLabel } from "@/lib/constants";
import type { IntakeProposal, IntakeScope } from "@/lib/ai-intake";

type Msg = { role: "user" | "assistant"; content: string };

const SCOPE_META: Record<IntakeScope, { title: string; placeholder: string }> = {
  new_partner: {
    title: "AI 建档",
    placeholder:
      "扔公司名、会议记录、聊天记录、KMS 链接都行——我会读 KMS，也会联网/领英查公开信息，多源叠加尽量填完整。\n例如：\n• 刚见了迪拜 Acme Analytics，做 Power BI 实施\n• https://kms.fineres.com/pages/viewpage.action?pageId=123456\n• 就一家叫 TechMantra 的公司，帮我建档",
  },
  powermap: {
    title: "AI 加人物",
    placeholder: "描述要加的人，或粘贴名片/会议记录。\n例如：他们的 CTO 叫 Khalid，之前在 STC，对国产软件有点顾虑，汇报给 CEO Mosaab。",
  },
  opportunity: {
    title: "AI 加商机",
    placeholder: "描述商机或粘贴相关沟通。\n例如：Purity IT 项目预算 $25K，7 月启动，现在在做需求诊断。",
  },
  profile: {
    title: "AI 补全画像",
    placeholder:
      "描述这家公司的情况，或粘贴 KMS 链接/会议记录，我会结合现有档案和联网调研补全字段。\n例如：他们是微软金牌伙伴，主做 Power BI，客户有 DAMAC，差异化是 UAE+沙特双实体。",
  },
  training: {
    title: "AI 加培训",
    placeholder: "描述要安排的培训/认证。\n例如：让他们两个工程师 8 月底前考下 FCA-FineBI 认证。",
  },
  todo: {
    title: "AI 加待办",
    placeholder: "说要跟进的事。\n例如：周五前给 Beinex 发 Arabic RTL 案例材料，下周二安排 Demo。",
  },
  solution: {
    title: "AI 加联合方案",
    placeholder: "描述这个联合方案。\n例如：针对零售客户，帆软出 FineReport 报表层，伙伴出数据集成和实施，按项目分成。",
  },
};

function Pill({ children, tone }: { children: React.ReactNode; tone: string }) {
  return <span className={`inline-block text-[11px] px-1.5 py-0.5 rounded ${tone}`}>{children}</span>;
}

function ProposalPreview({ p }: { p: IntakeProposal }) {
  const empty =
    !p.partnerName &&
    !p.fields.length &&
    !p.contacts.length &&
    !p.opportunities.length &&
    !p.todos.length &&
    !p.trainings.length &&
    !p.solutions.length;
  if (empty) return <p className="text-xs text-zinc-400">还没有可入库的内容，继续补充信息吧。</p>;

  return (
    <div className="space-y-1.5 text-sm">
      {p.partnerName && (
        <div className="border-l-4 border-l-indigo-400 bg-zinc-50 rounded px-2.5 py-1.5">
          <Pill tone="bg-indigo-100 text-indigo-700">新建伙伴</Pill> <span className="font-medium">{p.partnerName}</span>
        </div>
      )}
      {p.fields.map((f, i) => (
        <div key={`f${i}`} className="border-l-4 border-l-amber-400 bg-zinc-50 rounded px-2.5 py-1.5">
          <span className="font-medium text-zinc-800">{f.label}</span>
          {f.oldValue ? <span className="text-zinc-400 line-through mx-1">{f.oldValue}</span> : null}
          <span className="text-emerald-700">→ {f.newValue}</span>
        </div>
      ))}
      {p.contacts.map((c, i) => (
        <div key={`c${i}`} className="border-l-4 border-l-emerald-400 bg-zinc-50 rounded px-2.5 py-1.5">
          <Pill tone="bg-emerald-100 text-emerald-700">{c.action === "update" ? "更新人物" : "人物"}</Pill>{" "}
          <span className="font-medium">{c.name}</span>
          <span className="text-zinc-500 text-xs ml-1">
            {[
              c.title,
              c.department,
              c.role && (CONTACT_ROLE_LABELS[c.role] ?? c.role),
              typeof c.attitude === "number" && `态度:${attitudeLabel(c.attitude)}`,
              c.reportsToName && `汇报给:${c.reportsToName}`,
            ]
              .filter(Boolean)
              .join(" · ")}
          </span>
        </div>
      ))}
      {p.opportunities.map((o, i) => (
        <div key={`o${i}`} className="border-l-4 border-l-sky-400 bg-zinc-50 rounded px-2.5 py-1.5">
          <Pill tone="bg-sky-100 text-sky-700">{o.action === "update" ? "更新商机" : "商机"}</Pill>{" "}
          <span className="font-medium">{o.name}</span>
          <span className="text-zinc-500 text-xs ml-1">
            {[o.client && `客户:${o.client}`, o.amount, o.stage, o.nextStep && `下一步:${o.nextStep}`].filter(Boolean).join(" · ")}
          </span>
        </div>
      ))}
      {p.trainings.map((t, i) => (
        <div key={`tr${i}`} className="border-l-4 border-l-orange-400 bg-zinc-50 rounded px-2.5 py-1.5">
          <Pill tone="bg-orange-100 text-orange-700">培训</Pill> <span className="font-medium">{t.person}</span>
          <span className="text-zinc-500 text-xs ml-1">{[t.targetCert, t.deadline].filter(Boolean).join(" · ")}</span>
        </div>
      ))}
      {p.solutions.map((s, i) => (
        <div key={`s${i}`} className="border-l-4 border-l-purple-400 bg-zinc-50 rounded px-2.5 py-1.5">
          <Pill tone="bg-purple-100 text-purple-700">联合方案</Pill> <span className="font-medium">{s.name}</span>
          <span className="text-zinc-500 text-xs ml-1">{s.targetCustomer}</span>
        </div>
      ))}
      {p.todos.map((t, i) => (
        <div key={`t${i}`} className="border-l-4 border-l-pink-400 bg-zinc-50 rounded px-2.5 py-1.5">
          <Pill tone="bg-pink-100 text-pink-700">待办</Pill> <span>{t.title}</span>
          {t.dueDate && <span className="text-zinc-400 text-xs ml-1">截止 {t.dueDate}</span>}
        </div>
      ))}
    </div>
  );
}

export function AiIntakePanel({
  scope,
  partnerId,
  onClose,
  onDone,
}: {
  scope: IntakeScope;
  partnerId?: string;
  onClose: () => void;
  onDone?: (partnerId: string) => void;
}) {
  const router = useRouter();
  const meta = SCOPE_META[scope];
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [applying, setApplying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [proposal, setProposal] = useState<IntakeProposal | null>(null);
  const [ready, setReady] = useState(false);
  const [questions, setQuestions] = useState<string[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, loading]);

  async function send() {
    const text = input.trim();
    if (!text || loading) return;
    const next = [...messages, { role: "user" as const, content: text }];
    setMessages(next);
    setInput("");
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/ai/intake", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scope, partnerId, messages: next }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "AI 处理失败");
      setMessages((m) => [...m, { role: "assistant", content: data.reply }]);
      setProposal(data.proposal);
      setReady(data.ready);
      setQuestions(data.questions ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  async function apply() {
    if (!proposal) return;
    setApplying(true);
    setError(null);
    try {
      const res = await fetch("/api/ai/intake/apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          scope,
          partnerId,
          proposal,
          sourceText: messages.filter((m) => m.role === "user").map((m) => m.content).join("\n"),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "写入失败");
      if (onDone) onDone(data.partnerId);
      else {
        router.refresh();
        onClose();
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setApplying(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/30" onClick={onClose}>
      <div
        className="bg-white w-full max-w-xl h-full shadow-2xl flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 头 */}
        <div className="px-5 py-4 border-b flex items-center justify-between bg-gradient-to-r from-indigo-600 to-purple-600 text-white">
          <div>
            <div className="text-sm font-semibold flex items-center gap-1.5">✦ {meta.title}</div>
            <div className="text-xs text-indigo-200 mt-0.5">像聊天一样描述，我会自动调研并整理，确认后才入库</div>
          </div>
          <button onClick={onClose} className="text-indigo-100 hover:text-white text-xl leading-none">×</button>
        </div>

        {/* 对话 */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
          {messages.length === 0 && (
            <div className="text-sm text-zinc-400 whitespace-pre-wrap leading-relaxed bg-zinc-50 rounded-lg p-4">
              {meta.placeholder}
            </div>
          )}
          {messages.map((m, i) => (
            <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
              <div
                className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm whitespace-pre-wrap leading-relaxed ${
                  m.role === "user" ? "bg-indigo-600 text-white" : "bg-zinc-100 text-zinc-800"
                }`}
              >
                {m.content}
              </div>
            </div>
          ))}
          {loading && (
            <div className="flex justify-start">
              <div className="bg-zinc-100 text-zinc-400 rounded-2xl px-3.5 py-2.5 text-sm">
                {scope === "new_partner" || scope === "profile" ? "正在调研并整理…" : "正在思考…"}
              </div>
            </div>
          )}

          {/* 实时提案预览 */}
          {proposal && (
            <div className="mt-2 rounded-xl border border-zinc-200 p-3.5">
              <div className="text-xs font-semibold text-zinc-500 mb-2">待录入内容预览</div>
              <ProposalPreview p={proposal} />
              {questions.length > 0 && !ready && (
                <div className="mt-3 text-xs text-amber-700 bg-amber-50 rounded-lg p-2.5">
                  补充这些会更完整：{questions.join("；")}
                </div>
              )}
            </div>
          )}
          {error && <p className="text-sm text-red-600">{error}</p>}
        </div>

        {/* 输入区 */}
        <div className="border-t px-5 py-3 space-y-2">
          {proposal && (
            <button
              onClick={apply}
              disabled={applying}
              className={`w-full rounded-lg py-2.5 text-sm font-medium transition-colors disabled:opacity-50 ${
                ready ? "bg-emerald-600 text-white hover:bg-emerald-700" : "bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
              }`}
            >
              {applying ? "写入中…" : ready ? "✓ 确认入库" : "信息够了，直接入库"}
            </button>
          )}
          <div className="flex gap-2 items-end">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                  e.preventDefault();
                  send();
                }
              }}
              rows={2}
              placeholder="输入后按 ⌘/Ctrl + Enter 发送…"
              className="flex-1 rounded-lg border border-zinc-200 px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
            <button
              onClick={send}
              disabled={loading || !input.trim()}
              className="rounded-lg bg-indigo-600 text-white px-4 py-2.5 text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 shrink-0"
            >
              发送
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
