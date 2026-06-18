"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type BoundChat = {
  chatId: string;
  chatType: string;
  label: string | null;
} | null;

export function PartnerWecomPanel({
  partnerId,
  partnerName,
  boundChat,
}: {
  partnerId: string;
  partnerName: string;
  boundChat: BoundChat;
}) {
  const router = useRouter();
  const [chatId, setChatId] = useState(boundChat?.chatId ?? "");
  const [label, setLabel] = useState(boundChat?.label ?? "");
  const [pushText, setPushText] = useState("");
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState("");

  async function bind() {
    setLoading(true);
    setMsg("");
    try {
      const res = await fetch("/api/wecom/chats/bind", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chatId: chatId.trim(),
          partnerId,
          label: label.trim() || `${partnerName} 群`,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "绑定失败");
      setMsg("已绑定企微群");
      router.refresh();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "绑定失败");
    } finally {
      setLoading(false);
    }
  }

  async function unbind() {
    if (!boundChat) return;
    setLoading(true);
    setMsg("");
    try {
      const res = await fetch("/api/wecom/chats/bind", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chatId: boundChat.chatId, partnerId: null }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "解绑失败");
      setChatId("");
      setMsg("已解绑");
      router.refresh();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "解绑失败");
    } finally {
      setLoading(false);
    }
  }

  async function push() {
    setLoading(true);
    setMsg("");
    try {
      const res = await fetch("/api/wecom/push", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ partnerId, content: pushText }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "推送失败");
      setMsg("已加入推送队列，约数秒内发到企微群");
      setPushText("");
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "推送失败");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-4 space-y-3 text-sm">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-zinc-800">企业微信群</h3>
        {boundChat && (
          <span className="text-xs text-emerald-600">已绑定</span>
        )}
      </div>
      <p className="text-xs text-zinc-500 leading-relaxed">
        在群里 @ 机器人发消息后，系统会自动记录群 Chat ID。将本伙伴绑定到该群后，可主动推送档案摘要、待办提醒等到群聊。
      </p>
      {boundChat ? (
        <div className="rounded-lg bg-zinc-50 p-3 space-y-1 text-xs font-mono break-all">
          <div>
            <span className="text-zinc-500">Chat ID：</span>
            {boundChat.chatId}
          </div>
          {boundChat.label && (
            <div>
              <span className="text-zinc-500">备注：</span>
              {boundChat.label}
            </div>
          )}
        </div>
      ) : (
        <label className="block space-y-1">
          <span className="text-xs text-zinc-500">群 Chat ID（在团队设置或服务器日志中查看）</span>
          <input
            value={chatId}
            onChange={(e) => setChatId(e.target.value)}
            placeholder="wrBcKOBgAA…"
            className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-xs font-mono"
          />
        </label>
      )}
      <label className="block space-y-1">
        <span className="text-xs text-zinc-500">群备注名（可选）</span>
        <input
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="Beon-it 沙特"
          className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-xs"
        />
      </label>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={loading || !chatId.trim()}
          onClick={() => void bind()}
          className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs text-white disabled:opacity-50"
        >
          保存绑定
        </button>
        {boundChat && (
          <button
            type="button"
            disabled={loading}
            onClick={() => void unbind()}
            className="rounded-lg border border-zinc-200 px-3 py-1.5 text-xs text-zinc-600"
          >
            解绑
          </button>
        )}
      </div>
      {boundChat && (
        <div className="border-t border-zinc-100 pt-3 space-y-2">
          <span className="text-xs text-zinc-500">测试推送到群（Markdown）</span>
          <textarea
            value={pushText}
            onChange={(e) => setPushText(e.target.value)}
            rows={3}
            placeholder={`【${partnerName}】今日跟进提醒…`}
            className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-xs"
          />
          <button
            type="button"
            disabled={loading || !pushText.trim()}
            onClick={() => void push()}
            className="rounded-lg bg-zinc-800 px-3 py-1.5 text-xs text-white disabled:opacity-50"
          >
            推送到企微群
          </button>
        </div>
      )}
      {msg && <p className="text-xs text-indigo-600">{msg}</p>}
    </div>
  );
}
