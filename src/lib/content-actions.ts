"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "./db";
import { requireUser } from "./session";

function slugify(s: string) {
  const base = s.trim().toLowerCase().replace(/\s+/g, "-").replace(/[^\w\u4e00-\u9fff-]/g, "");
  return base || `article-${Date.now()}`;
}

// ============ Document ============

export async function upsertDocumentAction(formData: FormData) {
  const user = await requireUser();
  const id = String(formData.get("id") ?? "");
  const data = {
    title: String(formData.get("title") ?? "").trim(),
    type: String(formData.get("type") ?? "CUSTOM"),
    status: String(formData.get("status") ?? "DRAFT"),
    content: String(formData.get("content") ?? ""),
    partnerId: String(formData.get("partnerId") ?? "") || null,
    solutionId: String(formData.get("solutionId") ?? "") || null,
  };
  if (!data.title) return;
  let docId = id;
  if (id) {
    await db.document.update({ where: { id }, data });
  } else {
    const created = await db.document.create({ data: { ...data, createdById: user.id } });
    docId = created.id;
  }
  revalidatePath("/documents");
  if (data.partnerId) revalidatePath(`/partners/${data.partnerId}`);
  redirect(`/documents/${docId}`);
}

export async function deleteDocumentAction(id: string) {
  await requireUser();
  const d = await db.document.findUniqueOrThrow({ where: { id } });
  await db.document.delete({ where: { id } });
  revalidatePath("/documents");
  if (d.partnerId) revalidatePath(`/partners/${d.partnerId}`);
  redirect("/documents");
}

export async function saveNotificationAsDocumentAction(notificationId: string) {
  const user = await requireUser();
  const n = await db.notification.findUniqueOrThrow({
    where: { id: notificationId },
    include: { agentRun: { include: { agent: true } } },
  });
  const doc = await db.document.create({
    data: {
      title: n.title,
      type: "AGENT_BRIEF",
      content: n.content ?? "",
      partnerId: n.partnerId,
      agentRunId: n.agentRunId,
      notificationId: n.id,
      createdById: user.id,
    },
  });
  revalidatePath("/documents");
  revalidatePath("/inbox");
  redirect(`/documents/${doc.id}`);
}

// ============ Material ============

export async function upsertMaterialAction(formData: FormData) {
  const user = await requireUser();
  const id = String(formData.get("id") ?? "");
  const assetId = String(formData.get("assetId") ?? "") || null;
  const data = {
    title: String(formData.get("title") ?? "").trim(),
    description: String(formData.get("description") ?? "") || null,
    category: String(formData.get("category") ?? "OTHER"),
    body: String(formData.get("body") ?? "") || null,
    shared: formData.get("shared") === "on",
  };
  if (!data.title) return;
  let materialId = id;
  if (id) {
    // 编辑时若未重新上传/贴链接，则保留原附件
    await db.material.update({ where: { id }, data: assetId ? { ...data, assetId } : data });
  } else {
    const created = await db.material.create({ data: { ...data, assetId, createdById: user.id } });
    materialId = created.id;
  }
  revalidatePath("/materials");
  redirect(`/materials/${materialId}`);
}

export async function deleteMaterialAction(id: string) {
  await requireUser();
  await db.material.delete({ where: { id } });
  revalidatePath("/materials");
  redirect("/materials");
}

// ============ Knowledge ============

export async function upsertKnowledgeAction(formData: FormData) {
  const user = await requireUser();
  const id = String(formData.get("id") ?? "");
  const title = String(formData.get("title") ?? "").trim();
  const slugInput = String(formData.get("slug") ?? "").trim();
  const data = {
    title,
    slug: slugInput || slugify(title),
    category: String(formData.get("category") ?? "COMPANY"),
    content: String(formData.get("content") ?? ""),
    shared: formData.get("shared") === "on",
  };
  if (!data.title) return;
  let articleId = id;
  if (id) {
    await db.knowledgeArticle.update({ where: { id }, data });
  } else {
    const created = await db.knowledgeArticle.create({ data: { ...data, createdById: user.id } });
    articleId = created.id;
  }
  revalidatePath("/knowledge");
  redirect(`/knowledge/${articleId}`);
}

export async function deleteKnowledgeAction(id: string) {
  await requireUser();
  await db.knowledgeArticle.delete({ where: { id } });
  revalidatePath("/knowledge");
  redirect("/knowledge");
}

// ============ Solution ============

export async function upsertSolutionAction(partnerId: string, formData: FormData) {
  await requireUser();
  const id = String(formData.get("id") ?? "");
  const data = {
    name: String(formData.get("name") ?? "").trim(),
    targetCustomer: String(formData.get("targetCustomer") ?? "") || null,
    painPoint: String(formData.get("painPoint") ?? "") || null,
    fanruanOffer: String(formData.get("fanruanOffer") ?? "") || null,
    partnerOffer: String(formData.get("partnerOffer") ?? "") || null,
    pricingModel: String(formData.get("pricingModel") ?? "") || null,
    status: String(formData.get("status") ?? "DRAFT"),
    notes: String(formData.get("notes") ?? "") || null,
  };
  if (!data.name) return;
  if (id) await db.solution.update({ where: { id }, data });
  else await db.solution.create({ data: { ...data, partnerId } });
  revalidatePath(`/partners/${partnerId}`);
}

export async function deleteSolutionAction(partnerId: string, solutionId: string) {
  await requireUser();
  await db.solution.delete({ where: { id: solutionId } });
  revalidatePath(`/partners/${partnerId}`);
}

export async function linkSolutionAssetAction(partnerId: string, solutionId: string, assetId: string, label?: string) {
  await requireUser();
  await db.solutionAsset.upsert({
    where: { solutionId_assetId: { solutionId, assetId } },
    create: { solutionId, assetId, label },
    update: { label },
  });
  revalidatePath(`/partners/${partnerId}`);
}

export async function unlinkSolutionAssetAction(partnerId: string, solutionId: string, assetId: string) {
  await requireUser();
  await db.solutionAsset.delete({ where: { solutionId_assetId: { solutionId, assetId } } });
  revalidatePath(`/partners/${partnerId}`);
}

// ============ Document 附件 ============

export async function linkDocumentAssetAction(documentId: string, assetId: string, label?: string) {
  await requireUser();
  await db.documentAsset.upsert({
    where: { documentId_assetId: { documentId, assetId } },
    create: { documentId, assetId, label },
    update: { label },
  });
  revalidatePath(`/documents/${documentId}`);
}

export async function unlinkDocumentAssetAction(documentId: string, assetId: string) {
  await requireUser();
  await db.documentAsset.delete({ where: { documentId_assetId: { documentId, assetId } } });
  revalidatePath(`/documents/${documentId}`);
}

// ============ Skill ============

export async function upsertSkillAction(formData: FormData) {
  const user = await requireUser();
  const id = String(formData.get("id") ?? "");
  const data = {
    name: String(formData.get("name") ?? "").trim().replace(/\s+/g, "_").toLowerCase(),
    label: String(formData.get("label") ?? "").trim(),
    description: String(formData.get("description") ?? "") || null,
    kind: "PROMPT",
    promptBody: String(formData.get("promptBody") ?? "") || null,
    shared: formData.get("shared") === "on",
  };
  if (!data.name || !data.label) return;
  let skillId = id;
  if (id) {
    const s = await db.skill.findUniqueOrThrow({ where: { id } });
    if (s.isBuiltin) return;
    await db.skill.update({ where: { id }, data });
  } else {
    const created = await db.skill.create({ data: { ...data, createdById: user.id } });
    skillId = created.id;
  }
  revalidatePath("/skills");
  redirect(`/skills/${skillId}`);
}

export async function deleteSkillAction(id: string) {
  await requireUser();
  const s = await db.skill.findUniqueOrThrow({ where: { id } });
  if (s.isBuiltin) return;
  await db.skill.delete({ where: { id } });
  revalidatePath("/skills");
  redirect("/skills");
}

export async function cloneSkillAction(sourceId: string) {
  const user = await requireUser();
  const src = await db.skill.findUniqueOrThrow({ where: { id: sourceId } });
  const created = await db.skill.create({
    data: {
      name: `${src.name}_copy`,
      label: `${src.label} (copy)`,
      description: src.description,
      kind: src.kind,
      promptBody: src.promptBody,
      shared: true,
      createdById: user.id,
    },
  });
  revalidatePath("/skills");
  redirect(`/skills/${created.id}`);
}
