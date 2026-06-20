"use client";

import { useTransition } from "react";
import type { FeedbackSubmission, User, Asset } from "@prisma/client";
import { updateFeedbackStatusAction } from "@/lib/feedback-actions";
import { Badge, EmptyState, fmtDateTime } from "@/components/ui";
import { useMessages } from "@/lib/i18n/context";

type FeedbackRow = FeedbackSubmission & {
  createdBy: Pick<User, "name" | "email">;
  assets: { asset: Pick<Asset, "id" | "filename" | "mimeType" | "kind"> }[];
};

const STATUS_TONES: Record<string, "amber" | "blue" | "green" | "zinc"> = {
  OPEN: "amber",
  IN_PROGRESS: "blue",
  RESOLVED: "green",
  CLOSED: "zinc",
};

function FeedbackItem({ item, bcp47 }: { item: FeedbackRow; bcp47: string }) {
  const m = useMessages();
  const [pending, startTransition] = useTransition();

  const statusLabel =
    item.status === "OPEN"
      ? m.feedback.statusOpen
      : item.status === "IN_PROGRESS"
        ? m.feedback.statusInProgress
        : item.status === "RESOLVED"
          ? m.feedback.statusResolved
          : m.feedback.statusClosed;

  function changeStatus(status: string) {
    startTransition(async () => {
      const fd = new FormData();
      fd.set("status", status);
      await updateFeedbackStatusAction(item.id, fd);
    });
  }

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-semibold text-slate-900">{item.createdBy.name}</span>
            <Badge tone={STATUS_TONES[item.status] ?? "zinc"}>{statusLabel}</Badge>
          </div>
          <div className="text-xs text-slate-400 mt-1">
            {item.createdBy.email} · {fmtDateTime(item.createdAt, bcp47)}
          </div>
          {item.description ? (
            <p className="text-sm text-slate-600 mt-2 whitespace-pre-wrap">{item.description}</p>
          ) : (
            <p className="text-sm text-slate-400 mt-2 italic">{m.feedback.screenshotOnly}</p>
          )}
          {item.assets.length > 0 && (
            <div className="flex flex-wrap gap-2 mt-3">
              {item.assets.map(({ asset }) => {
                const isImage = asset.mimeType.startsWith("image/");
                const href = `/api/assets/${asset.id}`;
                return isImage ? (
                  <a key={asset.id} href={href} target="_blank" rel="noopener noreferrer">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={href}
                      alt={asset.filename}
                      className="h-20 w-20 rounded-lg object-cover border border-slate-200 hover:border-slate-300"
                    />
                  </a>
                ) : (
                  <a
                    key={asset.id}
                    href={href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-sky-600 hover:underline"
                  >
                    📎 {asset.filename}
                  </a>
                );
              })}
            </div>
          )}
        </div>
        <select
          value={item.status}
          disabled={pending}
          onChange={(e) => changeStatus(e.target.value)}
          className="rounded-lg border border-slate-200 px-2 py-1.5 text-xs text-slate-700 shrink-0 disabled:opacity-50"
        >
          <option value="OPEN">{m.feedback.statusOpen}</option>
          <option value="IN_PROGRESS">{m.feedback.statusInProgress}</option>
          <option value="RESOLVED">{m.feedback.statusResolved}</option>
          <option value="CLOSED">{m.feedback.statusClosed}</option>
        </select>
      </div>
    </div>
  );
}

export function FeedbackList({ items, bcp47 }: { items: FeedbackRow[]; bcp47: string }) {
  const m = useMessages();
  if (!items.length) return <EmptyState text={m.feedback.emptyAdmin} />;

  return (
    <div className="space-y-3">
      {items.map((item) => (
        <FeedbackItem key={item.id} item={item} bcp47={bcp47} />
      ))}
    </div>
  );
}
