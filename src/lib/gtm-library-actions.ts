"use server";

import { revalidatePath } from "next/cache";
import { db } from "./db";
import { requireUser } from "./session";
import { parseIndustries, stringifyIndustries } from "./taxonomy";

export type GtmLibraryRow = {
  id: string;
  title: string;
  playbook: string | null;
  pitch: string | null;
  industries: string | null;
  valuePattern: string | null;
  partnerArchetype: string | null;
  category: string | null;
  notes: string | null;
  version: number;
  groupId: string;
  sourcePartnerName: string | null;
  updatedAt: Date;
};

/** 搜索打法库（返回每组最新版本，供伙伴页参考选用） */
export async function searchGtmLibraryAction(q: string): Promise<GtmLibraryRow[]> {
  await requireUser();
  const query = q.trim();
  const all = await db.gtmLibrary.findMany({
    where: query
      ? {
          OR: [
            { title: { contains: query } },
            { playbook: { contains: query } },
            { pitch: { contains: query } },
            { notes: { contains: query } },
            { sourcePartnerName: { contains: query } },
          ],
        }
      : undefined,
    orderBy: [{ groupId: "asc" }, { version: "desc" }],
  });
  const latest = new Map<string, (typeof all)[0]>();
  for (const row of all) {
    if (!latest.has(row.groupId)) latest.set(row.groupId, row);
  }
  return [...latest.values()]
    .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())
    .map((r) => ({
      id: r.id,
      title: r.title,
      playbook: r.playbook,
      pitch: r.pitch,
      industries: r.industries,
      valuePattern: r.valuePattern,
      partnerArchetype: r.partnerArchetype,
      category: r.category,
      notes: r.notes,
      version: r.version,
      groupId: r.groupId,
      sourcePartnerName: r.sourcePartnerName,
      updatedAt: r.updatedAt,
    }));
}

/** 获取某组全部版本 */
export async function getGtmLibraryVersionsAction(groupId: string) {
  await requireUser();
  return db.gtmLibrary.findMany({
    where: { groupId },
    orderBy: { version: "desc" },
    include: { createdBy: { select: { name: true } } },
  });
}

export async function savePartnerGtmAction(
  partnerId: string,
  playbook: string,
  pitch: string,
) {
  await requireUser();
  await db.partner.update({
    where: { id: partnerId },
    data: {
      playbook: playbook.trim() || null,
      pitch: pitch.trim() || null,
    },
  });
  revalidatePath(`/partners/${partnerId}`);
}

export type SaveToLibraryMode = "new" | "replace" | "version";

/** 将当前内容存入打法库 */
export async function saveToGtmLibraryAction(
  partnerId: string,
  formData: FormData,
): Promise<{ ok: true; id: string } | { error: string }> {
  const user = await requireUser();
  const title = String(formData.get("title") ?? "").trim();
  const playbook = String(formData.get("playbook") ?? "").trim();
  const pitch = String(formData.get("pitch") ?? "").trim();
  const mode = String(formData.get("mode") ?? "new") as SaveToLibraryMode;
  const targetId = String(formData.get("targetId") ?? "").trim();

  if (!title) return { error: "Please enter a title" };
  if (!playbook && !pitch) return { error: "Fill in at least one of playbook or pitch" };

  const partner = await db.partner.findUnique({ where: { id: partnerId } });
  if (!partner) return { error: "Partner not found" };

  const industryCodes = parseIndustries(partner);
  const meta = {
    playbook: playbook || null,
    pitch: pitch || null,
    industries: stringifyIndustries(industryCodes),
    valuePattern: String(formData.get("valuePattern") ?? "").trim() || partner.valuePattern || null,
    partnerArchetype: String(formData.get("partnerArchetype") ?? "").trim() || partner.partnerArchetype || null,
    category: String(formData.get("category") ?? "").trim() || partner.category || null,
    notes: String(formData.get("notes") ?? "").trim() || null,
    sourcePartnerId: partnerId,
    sourcePartnerName: partner.name,
  };

  if (mode === "replace") {
    if (!targetId) return { error: "Please select an entry to replace" };
    const target = await db.gtmLibrary.findUnique({ where: { id: targetId } });
    if (!target) return { error: "Target entry not found" };
    await db.gtmLibrary.update({
      where: { id: targetId },
      data: { title, ...meta },
    });
    revalidatePath("/playbook-library");
    revalidatePath(`/partners/${partnerId}`);
    return { ok: true, id: targetId };
  }

  if (mode === "version") {
    if (!targetId) return { error: "Please select an entry to add a version to" };
    const target = await db.gtmLibrary.findUnique({ where: { id: targetId } });
    if (!target) return { error: "Target entry not found" };
    const maxVer = await db.gtmLibrary.aggregate({
      where: { groupId: target.groupId },
      _max: { version: true },
    });
    const created = await db.gtmLibrary.create({
      data: {
        title,
        ...meta,
        groupId: target.groupId,
        version: (maxVer._max.version ?? target.version) + 1,
        createdById: user.id,
      },
    });
    revalidatePath("/playbook-library");
    revalidatePath(`/partners/${partnerId}`);
    return { ok: true, id: created.id };
  }

  const created = await db.gtmLibrary.create({
    data: {
      title,
      ...meta,
      groupId: "",
      version: 1,
      createdById: user.id,
    },
  });
  await db.gtmLibrary.update({
    where: { id: created.id },
    data: { groupId: created.id },
  });
  revalidatePath("/playbook-library");
  revalidatePath(`/partners/${partnerId}`);
  return { ok: true, id: created.id };
}

export async function deleteGtmLibraryAction(id: string) {
  await requireUser();
  await db.gtmLibrary.delete({ where: { id } });
  revalidatePath("/playbook-library");
}
