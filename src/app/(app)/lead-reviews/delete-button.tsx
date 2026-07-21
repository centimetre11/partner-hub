"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { deleteLeadReviewMeetingAction } from "@/lib/lead-review/actions";

export function DeleteLeadReviewButton({
  meetingId,
  meetingTitle,
}: {
  meetingId: string;
  meetingTitle: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <button
      type="button"
      disabled={pending}
      className="text-xs text-red-600 hover:underline disabled:opacity-40"
      onClick={() => {
        if (!confirm(`确定删除「${meetingTitle}」？`)) return;
        startTransition(async () => {
          await deleteLeadReviewMeetingAction(meetingId);
          router.refresh();
        });
      }}
    >
      删除
    </button>
  );
}
