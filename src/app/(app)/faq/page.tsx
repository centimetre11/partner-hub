import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { PageHeader, fmtDateTime } from "@/components/ui";
import { getServerI18n, labelConstants } from "@/lib/server-i18n";
import { FaqLibrary, type FaqEntryView } from "@/components/faq-library";

export default async function FaqPage() {
  await requireUser();
  const { labels, messages: m, bcp47 } = await getServerI18n();
  const L = labelConstants(labels);
  const faq = m.faq;

  const rows = await db.faqEntry.findMany({
    orderBy: [{ verified: "desc" }, { updatedAt: "desc" }],
    include: { createdBy: true },
  });

  const categories = Object.entries(L.FAQ_CATEGORY_LABELS).map(([value, label]) => ({
    value,
    label,
  }));

  const entries: FaqEntryView[] = rows.map((r) => {
    const name = r.lastEditorName ?? r.createdBy?.name ?? "";
    const time = fmtDateTime(r.updatedAt, bcp47);
    const editorLabel = name
      ? faq.updatedBy.replace("{name}", name).replace("{time}", time)
      : faq.updatedAt.replace("{time}", time);
    const verifiedLabel =
      r.verified && r.verifiedByName && r.verifiedAt
        ? faq.verifiedBy
            .replace("{name}", r.verifiedByName)
            .replace("{time}", fmtDateTime(r.verifiedAt, bcp47))
        : "";
    return {
      id: r.id,
      question: r.question,
      answer: r.answer,
      category: r.category,
      editorLabel,
      verified: r.verified,
      verifiedLabel,
    };
  });

  return (
    <div className="pb-16">
      <PageHeader title={faq.title} desc={faq.desc} />
      <div className="px-8 max-w-5xl">
        <FaqLibrary entries={entries} categories={categories} m={faq} />
      </div>
    </div>
  );
}
