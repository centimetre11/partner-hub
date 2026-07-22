"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition, type MouseEvent } from "react";
import { deletePartnerReviewMeetingAction } from "@/lib/partner-review/actions";
import { useMessages } from "@/lib/i18n/context";
import { formatMsg } from "@/lib/i18n/messages";

export function DeleteMeetingButton({
  meetingId,
  meetingTitle,
  redirectTo,
  className = "",
}: {
  meetingId: string;
  meetingTitle: string;
  /** 删除后跳转；默认留在当前列表并 refresh */
  redirectTo?: string;
  className?: string;
}) {
  const t = useMessages().partnerReview;
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function onDelete(e: MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (!window.confirm(formatMsg(t.deleteConfirm, { title: meetingTitle }))) return;
    startTransition(async () => {
      setError(null);
      const res = await deletePartnerReviewMeetingAction(meetingId);
      if (res.error) {
        setError(res.error);
        return;
      }
      if (redirectTo) router.push(redirectTo);
      else router.refresh();
    });
  }

  return (
    <div className="shrink-0" onClick={(e) => e.stopPropagation()}>
      <button
        type="button"
        disabled={pending}
        onClick={onDelete}
        className={
          className ||
          "rounded-lg border border-red-200 px-2.5 py-1 text-xs text-red-600 hover:bg-red-50 disabled:opacity-40"
        }
      >
        {pending ? t.deleting : t.delete}
      </button>
      {error ? <p className="text-[11px] text-red-600 mt-1">{error}</p> : null}
    </div>
  );
}
