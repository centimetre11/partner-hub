"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useMessages } from "@/lib/i18n/context";
import {
  ATTACHMENTS_STORAGE_KEY,
  DEFAULT_LEAD_EMAIL_TEMPLATES,
  TEMPLATES_STORAGE_KEY,
  applyLeadEmailTemplate,
  buildExmailWebLink,
  downloadAttachment,
  downloadAttachmentsSequential,
  formatEmailClipboard,
  getGivenName,
  normalizeLeadEmail,
  parseEmailTemplate,
  type LeadEmailAttachment,
  type LeadEmailTemplateVars,
} from "@/lib/lead-email";

const chipClass =
  "inline-flex items-center rounded-full border border-sky-200 bg-sky-50 px-3 py-1 text-xs text-sky-700 transition-all hover:border-sky-300 hover:bg-sky-100 active:scale-95";

type EditMode = "none" | "templates" | "attachments";

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

  const [templates, setTemplates] = useState<string[]>(defaults);
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [editMode, setEditMode] = useState<EditMode>("none");
  const [templateDraft, setTemplateDraft] = useState("");
  const [attachments, setAttachments] = useState<LeadEmailAttachment[]>([]);
  const [checkedIds, setCheckedIds] = useState<Set<string>>(new Set());
  const [copied, setCopied] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const copiedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(TEMPLATES_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as string[];
        if (Array.isArray(parsed) && parsed.length > 0) {
          setTemplates(parsed);
        }
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

  const persistTemplates = (next: string[]) => {
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

  const pickTemplate = (tpl: string) => {
    const parsed = parseEmailTemplate(applyLeadEmailTemplate(tpl, vars));
    setSubject(parsed.subject);
    setBody(parsed.body);
  };

  const startEditTemplates = () => {
    setTemplateDraft(templates.join("\n"));
    setEditMode("templates");
  };

  const saveTemplates = () => {
    const next = templateDraft
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean);
    persistTemplates(next.length > 0 ? next : defaults);
    setEditMode("none");
  };

  const resetTemplates = () => {
    persistTemplates(defaults);
    setTemplateDraft(defaults.join("\n"));
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
    try {
      await navigator.clipboard.writeText(formatEmailClipboard(normalizedEmail, subject, body));
      setCopied(true);
      if (copiedTimerRef.current) clearTimeout(copiedTimerRef.current);
      copiedTimerRef.current = setTimeout(() => setCopied(false), 3000);
    } catch {
      // clipboard may fail; still open exmail
    }
    const selected = attachments.filter((a) => checkedIds.has(a.id));
    if (selected.length) await downloadAttachmentsSequential(selected);
    window.open(buildExmailWebLink(), "_blank", "noopener,noreferrer");
  };

  if (!normalizedEmail) {
    return null;
  }

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
            onClick={editMode === "templates" ? saveTemplates : startEditTemplates}
            className="text-xs text-sky-700 underline-offset-2 hover:underline"
          >
            {editMode === "templates" ? l.save : l.manage}
          </button>
          <button
            type="button"
            onClick={() => setEditMode(editMode === "attachments" ? "none" : "attachments")}
            className="text-xs text-sky-700 underline-offset-2 hover:underline"
          >
            {editMode === "attachments" ? l.done : l.manageAttachments}
          </button>
        </div>
      </div>

      {editMode === "templates" ? (
        <div className="flex flex-col gap-2 mb-3">
          <p className="text-xs text-slate-500">{l.editHint}</p>
          <textarea
            value={templateDraft}
            onChange={(e) => setTemplateDraft(e.target.value)}
            rows={5}
            className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
            placeholder={l.editPlaceholder}
          />
          <div className="flex gap-2">
            <button
              type="button"
              onClick={saveTemplates}
              className="rounded-lg bg-sky-600 px-3 py-1.5 text-sm text-white hover:bg-sky-700"
            >
              {l.save}
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
          {templates.map((tpl, i) => {
            const preview = parseEmailTemplate(applyLeadEmailTemplate(tpl, vars));
            const label = preview.subject || preview.body;
            return (
              <button key={i} type="button" className={chipClass} onClick={() => pickTemplate(tpl)}>
                {label.slice(0, 24)}…
              </button>
            );
          })}
        </div>
      )}

      <input
        value={subject}
        onChange={(e) => setSubject(e.target.value)}
        className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm mb-2"
        placeholder={l.subjectPlaceholder}
      />
      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        rows={3}
        className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
        placeholder={l.messagePlaceholder}
      />

      <div className="mt-3 border-t border-sky-100 pt-3">
        <div className="text-xs font-medium text-sky-800 mb-2">{l.attachmentsTitle}</div>

        {editMode === "attachments" && (
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
                {editMode !== "attachments" && (
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
                {editMode === "attachments" && (
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
          onClick={openExmail}
          className="inline-flex items-center gap-1.5 rounded-lg bg-sky-600 px-4 py-1.5 text-sm font-medium text-white shadow-sm transition-all hover:bg-sky-700 active:scale-95"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <rect x="2" y="4" width="20" height="16" rx="2" />
            <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
          </svg>
          {l.openExmail}
        </button>
        {copied && <span className="text-xs text-sky-600">{l.copiedHint}</span>}
        <span className="text-xs text-slate-400">{l.emailLabel}: {normalizedEmail}</span>
      </div>
    </div>
  );
}
