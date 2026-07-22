"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { deleteLeadReviewMeetingAction } from "@/lib/lead-review/actions";
import { useMessages } from "@/lib/i18n/context";
import { formatMsg } from "@/lib/i18n/messages";

export function DeleteLeadReviewButton({
  meetingId,
  meetingTitle,
}: {
  meetingId: string;
  meetingTitle: string;
}) {
  const m = useMessages().leadReview;
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <button
      type="button"
      disabled={pending}
      className="text-xs text-red-600 hover:underline disabled:opacity-40"
      onClick={() => {
        if (!confirm(formatMsg(m.deleteConfirm, { title: meetingTitle }))) return;
        startTransition(async () => {
          await deleteLeadReviewMeetingAction(meetingId);
          router.refresh();
        });
      }}
    >
      {m.delete}
    </button>
  );
}
