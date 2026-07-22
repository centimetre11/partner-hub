/** 可在 client / server 共用的简报文本工具（无 server-only） */

const CATEGORY_LABEL: Record<string, string> = {
  VISIT: "拜访",
  TRAINING: "培训",
  NEGOTIATION: "谈判",
  DELIVERY: "交付",
  RELATIONSHIP: "关系",
  OTHER: "进展",
};

export function categoryLabel(category: string): string {
  return CATEGORY_LABEL[category] ?? "进展";
}

/** 去掉重复短句，压缩空白 */
export function tidyProgressText(text: string | null | undefined, max = 360): string {
  let flat = (text ?? "").replace(/\s+/g, " ").trim();
  if (!flat) return "";

  for (let len = 8; len <= 40; len++) {
    const re = new RegExp(`(.{${len}})(\\1)+`, "g");
    flat = flat.replace(re, "$1");
  }
  flat = flat.replace(/([。！？；.!?])\1+/g, "$1").trim();

  if (flat.length > max) return `${flat.slice(0, max)}…`;
  return flat;
}
