import { notFound } from "next/navigation";
import { PrepBriefReadonly } from "@/components/partner-review/prep-brief-readonly";
import { getMeetingForPreview } from "@/lib/partner-review/preview-token";
import type { PartnerPrepBrief } from "@/lib/partner-review/types";

function parseBrief(raw: string | null): PartnerPrepBrief | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as PartnerPrepBrief;
  } catch {
    return null;
  }
}

export default async function PartnerReviewPreviewPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const meeting = await getMeetingForPreview(token);
  if (!meeting) notFound();

  const scheduled = meeting.scheduledAt
    ? meeting.scheduledAt.toLocaleString("zh-CN", { hour12: false })
    : null;
  const prepAt = meeting.prepGeneratedAt
    ? meeting.prepGeneratedAt.toLocaleString("zh-CN", { hour12: false })
    : null;

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 py-6">
          <p className="text-xs font-medium uppercase tracking-wide text-sky-700">过伙伴 · 会前预览</p>
          <h1 className="text-2xl font-bold text-slate-900 mt-1">{meeting.title}</h1>
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-slate-500">
            <span>{meeting.items.length} 个伙伴</span>
            <span>发起人 {meeting.createdBy.name}</span>
            {scheduled ? <span>计划 {scheduled}</span> : null}
            {prepAt ? <span>简报更新 {prepAt}</span> : null}
          </div>
          <p className="mt-3 text-sm text-slate-600 leading-relaxed">
            以下为今日议程与各伙伴会前简报（近两周进展、商机与推荐议题），供会前阅读。正式讨论在腾讯会议进行。
          </p>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 sm:px-6 py-8 space-y-6">
        {meeting.items.map((item, idx) => {
          const brief = parseBrief(item.prepBrief);
          return (
            <article
              key={item.id}
              className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden"
            >
              <div className="px-5 py-4 border-b border-slate-100 bg-slate-50/80">
                <div className="flex items-baseline gap-3">
                  <span className="text-sm font-mono text-slate-400">{idx + 1}</span>
                  <div>
                    <h2 className="text-lg font-semibold text-slate-900">{item.partner.name}</h2>
                    {item.partner.tier ? (
                      <p className="text-xs text-slate-500 mt-0.5">Tier {item.partner.tier}</p>
                    ) : null}
                  </div>
                </div>
                {brief?.windowLabel ? (
                  <p className="text-xs text-slate-500 mt-2 ml-7">数据窗口 {brief.windowLabel}</p>
                ) : null}
              </div>
              <div className="px-5 py-4">
                {brief ? (
                  <PrepBriefReadonly brief={brief} />
                ) : (
                  <p className="text-sm text-slate-400">尚未生成会前简报</p>
                )}
              </div>
            </article>
          );
        })}
      </main>

      <footer className="max-w-3xl mx-auto px-4 sm:px-6 pb-10 text-center text-xs text-slate-400">
        Partner Hub · 内部会前预览
      </footer>
    </div>
  );
}
