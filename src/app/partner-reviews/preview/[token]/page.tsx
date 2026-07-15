import { notFound } from "next/navigation";
import { PrepBriefReadonly } from "@/components/partner-review/prep-brief-readonly";
import { getMeetingForPreview } from "@/lib/partner-review/preview-token";
import { parseConfirmedSnapshot, type PartnerPrepBrief } from "@/lib/partner-review/types";

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

  const isFinal = meeting.status === "DONE";
  const scheduled = meeting.scheduledAt
    ? meeting.scheduledAt.toLocaleString("zh-CN", { hour12: false })
    : null;
  const prepAt = meeting.prepGeneratedAt
    ? meeting.prepGeneratedAt.toLocaleString("zh-CN", { hour12: false })
    : null;
  const endedAt = meeting.endedAt
    ? meeting.endedAt.toLocaleString("zh-CN", { hour12: false })
    : null;

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 py-6">
          <p className="text-xs font-medium uppercase tracking-wide text-sky-700">
            {isFinal ? "过伙伴 · 会议报告" : "过伙伴 · 会前预览"}
          </p>
          <h1 className="text-2xl font-bold text-slate-900 mt-1">{meeting.title}</h1>
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-slate-500">
            <span>{meeting.items.length} 个伙伴</span>
            <span>发起人 {meeting.createdBy.name}</span>
            {scheduled ? <span>计划 {scheduled}</span> : null}
            {prepAt && !isFinal ? <span>简报更新 {prepAt}</span> : null}
            {endedAt && isFinal ? <span>结束 {endedAt}</span> : null}
          </div>
          <p className="mt-3 text-sm text-slate-600 leading-relaxed">
            {isFinal
              ? "以下为会前摘要、近两周进展总结与后续待办，供会后回顾与分享。"
              : "以下为今日议程与各伙伴会前简报（近两周进展、商机与推荐议题），供会前阅读。正式讨论在腾讯会议进行。"}
          </p>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 sm:px-6 py-8 space-y-6">
        {meeting.items.map((item, idx) => {
          const brief = parseBrief(item.prepBrief);
          const snap = parseConfirmedSnapshot(item.confirmedSnapshot);
          const progress = snap?.coreNotes || item.coreNotes || "";
          const todos = snap?.todos ?? [];

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
              <div className="px-5 py-4 space-y-4">
                {isFinal ? (
                  <>
                    {brief?.summaryLine ? (
                      <div>
                        <div className="text-xs font-medium text-slate-500 mb-1">会前摘要</div>
                        <p className="text-sm text-slate-700 leading-relaxed">{brief.summaryLine}</p>
                      </div>
                    ) : null}
                    <div>
                      <div className="text-xs font-medium text-slate-500 mb-1">近两周进展总结</div>
                      <p className="text-sm text-slate-800 leading-relaxed whitespace-pre-wrap">
                        {progress.trim() || "（无）"}
                      </p>
                    </div>
                    <div>
                      <div className="text-xs font-medium text-slate-500 mb-1">后续待办</div>
                      {todos.length ? (
                        <ul className="space-y-2">
                          {todos.map((t, i) => (
                            <li
                              key={`${t.title}-${i}`}
                              className="rounded-lg border border-slate-100 px-3 py-2 text-sm"
                            >
                              <div className="font-medium text-slate-800">{t.title}</div>
                              {t.detail ? (
                                <p className="text-xs text-slate-500 mt-0.5 whitespace-pre-wrap">
                                  {t.detail}
                                </p>
                              ) : null}
                              {t.dueDate ? (
                                <p className="text-[11px] text-slate-400 mt-1">
                                  截止 {t.dueDate.slice(0, 10)}
                                </p>
                              ) : null}
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p className="text-sm text-slate-400">（无）</p>
                      )}
                    </div>
                  </>
                ) : brief ? (
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
        Partner Hub · {isFinal ? "会议报告分享" : "内部会前预览"}
      </footer>
    </div>
  );
}
