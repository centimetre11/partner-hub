import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { PageHeader } from "@/components/ui";
import { ImportClient } from "./import-client";

export default async function ImportPage({
  searchParams,
}: {
  searchParams: Promise<{ partnerId?: string }>;
}) {
  await requireUser();
  const sp = await searchParams;
  const partners = await db.partner.findMany({
    where: { status: { not: "ARCHIVED" } },
    select: { id: true, name: true, status: true },
    orderBy: { name: "asc" },
  });

  return (
    <div className="pb-16">
      <PageHeader
        title="AI 信息投喂"
        desc="把聊天记录（WhatsApp/微信导出）、邮件、新闻、LinkedIn 页面文本粘贴进来，AI 自动判断归属伙伴、抽取信息，确认后入库"
      />
      <div className="px-8">
        <ImportClient partners={partners} defaultPartnerId={sp.partnerId} />
      </div>
    </div>
  );
}
