"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import { useMessages } from "@/lib/i18n/context";
import {
  ATTACHMENTS_STORAGE_KEY,
  DEFAULT_LEAD_EMAIL_TEMPLATES,
  TEMPLATES_STORAGE_KEY,
  TEMPLATES_STORAGE_KEY_V1,
  applyLeadEmailTemplateRecord,
  downloadAttachment,
  downloadAttachmentsSequential,
  formatEmailClipboard,
  getGivenName,
  markdownToEmailHtml,
  markdownToPlainText,
  migrateEmailTemplates,
  normalizeEmailMarkdown,
  openMailtoCompose,
  normalizeLeadEmail,
  templateChipLabel,
  type LeadEmailAttachment,
  type LeadEmailTemplate,
  type LeadEmailTemplateVars,
} from "@/lib/lead-email";
import { composeEmailViaBridge, isBridgeAvailable } from "@/lib/browser-bridge";
import { LeadEmailBodyEditor } from "./lead-email-body-editor";

const chipClass =
  "inline-flex items-center rounded-full border border-sky-200 bg-sky-50 px-3 py-1 text-xs text-sky-700 transition-all hover:border-sky-300 hover:bg-sky-100 active:scale-95";

type PanelMode = "none" | "templates" | "attachments";
type ComposeEdit = "none" | "subject" | "body";

function newTemplateId(): string {
  return typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : `tpl-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export function LeadEmail({
  contEmail,
  contName,
  companyName,
  city,
  country,
}: {
  contEmail: string | null;
  contName: string | null;
  companyName: string | null;
  city: string | null;
  country: string | null;
}) {
  const m = useMessages();
  const l = m.leads.email;

  const defaults = DEFAULT_LEAD_EMAIL_TEMPLATES;
  const normalizedEmail = useMemo(() => normalizeLeadEmail(contEmail), [contEmail]);
  const givenName = useMemo(() => getGivenName(contName), [contName]);

  const vars: LeadEmailTemplateVars = useMemo(
    () => ({
      name: givenName || (contName?.trim() ?? ""),
      company: companyName?.trim() ?? "",
      city: city?.trim() ?? "",
      country: country?.trim() ?? "",
    }),
    [givenName, contName, companyName, city, country],
  );

  const [templates, setTemplates] = useState<LeadEmailTemplate[]>(defaults);
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [panelMode, setPanelMode] = useState<PanelMode>("none");
  const [editingTemplateId, setEditingTemplateId] = useState<string | null>(null);
  const [templateDraft, setTemplateDraft] = useState<LeadEmailTemplate | null>(null);
  const [composeEdit, setComposeEdit] = useState<ComposeEdit>("none");
  const [bodyEditorKey, setBodyEditorKey] = useState(0);
  const [attachments, setAttachments] = useState<LeadEmailAttachment[]>([]);
  const [checkedIds, setCheckedIds] = useState<Set<string>>(new Set());
  const [copied, setCopied] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [bridgeReady, setBridgeReady] = useState(false);
  const [sending, setSending] = useState(false);
  const [bridgeNotice, setBridgeNotice] = useState<{ kind: "ok" | "warn" | "error"; text: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const copiedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let cancelled = false;
    isBridgeAvailable().then((ok) => {
      if (!cancelled) setBridgeReady(ok);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    try {
      const rawV2 = localStorage.getItem(TEMPLATES_STORAGE_KEY);
      if (rawV2) {
        setTemplates(migrateEmailTemplates(JSON.parse(rawV2)));
        return;
      }
      const rawV1 = localStorage.getItem(TEMPLATES_STORAGE_KEY_V1);
      if (rawV1) {
        const migrated = migrateEmailTemplates(JSON.parse(rawV1));
        setTemplates(migrated);
        localStorage.setItem(TEMPLATES_STORAGE_KEY, JSON.stringify(migrated));
        return;
      }
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(ATTACHMENTS_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as LeadEmailAttachment[];
        if (Array.isArray(parsed)) {
          setAttachments(parsed);
          setCheckedIds(new Set(parsed.map((a) => a.id)));
        }
      }
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    return () => {
      if (copiedTimerRef.current) clearTimeout(copiedTimerRef.current);
    };
  }, []);

  const persistTemplates = (next: LeadEmailTemplate[]) => {
    setTemplates(next);
    try {
      localStorage.setItem(TEMPLATES_STORAGE_KEY, JSON.stringify(next));
    } catch {
      // ignore
    }
  };

  const persistAttachments = useCallback((next: LeadEmailAttachment[]) => {
    setAttachments(next);
    try {
      localStorage.setItem(ATTACHMENTS_STORAGE_KEY, JSON.stringify(next));
    } catch {
      // ignore
    }
  }, []);

  const pickTemplate = (tpl: LeadEmailTemplate) => {
    const applied = applyLeadEmailTemplateRecord(tpl, vars);
    setSubject(applied.subject);
    setBody(applied.body);
    setComposeEdit("none");
    setBodyEditorKey((k) => k + 1);
  };

  const startEditTemplate = (tpl: LeadEmailTemplate) => {
    setEditingTemplateId(tpl.id);
    setTemplateDraft({ ...tpl });
  };

  const cancelEditTemplate = () => {
    setEditingTemplateId(null);
    setTemplateDraft(null);
  };

  const saveTemplateDraft = () => {
    if (!templateDraft) return;
    const next = templates.map((t) => (t.id === templateDraft.id ? templateDraft : t));
    persistTemplates(next);
    cancelEditTemplate();
  };

  const addTemplate = () => {
    const tpl: LeadEmailTemplate = {
      id: newTemplateId(),
      subject: "New phrase — {company}",
      body: "Hi {name}, ",
    };
    const next = [...templates, tpl];
    persistTemplates(next);
    startEditTemplate(tpl);
  };

  const deleteTemplate = (id: string) => {
    const next = templates.filter((t) => t.id !== id);
    persistTemplates(next.length > 0 ? next : defaults);
    if (editingTemplateId === id) cancelEditTemplate();
  };

  const resetTemplates = () => {
    persistTemplates(defaults);
    cancelEditTemplate();
  };

  const toggleChecked = (id: string) => {
    setCheckedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const removeAttachment = (id: string) => {
    const next = attachments.filter((a) => a.id !== id);
    persistAttachments(next);
    setCheckedIds((prev) => {
      const s = new Set(prev);
      s.delete(id);
      return s;
    });
  };

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    setUploading(true);
    setUploadError(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/upload", { method: "POST", body: fd });
      const data = (await res.json()) as {
        asset?: { id: string; filename: string };
        error?: string;
      };
      if (!res.ok || !data.asset) {
        throw new Error(data.error || l.uploadFailed);
      }
      const att: LeadEmailAttachment = {
        id: crypto.randomUUID(),
        name: data.asset.filename,
        assetId: data.asset.id,
        filename: data.asset.filename,
      };
      const next = [...attachments, att];
      persistAttachments(next);
      setCheckedIds((prev) => new Set([...prev, att.id]));
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : l.uploadFailed);
    } finally {
      setUploading(false);
    }
  };

  const openExmail = async () => {
    if (!normalizedEmail) return;
    const selected = attachments.filter((a) => checkedIds.has(a.id));
    if (selected.length) await downloadAttachmentsSequential(selected);
    openMailtoCompose(normalizedEmail, subject, body);
    try {
      await navigator.clipboard.writeText(formatEmailClipboard(normalizedEmail, subject, body));
      setCopied(true);
      if (copiedTimerRef.current) clearTimeout(copiedTimerRef.current);
      copiedTimerRef.current = setTimeout(() => setCopied(false), 3000);
    } catch {
      // mailto 已预填；剪贴板失败可忽略
    }
  };

  const composeViaBridge = async () => {
    if (!normalizedEmail || sending) return;
    setSending(true);
    setBridgeNotice(null);
    try {
      const selected = attachments.filter((a) => checkedIds.has(a.id));
      const result = await composeEmailViaBridge({
        to: normalizedEmail,
        subject,
        body,
        bodyHtml: markdownToEmailHtml(body),
      });
      if (result.ok && result.warning) {
        setBridgeNotice({ kind: "warn", text: result.warning });
      } else if (result.ok) {
        if (selected.length) {
          await downloadAttachmentsSequential(selected);
          setBridgeNotice({ kind: "ok", text: l.bridgeDoneWithAttachments });
        } else {
          setBridgeNotice({ kind: "ok", text: l.bridgeDone });
        }
      } else {
        setBridgeNotice({ kind: "error", text: result.error || l.bridgeFailed });
      }
    } finally {
      setSending(false);
    }
  };

  if (!normalizedEmail) {
    return null;
  }

  const bodyPreview = markdownToPlainText(body);

  return (
    <div className="rounded-lg border border-sky-100 bg-sky-50/40 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
        <div className="text-sm font-medium text-sky-800">
          {l.title}
          {givenName ? ` · ${givenName}` : ""}
        </div>
        <div className="flex gap-3">
          <button
            type="button"
            onClick={() => {
              const next = panelMode === "templates" ? "none" : "templates";
              setPanelMode(next);
              if (next === "none") cancelEditTemplate();
            }}
            className="text-xs text-sky-700 underline-offset-2 hover:underline"
          >
            {panelMode === "templates" ? l.done : l.manage}
          </button>
          <button
            type="button"
            onClick={() => setPanelMode(panelMode === "attachments" ? "none" : "attachments")}
            className="text-xs text-sky-700 underline-offset-2 hover:underline"
          >
            {panelMode === "attachments" ? l.done : l.manageAttachments}
          </button>
        </div>
      </div>

      {panelMode === "templates" ? (
        <div className="flex flex-col gap-2 mb-3">
          <p className="text-xs text-slate-500">{l.templateEditHint}</p>
          {templates.map((tpl) => {
            const isEditing = editingTemplateId === tpl.id && templateDraft;
            const preview = applyLeadEmailTemplateRecord(tpl, vars);
            return (
              <div key={tpl.id} className="rounded-lg border border-slate-200 bg-white p-3">
                {isEditing ? (
                  <div className="flex flex-col gap-2">
                    <input
                      value={templateDraft.subject}
                      onChange={(e) => setTemplateDraft({ ...templateDraft, subject: e.target.value })}
                      className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                      placeholder={l.subjectPlaceholder}
                    />
                    <LeadEmailBodyEditor
                      key={`tpl-${tpl.id}`}
                      value={templateDraft.body}
                      onChange={(md) => setTemplateDraft({ ...templateDraft, body: md })}
                      compact
                    />
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={saveTemplateDraft}
                        className="rounded-lg bg-sky-600 px-3 py-1.5 text-sm text-white hover:bg-sky-700"
                      >
                        {l.save}
                      </button>
                      <button
                        type="button"
                        onClick={cancelEditTemplate}
                        className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50"
                      >
                        {l.cancel}
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium text-slate-800 truncate">
                        {preview.subject || l.noSubject}
                      </div>
                      <div className="text-xs text-slate-500 mt-1 line-clamp-2">
                        {markdownToPlainText(preview.body) || "…"}
                      </div>
                    </div>
                    <div className="flex gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={() => startEditTemplate(tpl)}
                        className="text-xs text-sky-700 hover:underline"
                      >
                        {l.edit}
                      </button>
                      <button
                        type="button"
                        onClick={() => deleteTemplate(tpl.id)}
                        className="text-xs text-red-600 hover:underline"
                      >
                        {l.deleteTemplate}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={addTemplate}
              className="rounded-lg border border-dashed border-sky-300 bg-white px-3 py-1.5 text-sm text-sky-700 hover:bg-sky-50"
            >
              {l.addTemplate}
            </button>
            <button
              type="button"
              onClick={resetTemplates}
              className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50"
            >
              {l.reset}
            </button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap gap-1.5 mb-2">
          {templates.map((tpl) => (
            <button key={tpl.id} type="button" className={chipClass} onClick={() => pickTemplate(tpl)}>
              {templateChipLabel(tpl, vars).slice(0, 28)}
              {(templateChipLabel(tpl, vars).length > 28 ? "…" : "")}
            </button>
          ))}
        </div>
      )}

      {/* 主题：预览 + 独立编辑 */}
      <div className="rounded-lg border border-slate-200 bg-white mb-2">
        <div className="flex items-center justify-between px-3 py-1.5 border-b border-slate-100">
          <span className="text-xs text-slate-500">{l.subjectLabel}</span>
          {composeEdit !== "subject" && (
            <button
              type="button"
              onClick={() => setComposeEdit("subject")}
              className="text-xs text-sky-700 hover:underline"
            >
              {l.edit}
            </button>
          )}
        </div>
        {composeEdit === "subject" ? (
          <div className="p-2">
            <input
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
              placeholder={l.subjectPlaceholder}
              autoFocus
            />
            <button
              type="button"
              onClick={() => setComposeEdit("none")}
              className="mt-2 text-xs text-sky-700 hover:underline"
            >
              {l.done}
            </button>
          </div>
        ) : (
          <div className="px-3 py-2 text-sm text-slate-800 min-h-[2.25rem]">
            {subject || <span className="text-slate-400">{l.subjectPlaceholder}</span>}
          </div>
        )}
      </div>

      {/* 正文：预览 + 独立富文本编辑 */}
      <div className="rounded-lg border border-slate-200 bg-white">
        <div className="flex items-center justify-between px-3 py-1.5 border-b border-slate-100">
          <span className="text-xs text-slate-500">{l.bodyLabel}</span>
          {composeEdit !== "body" && (
            <button
              type="button"
              onClick={() => {
                setComposeEdit("body");
                setBodyEditorKey((k) => k + 1);
              }}
              className="text-xs text-sky-700 hover:underline"
            >
              {l.edit}
            </button>
          )}
        </div>
        {composeEdit === "body" ? (
          <div className="p-2">
            <LeadEmailBodyEditor
              key={`compose-${bodyEditorKey}`}
              value={body}
              onChange={setBody}
            />
            <button
              type="button"
              onClick={() => setComposeEdit("none")}
              className="mt-2 text-xs text-sky-700 hover:underline"
            >
              {l.done}
            </button>
          </div>
        ) : (
          <div className="px-3 py-2 text-sm text-slate-800 min-h-[4rem] prose prose-sm max-w-none prose-p:my-1 prose-ul:my-1 prose-ol:my-1">
            {bodyPreview ? (
              <ReactMarkdown>{normalizeEmailMarkdown(body)}</ReactMarkdown>
            ) : (
              <span className="text-slate-400">{l.messagePlaceholder}</span>
            )}
          </div>
        )}
      </div>

      <div className="mt-3 border-t border-sky-100 pt-3">
        <div className="text-xs font-medium text-sky-800 mb-2">{l.attachmentsTitle}</div>

        {panelMode === "attachments" && (
          <div className="flex flex-wrap items-center gap-2 mb-2">
            <input
              ref={fileInputRef}
              type="file"
              className="hidden"
              accept=".pdf,.ppt,.pptx,.doc,.docx,.png,.jpg,.jpeg,.gif,.webp,.md,.txt,image/*"
              onChange={handleUpload}
            />
            <button
              type="button"
              disabled={uploading}
              onClick={() => fileInputRef.current?.click()}
              className="rounded-lg border border-sky-200 bg-white px-3 py-1 text-xs text-sky-700 hover:bg-sky-50 disabled:opacity-50"
            >
              {uploading ? l.uploading : l.uploadAttachment}
            </button>
            {uploadError && <span className="text-xs text-red-600">{uploadError}</span>}
          </div>
        )}

        {attachments.length === 0 ? (
          <p className="text-xs text-slate-400">{l.noAttachments}</p>
        ) : (
          <ul className="flex flex-col gap-1.5">
            {attachments.map((att) => (
              <li key={att.id} className="flex flex-wrap items-center gap-2 text-xs">
                {panelMode !== "attachments" && (
                  <input
                    type="checkbox"
                    checked={checkedIds.has(att.id)}
                    onChange={() => toggleChecked(att.id)}
                    className="rounded border-slate-300"
                  />
                )}
                <span className="text-slate-700 truncate max-w-[200px]" title={att.name}>
                  {att.name}
                </span>
                <button
                  type="button"
                  onClick={() => downloadAttachment(att)}
                  className="text-sky-600 hover:underline"
                >
                  {l.downloadAttachment}
                </button>
                {panelMode === "attachments" && (
                  <button
                    type="button"
                    onClick={() => removeAttachment(att.id)}
                    className="text-red-600 hover:underline"
                  >
                    {l.deleteAttachment}
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}

        <p className="text-xs text-slate-400 mt-2">{l.attachmentHint}</p>
      </div>

      <div className="flex flex-wrap items-center gap-2 mt-3">
        <button
          type="button"
          disabled={sending}
          onClick={bridgeReady ? composeViaBridge : openExmail}
          className="inline-flex items-center gap-1.5 rounded-lg bg-sky-600 px-4 py-1.5 text-sm font-medium text-white shadow-sm transition-all hover:bg-sky-700 active:scale-95 disabled:opacity-60"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <rect x="2" y="4" width="20" height="16" rx="2" />
            <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
          </svg>
          {sending ? l.bridgeSending : bridgeReady ? l.composeViaBridge : l.openExmail}
        </button>
        {copied && <span className="text-xs text-sky-600">{l.copiedHint}</span>}
        {bridgeNotice && (
          <span
            className={
              bridgeNotice.kind === "ok"
                ? "text-xs text-emerald-600"
                : bridgeNotice.kind === "warn"
                  ? "text-xs text-amber-600"
                  : "text-xs text-red-600"
            }
          >
            {bridgeNotice.text}
          </span>
        )}
        <span className="text-xs text-slate-400">{l.emailLabel}: {normalizedEmail}</span>
      </div>
      {bridgeReady ? (
        <p className="text-xs text-slate-400 mt-2">{l.bridgeHint}</p>
      ) : (
        <p className="text-xs text-slate-400 mt-2">
          {l.mailtoHint}{" "}
          <a href="/downloads/browser-bridge.zip" className="text-sky-600 hover:underline" download>
            {l.installBridge}
          </a>
        </p>
      )}
    </div>
  );
}
