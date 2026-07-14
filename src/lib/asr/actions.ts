"use server";

import { revalidatePath } from "next/cache";
import { requireSuperAdmin } from "../session";
import { db } from "../db";
import { parseCorrectionRules, parseHotwords } from "./types";

function clean(v: FormDataEntryValue | null) {
  return String(v ?? "").trim();
}

export async function saveSystemAsrConfigAction(formData: FormData) {
  try {
    await requireSuperAdmin();
    const realtimeEnabled = clean(formData.get("realtimeEnabled")) === "true";
    const llmCorrectEnabled = clean(formData.get("llmCorrectEnabled")) !== "false";
    const includePartnerNames = clean(formData.get("includePartnerNames")) !== "false";
    let chunkSeconds = parseInt(clean(formData.get("chunkSeconds")) || "12", 10);
    if (!Number.isFinite(chunkSeconds)) chunkSeconds = 12;
    chunkSeconds = Math.min(30, Math.max(8, chunkSeconds));
    const language = clean(formData.get("language")) || "auto";
    const basePrompt = clean(formData.get("basePrompt"));
    const hotwords = clean(formData.get("hotwords"));
    const correctionRules = clean(formData.get("correctionRules"));

    parseHotwords(hotwords);
    parseCorrectionRules(correctionRules);

    await db.systemAsrConfig.upsert({
      where: { id: "singleton" },
      create: {
        id: "singleton",
        realtimeEnabled,
        chunkSeconds,
        language,
        basePrompt: basePrompt || null,
        hotwords: hotwords || null,
        correctionRules: correctionRules || null,
        llmCorrectEnabled,
        includePartnerNames,
      },
      update: {
        realtimeEnabled,
        chunkSeconds,
        language,
        basePrompt: basePrompt || null,
        hotwords: hotwords || null,
        correctionRules: correctionRules || null,
        llmCorrectEnabled,
        includePartnerNames,
      },
    });

    revalidatePath("/settings");
    revalidatePath("/partner-reviews");
    return { ok: true, message: "识别优化配置已保存" };
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}
