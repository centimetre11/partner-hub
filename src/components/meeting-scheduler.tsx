"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useMessages } from "@/lib/i18n/context";
import { createMeetingAction, type CreateMeetingResult } from "@/lib/meeting-actions";

type BoundUser = { id: string; name: string };

const input =
  "box-border w-full min-w-0 max-w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400";

function defaultStartLocal(): string {
  const d = new Date();
  d.setMinutes(0, 0, 0);
  d.setHours(d.getHours() + 1);
  return toLocalInput(d);
}

function defaultEndLocal(): string {
  const d = new Date();
  d.setMinutes(0, 0, 0);
  d.setHours(d.getHours() + 2);
  return toLocalInput(d);
}

function toLocalInput(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function MobileDrawer({
  open,
  onClose,
  title,
  titleId,
  saving,
  cancelLabel,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  titleId: string;
  saving?: boolean;
  cancelLabel: string;
  children: React.ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  if (!open) return null;

  return (
    <>
      <button
        type="button"
        aria-label={cancelLabel}
        className="fixed inset-0 z-40 bg-slate-950/40"
        onClick={() => !saving && onClose()}
      />
      <div
        role="dialog"
        aria-modal
        aria-labelledby={titleId}
        className="fixed inset-x-0 bottom-0 z-50 box-border flex max-h-[96dvh] w-full max-w-full flex-col overflow-hidden rounded-t-[1.75rem] border border-slate-200 bg-white shadow-2xl"
        style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
      >
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-slate-100 px-4 py-3">
          <h2 id={titleId} className="min-w-0 text-base font-semibold text-slate-900">
            {title}
          </h2>
          <button
            type="button"
            disabled={saving}
            onClick={onClose}
            className="shrink-0 rounded-full px-2 text-2xl leading-none text-slate-400 hover:text-slate-700 disabled:opacity-50"
            aria-label={cancelLabel}
          >
            ×
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4">{children}</div>
      </div>
    </>
  );
}

function MeetingForm({
  currentUserId,
  googleMeetConnected,
  wecomScheduleConfigured,
  boundUsers,
  onSuccess,
}: {
  currentUserId: string;
  googleMeetConnected: boolean;
  wecomScheduleConfigured: boolean;
  boundUsers: BoundUser[];
  onSuccess?: (result: Extract<CreateMeetingResult, { ok: true }>) => void;
}) {
  const m = useMessages();
  const s = m.meetingScheduler;
  const [title, setTitle] = useState("");
  const [startAt, setStartAt] = useState(defaultStartLocal);
  const [endAt, setEndAt] = useState(defaultEndLocal);
  const [selected, setSelected] = useState<Set<string>>(() => new Set([currentUserId]));
  const [notifyAttendees, setNotifyAttendees] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Extract<CreateMeetingResult, { ok: true }> | null>(null);
  const [copied, setCopied] = useState(false);
  const [pending, start] = useTransition();

  const timeZone = useMemo(
    () => (typeof Intl !== "undefined" ? Intl.DateTimeFormat().resolvedOptions().timeZone : "UTC"),
    [],
  );

  function toggleUser(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setResult(null);
    const fd = new FormData();
    fd.set("title", title);
    fd.set("startAt", startAt);
    fd.set("endAt", endAt);
    fd.set("timeZone", timeZone);
    fd.set("notifyAttendees", notifyAttendees ? "true" : "false");
    for (const id of selected) fd.append("attendeeUserIds", id);

    start(async () => {
      const res = await createMeetingAction(fd);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setResult(res);
      onSuccess?.(res);
    });
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

  if (result) {
    return (
      <div className="space-y-4 text-sm">
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-emerald-900">
          <div className="font-medium">{s.successTitle}</div>
          <p className="mt-1 text-xs text-emerald-800">{s.wecomCreated.replace("{id}", result.wecomScheduleId)}</p>
        </div>
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
        {result.warnings.length > 0 && (
          <ul className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900 space-y-1">
            {result.warnings.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        )}
        <button
          type="button"
          onClick={() => {
            setResult(null);
            setTitle("");
          }}
          className="rounded-xl border border-slate-200 px-4 py-2 text-sm text-slate-700 hover:border-slate-300"
        >
          {s.createAnother}
        </button>
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

      <label className="block space-y-1">
        <span className="text-xs text-slate-500">{s.title}</span>
        <input
          required
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder={s.titlePlaceholder}
          className={input}
        />
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
        disabled={pending || !googleMeetConnected || !wecomScheduleConfigured || boundUsers.length === 0}
        className="w-full rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
      >
        {pending ? s.submitting : s.submit}
      </button>
    </form>
  );
}

export function MeetingScheduler({
  currentUserId,
  googleMeetConnected,
  wecomScheduleConfigured,
  boundUsers,
  variant,
  autoOpen = false,
}: {
  currentUserId: string;
  googleMeetConnected: boolean;
  wecomScheduleConfigured: boolean;
  boundUsers: BoundUser[];
  variant: "card" | "drawer";
  autoOpen?: boolean;
}) {
  const m = useMessages();
  const s = m.meetingScheduler;
  const [open, setOpen] = useState(autoOpen);

  const form = (
    <MeetingForm
      currentUserId={currentUserId}
      googleMeetConnected={googleMeetConnected}
      wecomScheduleConfigured={wecomScheduleConfigured}
      boundUsers={boundUsers}
      onSuccess={variant === "drawer" ? undefined : undefined}
    />
  );

  if (variant === "card") {
    return (
      <div>
        <div className="font-medium text-slate-800">{s.cardTitle}</div>
        <p className="text-xs text-slate-400 mt-0.5 mb-3">{s.cardDesc}</p>
        {form}
      </div>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
      >
        {s.openButton}
      </button>
      <MobileDrawer
        open={open}
        onClose={() => setOpen(false)}
        title={s.drawerTitle}
        titleId="meeting-scheduler-title"
        cancelLabel={m.common.cancel}
      >
        {form}
      </MobileDrawer>
    </>
  );
}
