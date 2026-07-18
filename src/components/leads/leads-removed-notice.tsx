import { getServerI18n } from "@/lib/server-i18n";

export async function LeadsRemovedNotice({ show }: { show: boolean }) {
  if (!show) return null;
  const { messages: m } = await getServerI18n();

  return (
    <div
      role="status"
      className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950"
    >
      {m.leads.refreshedRemoved}
    </div>
  );
}
