"use client";

export function DeletePartnerButton({
  partnerName,
  action,
}: {
  partnerName: string;
  action: () => Promise<void>;
}) {
  return (
    <form
      action={action}
      onSubmit={(e) => {
        if (
          !confirm(
            `Are you sure you want to permanently delete "${partnerName}"? This cannot be undone — contacts, opportunities, timeline events, and related data will also be deleted.`,
          )
        ) {
          e.preventDefault();
        }
      }}
    >
      <button
        type="submit"
        className="rounded-md border border-red-100 px-2.5 py-1 text-xs text-red-500 hover:bg-red-50"
        title="Permanently delete from database"
      >
        Delete
      </button>
    </form>
  );
}
