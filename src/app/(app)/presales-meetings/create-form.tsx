"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createPresalesMeetingAction } from "@/lib/presales-meeting/actions";
import { useMessages } from "@/lib/i18n/context";

type UserOpt = { id: string; name: string };
type CustomerOpt = { id: string; name: string };
type ProjectOpt = { id: string; name: string; customerId: string };

type AgendaRow = {
  key: string;
  userId: string;
  customerId: string;
  projectId: string;
  customerQuery: string;
};

export function CreatePresalesMeetingForm({
  users,
  customers,
  projects,
}: {
  users: UserOpt[];
  customers: CustomerOpt[];
  projects: ProjectOpt[];
}) {
  const t = useMessages().presalesMeeting;
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [scheduledAt, setScheduledAt] = useState("");
  const [attendees, setAttendees] = useState<string[]>([]);
  const [rows, setRows] = useState<AgendaRow[]>([
    { key: "1", userId: "", customerId: "", projectId: "", customerQuery: "" },
  ]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const projectsByCustomer = useMemo(() => {
    const map = new Map<string, ProjectOpt[]>();
    for (const p of projects) {
      const list = map.get(p.customerId) ?? [];
      list.push(p);
      map.set(p.customerId, list);
    }
    return map;
  }, [projects]);

  function updateRow(key: string, patch: Partial<AgendaRow>) {
    setRows((prev) => prev.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  }

  function submit() {
    void (async () => {
      setBusy(true);
      setError(null);
      try {
        const items = rows
          .map((r) => ({
            userId: r.userId,
            customerId: r.customerId,
            projectId: r.projectId,
          }))
          .filter((r) => r.userId && r.customerId && r.projectId);
        if (!items.length) {
          setError(t.needItem);
          return;
        }
        const res = await createPresalesMeetingAction({
          title: title.trim() || undefined,
          scheduledAt: scheduledAt || undefined,
          attendeeUserIds: attendees,
          items,
        });
        if (res.error) {
          setError(res.error);
          return;
        }
        if (res.id) {
          setOpen(false);
          router.push(`/presales-meetings/${res.id}`);
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setBusy(false);
      }
    })();
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-lg bg-slate-900 text-white px-4 py-2 text-sm hover:bg-slate-800"
      >
        {t.create}
      </button>
    );
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-4 shadow-sm max-w-3xl">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold text-slate-800">{t.createTitle}</h3>
        <button type="button" className="text-xs text-slate-500 hover:text-slate-800" onClick={() => setOpen(false)}>
          {t.cancel}
        </button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block space-y-1 sm:col-span-2">
          <span className="text-xs text-slate-500">{t.meetingTitle}</span>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={t.meetingTitlePh}
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
          />
        </label>
        <label className="block space-y-1">
          <span className="text-xs text-slate-500">{t.scheduledAt}</span>
          <input
            type="datetime-local"
            value={scheduledAt}
            onChange={(e) => setScheduledAt(e.target.value)}
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
          />
        </label>
        <label className="block space-y-1">
          <span className="text-xs text-slate-500">{t.attendees}</span>
          <select
            multiple
            value={attendees}
            onChange={(e) =>
              setAttendees(Array.from(e.target.selectedOptions).map((o) => o.value))
            }
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm min-h-[88px]"
          >
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium text-slate-600">{t.agendaItems}</span>
          <button
            type="button"
            className="text-xs text-sky-700 hover:underline"
            onClick={() =>
              setRows((prev) => [
                ...prev,
                {
                  key: String(Date.now()),
                  userId: "",
                  customerId: "",
                  projectId: "",
                  customerQuery: "",
                },
              ])
            }
          >
            {t.addItem}
          </button>
        </div>
        {rows.map((row) => {
          const filteredCustomers = customers.filter((c) =>
            !row.customerQuery.trim()
              ? true
              : c.name.toLowerCase().includes(row.customerQuery.trim().toLowerCase()),
          );
          const custProjects = row.customerId
            ? (projectsByCustomer.get(row.customerId) ?? [])
            : [];
          return (
            <div
              key={row.key}
              className="grid gap-2 sm:grid-cols-[1fr_1fr_1fr_auto] rounded-lg border border-slate-100 bg-slate-50/60 p-3"
            >
              <label className="block space-y-1">
                <span className="text-[11px] text-slate-500">{t.who}</span>
                <select
                  value={row.userId}
                  onChange={(e) => updateRow(row.key, { userId: e.target.value })}
                  className="w-full rounded-md border border-slate-200 bg-white px-2 py-1.5 text-sm"
                >
                  <option value="">—</option>
                  {users.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block space-y-1">
                <span className="text-[11px] text-slate-500">{t.customer}</span>
                <input
                  value={row.customerQuery}
                  onChange={(e) => updateRow(row.key, { customerQuery: e.target.value })}
                  placeholder={t.searchCustomer}
                  className="w-full rounded-md border border-slate-200 bg-white px-2 py-1.5 text-sm mb-1"
                />
                <select
                  value={row.customerId}
                  onChange={(e) =>
                    updateRow(row.key, {
                      customerId: e.target.value,
                      projectId: "",
                    })
                  }
                  className="w-full rounded-md border border-slate-200 bg-white px-2 py-1.5 text-sm"
                >
                  <option value="">—</option>
                  {filteredCustomers.slice(0, 80).map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block space-y-1">
                <span className="text-[11px] text-slate-500">{t.project}</span>
                <select
                  value={row.projectId}
                  disabled={!row.customerId}
                  onChange={(e) => updateRow(row.key, { projectId: e.target.value })}
                  className="w-full rounded-md border border-slate-200 bg-white px-2 py-1.5 text-sm disabled:opacity-40"
                >
                  <option value="">{t.selectProject}</option>
                  {custProjects.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </label>
              <button
                type="button"
                className="self-end text-[11px] text-slate-400 hover:text-red-600 pb-2"
                onClick={() => setRows((prev) => (prev.length <= 1 ? prev : prev.filter((r) => r.key !== row.key)))}
              >
                {t.removeItem}
              </button>
            </div>
          );
        })}
      </div>

      {error ? <p className="text-sm text-red-600">{error}</p> : null}
      <button
        type="button"
        disabled={busy}
        onClick={submit}
        className="rounded-lg bg-sky-700 text-white px-4 py-2 text-sm hover:bg-sky-800 disabled:opacity-40"
      >
        {t.submit}
      </button>
    </div>
  );
}
