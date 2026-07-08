"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useMessages } from "@/lib/i18n/context";
import {
  generateCustomerWecomChatBindCodeAction,
  generatePartnerWecomChatBindCodeAction,
} from "@/lib/wecom-chat-bind-actions";

type BoundChat = {
  chatId: string;
  chatType: string;
  label: string | null;
} | null;

type WecomChatOption = {
  chatId: string;
  label: string | null;
  lastSeenAt: string;
};

export function WecomChatBindSection({
  entityType,
  entityId,
  entityName,
  boundChat,
}: {
  entityType: "customer" | "partner";
  entityId: string;
  entityName: string;
  boundChat: BoundChat;
}) {
  const intg = useMessages().integrations;
  const router = useRouter();
  const [chatId, setChatId] = useState(boundChat?.chatId ?? "");
  const [chatLabel, setChatLabel] = useState(boundChat?.label ?? "");
  const [unboundChats, setUnboundChats] = useState<WecomChatOption[]>([]);
  const [bindCode, setBindCode] = useState<string | null>(null);
  const [bindCodeHint, setBindCodeHint] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState("");

  useEffect(() => {
    if (boundChat) return;
    void fetch("/api/wecom/chats")
      .then((r) => r.json())
      .then((data: { chats?: Array<{
        chatId: string;
        chatType: string;
        label: string | null;
        partnerId: string | null;
        customerId: string | null;
        lastSeenAt: string;
      }> }) => {
        const groups = (data.chats ?? []).filter(
          (c) => c.chatType === "group" && !c.partnerId && !c.customerId,
        );
        setUnboundChats(
          groups.map((c) => ({
            chatId: c.chatId,
            label: c.label,
            lastSeenAt: c.lastSeenAt,
          })),
        );
      })
      .catch(() => setUnboundChats([]));
  }, [boundChat]);

  async function bindWecom(selectedChatId?: string) {
    const id = (selectedChatId ?? chatId).trim();
    if (!id) return;
    setLoading(true);
    setMsg("");
    try {
      const body =
        entityType === "customer"
          ? {
              chatId: id,
              customerId: entityId,
              label: chatLabel.trim() || `${entityName} 群`,
            }
          : {
              chatId: id,
              partnerId: entityId,
              label: chatLabel.trim() || `${entityName} 群`,
            };
      const res = await fetch("/api/wecom/chats/bind", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "绑定失败");
      setMsg(intg.saved);
      router.refresh();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "绑定失败");
    } finally {
      setLoading(false);
    }
  }

  async function unbindWecom() {
    if (!boundChat) return;
    setLoading(true);
    setMsg("");
    try {
      const body =
        entityType === "customer"
          ? { chatId: boundChat.chatId, customerId: null }
          : { chatId: boundChat.chatId, partnerId: null };
      const res = await fetch("/api/wecom/chats/bind", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "解绑失败");
      setChatId("");
      setMsg(intg.saved);
      router.refresh();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "解绑失败");
    } finally {
      setLoading(false);
    }
  }

  async function generateBindCode() {
    setLoading(true);
    setBindCode(null);
    setBindCodeHint(null);
    setMsg("");
    try {
      const result =
        entityType === "customer"
          ? await generateCustomerWecomChatBindCodeAction(entityId)
          : await generatePartnerWecomChatBindCodeAction(entityId);
      if ("error" in result) throw new Error(result.error);
      setBindCode(result.code);
      setBindCodeHint(result.message);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "生成失败");
    } finally {
      setLoading(false);
    }
  }

  function formatLastSeen(iso: string) {
    try {
      return new Date(iso).toLocaleString();
    } catch {
      return iso;
    }
  }

  const input =
    "w-full rounded-lg border border-slate-200 px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-slate-400";

  return (
    <div className="space-y-2">
      <div className="text-xs font-medium text-slate-700">{intg.wecomChatId}</div>
      <p className="text-xs text-slate-500">{intg.wecomChatIdHint}</p>

      {boundChat ? (
        <div className="rounded-lg bg-slate-50 p-2.5 text-xs font-mono break-all text-slate-700">
          {boundChat.chatId}
          {boundChat.label && <span className="text-slate-500 ml-2">({boundChat.label})</span>}
        </div>
      ) : (
        <>
          {unboundChats.length > 0 ? (
            <div className="space-y-1.5">
              <label className="text-xs text-slate-600">{intg.wecomSelectGroup}</label>
              <select
                value={chatId}
                onChange={(e) => setChatId(e.target.value)}
                className={input}
              >
                <option value="">{intg.wecomSelectPlaceholder}</option>
                {unboundChats.map((c) => (
                  <option key={c.chatId} value={c.chatId}>
                    {(c.label || intg.wecomUnnamedGroup) +
                      ` · ${formatLastSeen(c.lastSeenAt)}`}
                  </option>
                ))}
              </select>
            </div>
          ) : (
            <p className="text-xs text-amber-700">{intg.wecomNoUnboundGroups}</p>
          )}

          <details className="text-xs">
            <summary className="cursor-pointer text-slate-500">{intg.wecomManualChatId}</summary>
            <div className="mt-2 space-y-2">
              <input
                value={chatId}
                onChange={(e) => setChatId(e.target.value)}
                placeholder="wrBcKOBgAA…"
                className={`${input} font-mono`}
              />
              <input
                value={chatLabel}
                onChange={(e) => setChatLabel(e.target.value)}
                placeholder={entityName}
                className={input}
              />
            </div>
          </details>

          <div className="rounded-lg border border-slate-100 bg-slate-50 p-2.5 space-y-2">
            <p className="text-xs text-slate-600">{intg.wecomBindCodeHint}</p>
            <button
              type="button"
              disabled={loading}
              onClick={() => void generateBindCode()}
              className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-700 disabled:opacity-50"
            >
              {intg.wecomGenerateBindCode}
            </button>
            {bindCode && (
              <div className="text-xs">
                <div className="font-mono text-base font-bold tracking-widest">{bindCode}</div>
                <p className="mt-1 text-sky-700">
                  {entityType === "customer"
                    ? intg.wecomBindCodeSendCustomer.replace("{code}", bindCode)
                    : intg.wecomBindCodeSendPartner.replace("{code}", bindCode)}
                </p>
              </div>
            )}
            {bindCodeHint && <p className="text-xs text-sky-600">{bindCodeHint}</p>}
          </div>
        </>
      )}

      <div className="flex gap-2">
        {!boundChat ? (
          <button
            type="button"
            disabled={loading || !chatId.trim()}
            onClick={() => void bindWecom()}
            className="rounded-lg bg-slate-900 px-3 py-1.5 text-xs text-white disabled:opacity-50"
          >
            {intg.save}
          </button>
        ) : (
          <button
            type="button"
            disabled={loading}
            onClick={() => void unbindWecom()}
            className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs text-slate-600"
          >
            {intg.unbind}
          </button>
        )}
      </div>

      {msg && <p className="text-xs text-sky-600">{msg}</p>}
    </div>
  );
}
