"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useLocale, useMessages } from "@/lib/i18n/context";
import { createMeetingAction, type CreateMeetingResult } from "@/lib/meeting-actions";
import { isBridgeAvailable } from "@/lib/browser-bridge";
import { composeMeetingInviteEmail, previewMeetingInvitationEmail } from "@/lib/meeting-invite-compose";
import { prepareChatImagesFromFiles } from "@/lib/ai-images";
import { isValidEmail, parseEmailRecipients, validateEmailList } from "@/lib/email-recipients";
import type { MeetingExtractResult } from "@/lib/meeting-extract";
import {
  parseDateTimeLocal,
  isoToDateTimeLocal,
  toDateTimeLocalInput,
  defaultMeetingStartLocal,
  defaultMeetingEndLocal,
  getBrowserTimeZone,
  formatTimeZoneLabel,
} from "@/lib/meeting-datetime";

export type MeetingCustomerOption = {
  id: string;
  name: string;
  contactEmail: string | null;
  contactName: string | null;
};

export type BoundUserWithEmail = { id: string; name: string; email: string };

const input =
  "box-border w-full min-w-0 max-w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400";

function imageFilesFromClipboard(data: DataTransfer | null): File[] {
  if (!data?.items) return [];
  return [...data.items]
    .filter((it) => it.kind === "file" && it.type.startsWith("image/"))
    .map((it) => it.getAsFile())
    .filter((f): f is File => !!f);
}

type InviteSnapshot = {
  to: string;
  cc?: string;
  subject: string;
  meetingTitle: string;
  customerName: string;
  contactName: string | null;
  startLocal: string;
  endLocal: string;
  startAt: Date;
  endAt: Date;
};

type InputMode = "manual" | "auto";

export function MeetingCustomerInviteForm({
  currentUserId,
  organizerName,
  googleMeetConnected,
  wecomScheduleConfigured,
  boundUsers,
  customers,
}: {
  currentUserId: string;
  organizerName: string;
  googleMeetConnected: boolean;
  wecomScheduleConfigured: boolean;
  boundUsers: BoundUserWithEmail[];
  customers: MeetingCustomerOption[];
}) {
  const m = useMessages();
  const locale = useLocale();
  const invite = m.meetingCustomerInvite;
  const s = { ...m.meetingScheduler, ...invite };

  const [inputMode, setInputMode] = useState<InputMode>("manual");
  const [emailSubject, setEmailSubject] = useState("");
  const [startAt, setStartAt] = useState(() => defaultMeetingStartLocal());
  const [endAt, setEndAt] = useState(() => defaultMeetingEndLocal());
  const [selected, setSelected] = useState<Set<string>>(() => new Set([currentUserId]));
  const [notifyAttendees, setNotifyAttendees] = useState(true);

  const [customerId, setCustomerId] = useState("");
  const [customerEmail, setCustomerEmail] = useState("");
  const [contactName, setContactName] = useState("");
  const [colleagueEmails, setColleagueEmails] = useState("");
  const [selectedColleagueIds, setSelectedColleagueIds] = useState<Set<string>>(new Set());

  const [error, setError] = useState<string | null>(null);
  const [extractError, setExtractError] = useState<string | null>(null);
  const [extracting, setExtracting] = useState(false);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [pendingImageFile, setPendingImageFile] = useState<File | null>(null);
  const [extractText, setExtractText] = useState("");
  const [pendingExtract, setPendingExtract] = useState<MeetingExtractResult | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const extractBusyRef = useRef(false);
  const imagePreviewUrlRef = useRef<string | null>(null);
  const pendingFormRef = useRef<FormData | null>(null);

  const [result, setResult] = useState<Extract<CreateMeetingResult, { ok: true }> | null>(null);
  const [copied, setCopied] = useState(false);
  const [pending, start] = useTransition();
  const [bridgeReady, setBridgeReady] = useState(false);
  const [composeNotice, setComposeNotice] = useState<{
    kind: "ok" | "warn" | "error";
    text: string;
  } | null>(null);
  const [inviteSnapshot, setInviteSnapshot] = useState<InviteSnapshot | null>(null);
  const [reopeningCompose, setReopeningCompose] = useState(false);
  const [composeOpened, setComposeOpened] = useState(false);
  const [confirmingCompose, setConfirmingCompose] = useState(false);
  const [composePhase, setComposePhase] = useState<"idle" | "creating" | "opening">("idle");

  const timeZone = useMemo(() => getBrowserTimeZone(), []);

  const timeZoneLabel = useMemo(() => {
    const loc = locale === "zh" ? "zh-CN" : "en-US";
    return formatTimeZoneLabel(timeZone, new Date(), loc);
  }, [timeZone, locale]);

  const selectedCustomer = useMemo(
    () => customers.find((c) => c.id === customerId) ?? null,
    [customers, customerId],
  );

  const customerEmailOk = isValidEmail(customerEmail);
  const colleagueValidation = useMemo(() => validateEmailList(colleagueEmails), [colleagueEmails]);
  const colleaguesWithEmail = useMemo(
    () => boundUsers.filter((u) => u.email && u.id !== currentUserId),
    [boundUsers, currentUserId],
  );

  useEffect(() => {
    let cancelled = false;
    isBridgeAvailable().then((ok) => {
      if (!cancelled) setBridgeReady(ok);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  function onCustomerSelect(id: string) {
    setCustomerId(id);
    const c = customers.find((x) => x.id === id);
    if (c) {
      setCustomerEmail(c.contactEmail?.trim() ?? "");
      setContactName(c.contactName?.trim() ?? "");
    }
  }

  function toggleColleagueEmail(user: BoundUserWithEmail) {
    setSelectedColleagueIds((prev) => {
      const next = new Set(prev);
      if (next.has(user.id)) next.delete(user.id);
      else next.add(user.id);
      const emails = colleaguesWithEmail
        .filter((u) => next.has(u.id))
        .map((u) => u.email);
      const manual = parseEmailRecipients(colleagueEmails).filter(
        (e) => !colleaguesWithEmail.some((u) => u.email === e),
      );
      setColleagueEmails([...manual, ...emails].join(", "));
      return next;
    });
  }

  function toggleUser(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function setImageFile(file: File | null) {
    if (imagePreviewUrlRef.current) {
      URL.revokeObjectURL(imagePreviewUrlRef.current);
      imagePreviewUrlRef.current = null;
    }
    setPendingImageFile(file);
    if (file) {
      const url = URL.createObjectURL(file);
      imagePreviewUrlRef.current = url;
      setImagePreview(url);
    } else {
      setImagePreview(null);
    }
    setPendingExtract(null);
    setExtractError(null);
  }

  function applyExtract(data: MeetingExtractResult) {
    if (data.subject?.trim()) setEmailSubject(data.subject.trim());
    else if (data.contactName?.trim()) {
      setEmailSubject(
        locale === "zh" ? `与 ${data.contactName.trim()} 的会议` : `Meeting with ${data.contactName.trim()}`,
      );
    }
    const sLocal = isoToDateTimeLocal(data.startAt, timeZone);
    const eLocal = isoToDateTimeLocal(data.endAt, timeZone);
    if (sLocal) setStartAt(sLocal);
    if (eLocal) setEndAt(eLocal);
    if (data.contactName?.trim()) setContactName(data.contactName.trim());
    const customerEmailFromAi = data.customerEmails?.[0]?.trim();
    if (customerEmailFromAi) {
      setCustomerEmail(customerEmailFromAi);
      const matched = customers.find(
        (c) => c.contactEmail?.trim().toLowerCase() === customerEmailFromAi.toLowerCase(),
      );
      if (matched) setCustomerId(matched.id);
    }
    if (data.colleagueEmails?.length) {
      const existing = parseEmailRecipients(colleagueEmails);
      const merged = [...new Set([...existing, ...data.colleagueEmails.map((e) => e.trim()).filter(Boolean)])];
      setColleagueEmails(merged.join(", "));
    }
  }

  function confirmPendingExtract() {
    if (!pendingExtract) return;
    applyExtract(pendingExtract);
    setPendingExtract(null);
    setInputMode("manual");
  }

  function cancelPendingExtract() {
    setPendingExtract(null);
    setExtractError(null);
  }

  async function runExtract(source: "image" | "text") {
    if (extractBusyRef.current) return;
    if (source === "image" && !pendingImageFile) {
      setExtractError(invite.imageRequired);
      return;
    }
    if (source === "text" && !extractText.trim()) {
      setExtractError(invite.textRequired);
      return;
    }
    extractBusyRef.current = true;
    setExtractError(null);
    setPendingExtract(null);
    setExtracting(true);
    try {
      const now = new Date();
      const weekday = now.toLocaleDateString(locale === "zh" ? "zh-CN" : "en-US", {
        weekday: "long",
        timeZone,
      });
      const payload: Record<string, unknown> = {
        timeZone,
        nowLocal: toDateTimeLocalInput(now, timeZone),
        weekday,
      };
      if (source === "image" && pendingImageFile) {
        payload.images = await prepareChatImagesFromFiles([pendingImageFile], { maxSide: 896, quality: 0.75 });
      } else {
        payload.text = extractText.trim();
      }
      const res = await fetch("/api/ai/meeting/extract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = (await res.json()) as { ok?: boolean; result?: MeetingExtractResult; error?: string };
      if (!res.ok || !data.result) {
        throw new Error(data.error || invite.extractFailed);
      }
      setPendingExtract(data.result);
    } catch (e) {
      setExtractError(e instanceof Error ? e.message : invite.extractFailed);
    } finally {
      setExtracting(false);
      extractBusyRef.current = false;
    }
  }

  const extractPreview = useMemo(() => {
    if (!pendingExtract) return null;
    const startLocal = pendingExtract.startAt ? isoToDateTimeLocal(pendingExtract.startAt, timeZone) : null;
    const endLocal = pendingExtract.endAt ? isoToDateTimeLocal(pendingExtract.endAt, timeZone) : null;
    return {
      subject: pendingExtract.subject?.trim() || "—",
      startLocal: startLocal || "—",
      endLocal: endLocal || "—",
      customerEmails: pendingExtract.customerEmails?.length
        ? pendingExtract.customerEmails.join(", ")
        : "—",
      colleagueEmails: pendingExtract.colleagueEmails?.length
        ? pendingExtract.colleagueEmails.join(", ")
        : "—",
      contactName: pendingExtract.contactName?.trim() || "—",
    };
  }, [pendingExtract, timeZone]);

  useEffect(() => {
    return () => {
      if (imagePreviewUrlRef.current) URL.revokeObjectURL(imagePreviewUrlRef.current);
    };
  }, []);

  const onPasteImage = useCallback((e: React.ClipboardEvent) => {
    const files = imageFilesFromClipboard(e.clipboardData);
    if (!files.length) return;
    e.preventDefault();
    setImageFile(files[0]);
  }, []);

  const onDropImage = useCallback((e: React.DragEvent) => {
    const files = [...e.dataTransfer.files].filter((f) => f.type.startsWith("image/"));
    if (!files.length) return;
    e.preventDefault();
    setImageFile(files[0]);
  }, []);

  async function openInviteCompose(meetLink: string, snapshot: InviteSnapshot) {
    setComposeNotice(null);
    const composeResult = await composeMeetingInviteEmail({
      to: snapshot.to,
      cc: snapshot.cc,
      subject: snapshot.subject,
      meetingTitle: snapshot.meetingTitle,
      startLocal: snapshot.startLocal,
      endLocal: snapshot.endLocal,
      startAt: snapshot.startAt,
      endAt: snapshot.endAt,
      timeZone,
      meetLink,
      customerName: snapshot.customerName,
      contactName: snapshot.contactName,
      organizerName,
      locale: "en",
    });
    if (composeResult.ok && composeResult.warning) {
      setComposeNotice({ kind: "warn", text: composeResult.warning });
    } else if (composeResult.ok) {
      setComposeNotice({
        kind: "ok",
        text: composeResult.viaBridge ? invite.composeDone : invite.composeDoneMailto,
      });
    } else {
      setComposeNotice({
        kind: "error",
        text: composeResult.error || invite.composeFailed,
      });
    }
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setResult(null);
    setComposeNotice(null);

    const subject = emailSubject.trim();
    if (!subject) {
      setError(invite.subjectRequired);
      return;
    }
    if (!customerEmailOk) {
      setError(invite.customerEmailRequired);
      return;
    }
    if (colleagueValidation.invalid.length) {
      setError(invite.invalidColleagueEmails.replace("{emails}", colleagueValidation.invalid.join(", ")));
      return;
    }

    const fd = new FormData();
    fd.set("title", subject);
    fd.set("startAt", startAt);
    fd.set("endAt", endAt);
    fd.set("timeZone", timeZone);
    fd.set("notifyAttendees", notifyAttendees ? "true" : "false");
    for (const id of selected) fd.append("attendeeUserIds", id);

    const parsedStart = parseDateTimeLocal(startAt, timeZone);
    const parsedEnd = parseDateTimeLocal(endAt, timeZone);
    if (!parsedStart || !parsedEnd) {
      setError(s.startAt);
      return;
    }
    const cc = colleagueValidation.valid.length ? colleagueValidation.valid.join(", ") : undefined;
    const snapshot: InviteSnapshot = {
      to: customerEmail.trim(),
      cc,
      subject,
      meetingTitle: subject,
      customerName: selectedCustomer?.name ?? (contactName.trim() || customerEmail.trim()),
      contactName: contactName.trim() || null,
      startLocal: startAt,
      endLocal: endAt,
      startAt: parsedStart,
      endAt: parsedEnd,
    };

    start(async () => {
      pendingFormRef.current = fd;
      setInviteSnapshot(snapshot);
      setResult(null);
      setComposeOpened(false);
      setComposeNotice(null);
    });
  }

  const emailPreview = useMemo(() => {
    if (!inviteSnapshot) return null;
    const meetLink = result?.meetLink ?? invite.meetLinkPlaceholder;
    return previewMeetingInvitationEmail({
      to: inviteSnapshot.to,
      cc: inviteSnapshot.cc,
      subject: inviteSnapshot.subject,
      meetingTitle: inviteSnapshot.meetingTitle,
      startLocal: inviteSnapshot.startLocal,
      endLocal: inviteSnapshot.endLocal,
      startAt: inviteSnapshot.startAt,
      endAt: inviteSnapshot.endAt,
      timeZone,
      meetLink,
      customerName: inviteSnapshot.customerName,
      contactName: inviteSnapshot.contactName,
      organizerName,
    });
  }, [result, inviteSnapshot, timeZone, organizerName]);

  async function confirmAndCreateAndOpen() {
    if (!inviteSnapshot) return;
    const fd = pendingFormRef.current;
    if (!fd) {
      setError(invite.previewExpired);
      return;
    }
    setConfirmingCompose(true);
    setComposePhase("creating");
    setError(null);
    setComposeNotice(null);
    try {
      const res = await createMeetingAction(fd);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setResult(res);
      setComposePhase("opening");
      setComposeNotice({ kind: "ok", text: invite.creatingDoneOpeningExmail });
      await openInviteCompose(res.meetLink, inviteSnapshot);
      setComposeOpened(true);
    } finally {
      setConfirmingCompose(false);
      setComposePhase("idle");
    }
  }

  function cancelPreview() {
    setInviteSnapshot(null);
    pendingFormRef.current = null;
    setResult(null);
    setComposeNotice(null);
    setComposeOpened(false);
    setError(null);
  }

  async function copyLink() {
    if (!result?.meetLink) return;
    try {
      await navigator.clipboard.writeText(result.meetLink);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  if (inviteSnapshot) {
    return (
      <div className="space-y-4 text-sm">
        {result ? (
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-emerald-900">
            <div className="font-medium">{s.successTitle}</div>
            <p className="mt-1 text-xs text-emerald-800">{s.wecomCreated.replace("{id}", result.wecomScheduleId)}</p>
            {composeNotice && (
              <p
                className={`mt-1 text-xs ${
                  composeNotice.kind === "ok"
                    ? "text-emerald-800"
                    : composeNotice.kind === "warn"
                      ? "text-amber-800"
                      : "text-red-700"
                }`}
              >
                {composeNotice.text}
              </p>
            )}
          </div>
        ) : (
          <div className="rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 text-sky-900">
            <div className="font-medium">{invite.previewStepTitle}</div>
            <p className="mt-1 text-xs text-sky-800">{invite.previewStepHint}</p>
          </div>
        )}

        {result && (
          <div>
            <div className="text-xs font-medium text-slate-500">{s.meetLink}</div>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <a href={result.meetLink} target="_blank" rel="noreferrer" className="text-sky-700 hover:underline break-all">
                {result.meetLink}
              </a>
              <button
                type="button"
                onClick={copyLink}
                className="shrink-0 rounded-lg border border-slate-200 px-2.5 py-1 text-xs text-slate-600 hover:border-slate-300"
              >
                {copied ? s.copied : s.copy}
              </button>
            </div>
          </div>
        )}

        {result && result.warnings.length > 0 && (
          <ul className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900 space-y-1">
            {result.warnings.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        )}

        {error && <p className="text-xs text-red-600">{error}</p>}

        {emailPreview && (
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-3">
            <div className="text-xs font-medium text-slate-700">{invite.confirmPreviewTitle}</div>
            <p className="text-xs text-slate-500">{invite.confirmPreviewHint}</p>
            <div className="rounded-lg border border-slate-200 bg-white p-3 text-xs space-y-2">
              <div>
                <span className="text-slate-400">{invite.previewTo}: </span>
                <span className="text-slate-800 break-all">{emailPreview.to}</span>
              </div>
              <div>
                <span className="text-slate-400">{invite.previewSubject}: </span>
                <span className="text-slate-800">{emailPreview.subject}</span>
              </div>
              <pre className="whitespace-pre-wrap text-slate-700 leading-relaxed max-h-48 overflow-y-auto">
                {emailPreview.text}
              </pre>
            </div>
            {!result ? (
              <div className="flex flex-col sm:flex-row gap-2">
                <button
                  type="button"
                  disabled={confirmingCompose}
                  onClick={cancelPreview}
                  className="flex-1 rounded-xl border border-slate-200 px-4 py-2.5 text-sm text-slate-700 hover:border-slate-300 disabled:opacity-50"
                >
                  {invite.cancelPreview}
                </button>
                <button
                  type="button"
                  disabled={confirmingCompose}
                  onClick={() => void confirmAndCreateAndOpen()}
                  className="flex-1 rounded-xl bg-sky-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-sky-700 disabled:opacity-50"
                >
                  {confirmingCompose
                    ? composePhase === "opening"
                      ? invite.confirmOpeningExmail
                      : invite.confirmCreating
                    : invite.confirmCreateAndOpen}
                </button>
              </div>
            ) : confirmingCompose ? (
              <p className="text-center text-xs text-sky-700 py-1">
                {composePhase === "opening" ? invite.confirmOpeningExmail : invite.confirmCreating}
              </p>
            ) : !composeOpened ? (
              <button
                type="button"
                disabled={reopeningCompose}
                onClick={async () => {
                  if (!result?.meetLink) return;
                  setReopeningCompose(true);
                  try {
                    await openInviteCompose(result.meetLink, inviteSnapshot);
                    setComposeOpened(true);
                  } finally {
                    setReopeningCompose(false);
                  }
                }}
                className="w-full rounded-xl bg-sky-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-sky-700 disabled:opacity-50"
              >
                {reopeningCompose ? invite.confirmOpening : invite.confirmOpenExmail}
              </button>
            ) : (
              <button
                type="button"
                disabled={reopeningCompose}
                onClick={async () => {
                  if (!result?.meetLink) return;
                  setReopeningCompose(true);
                  try {
                    await openInviteCompose(result.meetLink, inviteSnapshot);
                  } finally {
                    setReopeningCompose(false);
                  }
                }}
                className="w-full rounded-xl border border-sky-200 bg-sky-50 px-4 py-2 text-sm font-medium text-sky-800 hover:bg-sky-100 disabled:opacity-50"
              >
                {reopeningCompose ? invite.reopeningCompose : invite.reopenCompose}
              </button>
            )}
          </div>
        )}

        {result && (
          <button
            type="button"
            onClick={() => {
              cancelPreview();
              setEmailSubject("");
              setImageFile(null);
              setExtractText("");
              setPendingExtract(null);
            }}
            className="rounded-xl border border-slate-200 px-4 py-2 text-sm text-slate-700 hover:border-slate-300"
          >
            {s.createAnother}
          </button>
        )}
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-4 text-sm">
      {!wecomScheduleConfigured && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
          {s.wecomNotConfigured}
        </div>
      )}
      {!googleMeetConnected && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
          {s.googleNotConnected}{" "}
          <Link href="/account#google-meet" className="font-medium underline">
            {s.connectGoogle}
          </Link>
        </div>
      )}

      <div className="flex rounded-lg border border-slate-200 bg-slate-50 p-0.5 text-xs">
        <button
          type="button"
          onClick={() => setInputMode("manual")}
          className={`flex-1 rounded-md px-2.5 py-1.5 ${
            inputMode === "manual" ? "bg-white text-slate-900 shadow-sm font-medium" : "text-slate-500"
          }`}
        >
          {invite.modeManual}
        </button>
        <button
          type="button"
          onClick={() => setInputMode("auto")}
          className={`flex-1 rounded-md px-2.5 py-1.5 ${
            inputMode === "auto" ? "bg-white text-slate-900 shadow-sm font-medium" : "text-slate-500"
          }`}
        >
          {invite.modeAuto}
        </button>
      </div>

      {inputMode === "auto" && (
        <div className="space-y-4">
          <div
            tabIndex={0}
            role="region"
            aria-label={invite.uploadScreenshot}
            onPaste={onPasteImage}
            onDrop={onDropImage}
            onDragOver={(e) => {
              if ([...e.dataTransfer.types].includes("Files")) e.preventDefault();
            }}
            className="rounded-xl border border-dashed border-sky-200 bg-sky-50/40 p-4 space-y-3 outline-none focus-visible:ring-2 focus-visible:ring-sky-300"
          >
            <p className="text-xs text-sky-900">{invite.autoHint}</p>
            <p className="text-xs text-sky-700">{invite.pasteHint}</p>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                e.target.value = "";
                if (file) setImageFile(file);
              }}
            />
            {imagePreview && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={imagePreview} alt="" className="max-h-40 rounded-lg border border-slate-200 object-contain" />
            )}
            <div className="flex flex-col sm:flex-row gap-2">
              <button
                type="button"
                disabled={extracting}
                onClick={() => fileInputRef.current?.click()}
                className="flex-1 rounded-xl border border-sky-300 bg-white px-4 py-2 text-sm font-medium text-sky-800 hover:bg-sky-50 disabled:opacity-50"
              >
                {invite.chooseScreenshot}
              </button>
              <button
                type="button"
                disabled={extracting || !pendingImageFile}
                onClick={() => void runExtract("image")}
                className="flex-1 rounded-xl bg-sky-600 px-4 py-2 text-sm font-medium text-white hover:bg-sky-700 disabled:opacity-50"
              >
                {extracting ? invite.extracting : invite.recognizeScreenshot}
              </button>
            </div>
          </div>

          <div className="relative">
            <div className="absolute inset-0 flex items-center" aria-hidden>
              <div className="w-full border-t border-slate-200" />
            </div>
            <div className="relative flex justify-center text-xs">
              <span className="bg-white px-2 text-slate-400">{invite.orDivider}</span>
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-4 space-y-3">
            <p className="text-xs text-slate-700">{invite.textHint}</p>
            <textarea
              value={extractText}
              onChange={(e) => {
                setExtractText(e.target.value);
                setPendingExtract(null);
                setExtractError(null);
              }}
              rows={4}
              placeholder={invite.textPlaceholder}
              className={`${input} resize-y min-h-[5rem]`}
            />
            <button
              type="button"
              disabled={extracting || !extractText.trim()}
              onClick={() => void runExtract("text")}
              className="w-full rounded-xl bg-sky-600 px-4 py-2 text-sm font-medium text-white hover:bg-sky-700 disabled:opacity-50"
            >
              {extracting ? invite.extracting : invite.recognizeText}
            </button>
          </div>

          {extractPreview && (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-4 space-y-3">
              <div className="text-xs font-medium text-emerald-900">{invite.extractPreviewTitle}</div>
              <p className="text-xs text-emerald-800">{invite.extractPreviewHint}</p>
              <div className="rounded-lg border border-emerald-200 bg-white p-3 text-xs space-y-2 text-slate-700">
                <div>
                  <span className="text-slate-400">{invite.emailSubject}: </span>
                  {extractPreview.subject}
                </div>
                <div>
                  <span className="text-slate-400">{s.startAt}: </span>
                  {extractPreview.startLocal}
                </div>
                <div>
                  <span className="text-slate-400">{s.endAt}: </span>
                  {extractPreview.endLocal}
                </div>
                <div>
                  <span className="text-slate-400">{invite.customerEmail}: </span>
                  {extractPreview.customerEmails}
                </div>
                {extractPreview.colleagueEmails !== "—" && (
                  <div>
                    <span className="text-slate-400">{invite.colleagueEmails}: </span>
                    {extractPreview.colleagueEmails}
                  </div>
                )}
                {extractPreview.contactName !== "—" && (
                  <div>
                    <span className="text-slate-400">{invite.contactName}: </span>
                    {extractPreview.contactName}
                  </div>
                )}
              </div>
              <div className="flex flex-col sm:flex-row gap-2">
                <button
                  type="button"
                  onClick={cancelPendingExtract}
                  className="flex-1 rounded-xl border border-slate-200 px-4 py-2 text-sm text-slate-700 hover:border-slate-300"
                >
                  {invite.cancelExtract}
                </button>
                <button
                  type="button"
                  onClick={confirmPendingExtract}
                  className="flex-1 rounded-xl bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700"
                >
                  {invite.confirmExtract}
                </button>
              </div>
            </div>
          )}

          {extractError && <p className="text-xs text-red-600">{extractError}</p>}
        </div>
      )}

      <div className="rounded-lg border border-sky-100 bg-sky-50/60 px-3 py-2 text-xs text-sky-900">
        {bridgeReady ? (
          invite.bridgeHint
        ) : (
          <>
            {invite.mailtoHint}{" "}
            <Link href="/downloads/browser-bridge.zip" className="font-medium underline" download>
              {invite.installBridge}
            </Link>
          </>
        )}
      </div>

      <label className="block space-y-1">
        <span className="text-xs text-slate-500">{invite.emailSubject}</span>
        <input
          required
          value={emailSubject}
          onChange={(e) => setEmailSubject(e.target.value)}
          placeholder={invite.emailSubjectPlaceholder}
          className={input}
        />
        <p className="text-xs text-slate-400">{invite.emailSubjectHint}</p>
      </label>

      <label className="block space-y-1">
        <span className="text-xs text-slate-500">{invite.customer}</span>
        {customers.length > 0 && (
          <select
            value={customerId}
            onChange={(e) => onCustomerSelect(e.target.value)}
            className={`${input} mb-2`}
          >
            <option value="">{invite.customerPlaceholder}</option>
            {customers.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
                {c.contactName ? ` · ${c.contactName}` : ""}
              </option>
            ))}
          </select>
        )}
        <span className="text-xs text-slate-500">{invite.customerEmail}</span>
        <input
          required
          type="email"
          value={customerEmail}
          onChange={(e) => setCustomerEmail(e.target.value)}
          placeholder={invite.customerEmailPlaceholder}
          className={input}
        />
      </label>

      <label className="block space-y-1">
        <span className="text-xs text-slate-500">{invite.contactName}</span>
        <input
          value={contactName}
          onChange={(e) => setContactName(e.target.value)}
          placeholder={invite.contactNamePlaceholder}
          className={input}
        />
      </label>

      <label className="block space-y-1">
        <span className="text-xs text-slate-500">{invite.colleagueEmails}</span>
        <input
          value={colleagueEmails}
          onChange={(e) => setColleagueEmails(e.target.value)}
          placeholder={invite.colleagueEmailsPlaceholder}
          className={input}
        />
        {colleaguesWithEmail.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {colleaguesWithEmail.map((u) => (
              <button
                key={u.id}
                type="button"
                onClick={() => toggleColleagueEmail(u)}
                className={`rounded-full border px-2.5 py-0.5 text-xs ${
                  selectedColleagueIds.has(u.id)
                    ? "border-sky-400 bg-sky-50 text-sky-800"
                    : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"
                }`}
              >
                {u.name}
              </button>
            ))}
          </div>
        )}
        <p className="text-xs text-slate-400">{invite.colleagueEmailsHint}</p>
      </label>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <label className="block space-y-1">
          <span className="text-xs text-slate-500">{s.startAt}</span>
          <input
            required
            type="datetime-local"
            value={startAt}
            onChange={(e) => setStartAt(e.target.value)}
            className={input}
          />
        </label>
        <label className="block space-y-1">
          <span className="text-xs text-slate-500">{s.endAt}</span>
          <input
            required
            type="datetime-local"
            value={endAt}
            onChange={(e) => setEndAt(e.target.value)}
            className={input}
          />
        </label>
      </div>
      <p className="text-xs text-slate-400">{s.timeZoneHint.replace("{tz}", timeZoneLabel)}</p>

      <fieldset className="space-y-2">
        <legend className="text-xs text-slate-500">{s.attendees}</legend>
        {boundUsers.length === 0 ? (
          <p className="text-xs text-slate-400">{s.noBoundUsers}</p>
        ) : (
          <div className="max-h-40 overflow-y-auto space-y-2 rounded-xl border border-slate-100 p-3">
            {boundUsers.map((u) => (
              <label key={u.id} className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={selected.has(u.id)}
                  onChange={() => toggleUser(u.id)}
                  className="rounded border-slate-300"
                />
                <span className="text-slate-800">
                  {u.name}
                  {u.id === currentUserId ? ` (${s.you})` : ""}
                </span>
              </label>
            ))}
          </div>
        )}
      </fieldset>

      <label className="flex items-center gap-2 text-xs text-slate-600">
        <input
          type="checkbox"
          checked={notifyAttendees}
          onChange={(e) => setNotifyAttendees(e.target.checked)}
          className="rounded border-slate-300"
        />
        {s.notifyAttendees}
      </label>

      {error && <p className="text-xs text-red-600">{error}</p>}

      <button
        type="submit"
        disabled={
          pending ||
          !googleMeetConnected ||
          !wecomScheduleConfigured ||
          boundUsers.length === 0 ||
          !customerEmailOk ||
          !emailSubject.trim()
        }
        className="w-full rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
      >
        {pending ? invite.submitting : invite.submit}
      </button>
    </form>
  );
}
