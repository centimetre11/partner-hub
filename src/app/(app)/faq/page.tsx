import { Badge, Card, PageHeader } from "@/components/ui";
import { getServerI18n } from "@/lib/server-i18n";
import { requireUser } from "@/lib/session";

const categoryTones = ["blue", "purple", "green", "amber"] as const;

export default async function FaqPage() {
  await requireUser();
  const { messages: m } = await getServerI18n();
  const faq = m.faq;

  return (
    <div className="pb-16">
      <PageHeader title={faq.title} desc={faq.desc} />

      <div className="px-8 max-w-6xl space-y-6">
        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_320px] gap-5">
          <Card className="bg-gradient-to-br from-white to-sky-50/60">
            <div className="space-y-3">
              <Badge tone="indigo">{faq.categoryLabel}</Badge>
              <div>
                <h2 className="text-xl font-semibold text-slate-900">{faq.introTitle}</h2>
                <p className="mt-2 text-sm leading-6 text-slate-600">{faq.introDesc}</p>
              </div>
            </div>
          </Card>

          <Card title={faq.principlesTitle}>
            <ul className="space-y-3 text-sm text-slate-600">
              {faq.principles.map((principle) => (
                <li key={principle} className="flex gap-2">
                  <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-sky-500 shrink-0" />
                  <span>{principle}</span>
                </li>
              ))}
            </ul>
          </Card>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
          {faq.categories.map((category, categoryIndex) => {
            const tone = categoryTones[categoryIndex % categoryTones.length];

            return (
              <section key={category.title} className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
                <div className="px-5 py-4 border-b border-slate-100">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <h2 className="text-base font-semibold text-slate-900">{category.title}</h2>
                      <p className="mt-1 text-sm text-slate-500">{category.desc}</p>
                    </div>
                    <Badge tone={tone}>{category.items.length}</Badge>
                  </div>
                </div>

                <div className="divide-y divide-slate-100">
                  {category.items.map((item, itemIndex) => (
                    <details
                      key={item.question}
                      className="group px-5 py-4 open:bg-slate-50/60"
                      open={categoryIndex === 0 && itemIndex === 0}
                    >
                      <summary className="flex cursor-pointer list-none items-start justify-between gap-3">
                        <div>
                          <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                            {faq.questionLabel}
                          </div>
                          <h3 className="mt-1 text-sm font-medium text-slate-900">{item.question}</h3>
                        </div>
                        <span className="mt-1 text-slate-300 transition group-open:rotate-45">+</span>
                      </summary>

                      <div className="mt-4 space-y-4">
                        <div>
                          <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                            {faq.answerLabel}
                          </div>
                          <p className="mt-1 text-sm leading-6 text-slate-600">{item.answer}</p>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          <div className="rounded-lg border border-slate-100 bg-white px-3 py-2">
                            <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                              {faq.ownerLabel}
                            </div>
                            <div className="mt-1 text-sm text-slate-700">{item.owner}</div>
                          </div>
                          <div className="rounded-lg border border-slate-100 bg-white px-3 py-2">
                            <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                              {faq.nextActionLabel}
                            </div>
                            <div className="mt-1 text-sm text-slate-700">{item.nextAction}</div>
                          </div>
                        </div>
                      </div>
                    </details>
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      </div>
    </div>
  );
}
