"use server";

import { revalidatePath } from "next/cache";
import { db } from "./db";
import { requireUser } from "./session";
import { fetchLinkPreview } from "./link-preview";
import { scanPartnerSentiment, type ScanResult } from "./sentiment-monitor";
import { MONITOR_DIMENSIONS } from "./constants";

function inferSourceType(url: string): string {
  const u = url.toLowerCase();
  if (u.includes("linkedin.com")) return "LINKEDIN";
  if (u.includes("facebook.com") || u.includes("fb.com")) return "FACEBOOK";
  if (u.includes("twitter.com") || u.includes("x.com")) return "X";
  return "CUSTOM";
}

function domainOf(url: string): string | null {
  try {
    return new URL(url.startsWith("http") ? url : `https://${url}`).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

export async function addMonitorSourceAction(partnerId: string, formData: FormData) {
  await requireUser();
  let url = String(formData.get("url") ?? "").trim();
  const label = String(formData.get("label") ?? "").trim();
  if (!url) return;
  if (!/^https?:\/\//i.test(url)) url = `https://${url}`;

  const domain = domainOf(url);
  const sourceType = inferSourceType(url);

  // 抓取链接预览（标题/缩略图），失败不阻塞
  let title: string | null = null;
  let thumbnailUrl: string | null = null;
  try {
    const preview = await fetchLinkPreview(url);
    title = preview.title || null;
    thumbnailUrl = preview.thumbnailUrl;
  } catch {
    /* ignore */
  }

  await db.monitorSource.create({
    data: {
      partnerId,
      label: label || title || domain || url,
      url,
      sourceType,
      domain,
      title,
      thumbnailUrl,
    },
  });
  revalidatePath(`/partners/${partnerId}`);
}

export async function toggleMonitorSourceAction(partnerId: string, sourceId: string) {
  await requireUser();
  const s = await db.monitorSource.findUnique({ where: { id: sourceId } });
  if (!s) return;
  await db.monitorSource.update({ where: { id: sourceId }, data: { enabled: !s.enabled } });
  revalidatePath(`/partners/${partnerId}`);
}

export async function deleteMonitorSourceAction(partnerId: string, sourceId: string) {
  await requireUser();
  await db.monitorSource.delete({ where: { id: sourceId } });
  revalidatePath(`/partners/${partnerId}`);
}

export async function archiveMonitorItemAction(partnerId: string, itemId: string) {
  await requireUser();
  await db.monitorItem.update({ where: { id: itemId }, data: { status: "ARCHIVED" } });
  revalidatePath(`/partners/${partnerId}`);
}

export async function setPartnerMonitorDimsAction(partnerId: string, dims: string[]) {
  await requireUser();
  const valid = dims.filter((d) => MONITOR_DIMENSIONS.includes(d));
  await db.partner.update({
    where: { id: partnerId },
    data: { monitorDims: JSON.stringify(valid) },
  });
  revalidatePath(`/partners/${partnerId}`);
}

export async function runSentimentScanAction(partnerId: string, dims?: string[]): Promise<ScanResult> {
  const user = await requireUser();
  const validDims = Array.isArray(dims) ? dims.filter((d) => MONITOR_DIMENSIONS.includes(d)) : undefined;
  const result = await scanPartnerSentiment(partnerId, {
    userId: user.id,
    ...(validDims && validDims.length ? { dims: validDims } : {}),
  });
  revalidatePath(`/partners/${partnerId}`);
  return result;
}
